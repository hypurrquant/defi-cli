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

const COMET_ABI = parseAbi([
  "function getUtilization() external view returns (uint256)",
  "function getSupplyRate(uint256 utilization) external view returns (uint64)",
  "function getBorrowRate(uint256 utilization) external view returns (uint64)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrow() external view returns (uint256)",
  "function supply(address asset, uint256 amount) external",
  "function withdraw(address asset, uint256 amount) external",
]);

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

export class CompoundV3Adapter implements ILending {
  private readonly protocolName: string;
  private readonly comet: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const comet = contracts["comet_usdc"] ?? contracts["comet"] ?? contracts["comet_weth"];
    if (!comet) throw DefiError.contractError("Missing 'comet_usdc' or 'comet' address");
    this.comet = comet;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount],
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    // In Compound V3, borrow = withdraw base asset
    const data = encodeFunctionData({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    // In Compound V3, repay = supply base asset
    const data = encodeFunctionData({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount],
    });
    return {
      description: `[${this.protocolName}] Withdraw from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const utilization = await client.readContract({
      address: this.comet,
      abi: COMET_ABI,
      functionName: "getUtilization",
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] getUtilization failed: ${e}`); });

    const [supplyRate, borrowRate, totalSupply, totalBorrow] = await Promise.all([
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [utilization as bigint] }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] getSupplyRate failed: ${e}`); }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [utilization as bigint] }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] getBorrowRate failed: ${e}`); }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalBorrow" }).catch(() => 0n),
    ]);

    // Comet rates are per-second scaled by 1e18
    const supplyPerSec = Number(supplyRate) / 1e18;
    const borrowPerSec = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerSec * SECONDS_PER_YEAR * 100;
    const borrowApy = borrowPerSec * SECONDS_PER_YEAR * 100;
    const utilPct = Number(utilization as bigint) / 1e18 * 100;

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: utilPct,
      total_supply: totalSupply as bigint,
      total_borrow: totalBorrow as bigint,
    };
  }

  async getUserPosition(_user: Address): Promise<UserPosition> {
    throw DefiError.unsupported(
      `[${this.protocolName}] User position requires querying Comet balanceOf + borrowBalanceOf`,
    );
  }
}
