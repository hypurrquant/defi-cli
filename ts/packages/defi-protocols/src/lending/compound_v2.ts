import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const CTOKEN_ABI = parseAbi([
  "function underlying() external view returns (address)",
  "function supplyRatePerBlock() external view returns (uint256)",
  "function borrowRatePerBlock() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function mint(uint256 mintAmount) external returns (uint256)",
  "function redeem(uint256 redeemTokens) external returns (uint256)",
  "function borrow(uint256 borrowAmount) external returns (uint256)",
  "function repayBorrow(uint256 repayAmount) external returns (uint256)",
]);

// ~3s blocks on BSC
const BSC_BLOCKS_PER_YEAR = 10_512_000;

export class CompoundV2Adapter implements ILending {
  private readonly protocolName: string;
  private readonly defaultVtoken: Address;
  private readonly vTokenCandidates: Address[];
  private readonly rpcUrl?: string;
  // Lazy cache: underlying asset address (lowercased) → vToken address
  private vTokenByAsset: Map<string, Address> | null = null;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const vtoken =
      contracts["vusdt"] ??
      contracts["vusdc"] ??
      contracts["vbnb"] ??
      contracts["comptroller"];
    if (!vtoken) throw DefiError.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
    // Collect all keys that look like vTokens (`v<symbol>`) — used by getRates
    // to resolve the per-asset market. Falls back to defaultVtoken if empty.
    this.vTokenCandidates = Object.entries(contracts)
      .filter(([k]) => /^v[a-z][a-z0-9]*$/i.test(k))
      .map(([, v]) => v as Address);
    if (this.vTokenCandidates.length === 0) this.vTokenCandidates = [vtoken];
  }

  private async resolveVtoken(asset: Address): Promise<Address | null> {
    if (!this.rpcUrl) return null;
    if (!this.vTokenByAsset) {
      const client = createPublicClient({ transport: http(this.rpcUrl) });
      const map = new Map<string, Address>();
      const lookups = await Promise.allSettled(
        this.vTokenCandidates.map(async (v) => {
          const u = await client.readContract({ address: v, abi: CTOKEN_ABI, functionName: "underlying" }) as Address;
          return [u.toLowerCase(), v] as const;
        }),
      );
      for (const r of lookups) {
        if (r.status === "fulfilled") map.set(r.value[0], r.value[1]);
      }
      this.vTokenByAsset = map;
    }
    return this.vTokenByAsset.get(asset.toLowerCase()) ?? null;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: CTOKEN_ABI,
      functionName: "mint",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: CTOKEN_ABI,
      functionName: "borrow",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: CTOKEN_ABI,
      functionName: "repayBorrow",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: CTOKEN_ABI,
      functionName: "redeem",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Withdraw from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // Resolve the vToken whose underlying() matches the requested asset.
    // Compound V2 forks (Venus etc.) have a separate vToken per asset; using a
    // single default vToken contaminates cross-asset yield scans.
    const vtoken = await this.resolveVtoken(asset);
    if (!vtoken) {
      return {
        protocol: this.protocolName,
        asset,
        supply_apy: 0,
        borrow_variable_apy: 0,
        utilization: 0,
        total_supply: 0n,
        total_borrow: 0n,
      };
    }

    const [supplyRate, borrowRate, totalSupply, totalBorrows] = await Promise.all([
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`); }),
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`); }),
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "totalBorrows" }).catch(() => 0n),
    ]);

    const supplyPerBlock = Number(supplyRate) / 1e18;
    const borrowPerBlock = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const borrowApy = borrowPerBlock * BSC_BLOCKS_PER_YEAR * 100;

    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? (borrowF / supplyF) * 100 : 0;

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply as bigint,
      total_borrow: totalBorrows as bigint,
    };
  }

  async getUserPosition(_user: Address): Promise<UserPosition> {
    throw DefiError.unsupported(
      `[${this.protocolName}] User position requires querying individual vToken balances`,
    );
  }
}
