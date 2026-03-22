import { createPublicClient, http, parseAbi, encodeFunctionData, zeroAddress } from "viem";
import type { Address } from "viem";
import type { ILiquidStaking } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type StakeParams,
  type UnstakeParams,
  type StakingInfo,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const KINETIQ_ABI = parseAbi([
  "function stake() external payable returns (uint256)",
  "function requestUnstake(uint256 amount) external returns (uint256)",
  "function totalStaked() external view returns (uint256)",
]);

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
]);

// WHYPE address on HyperEVM
const WHYPE: Address = "0x5555555555555555555555555555555555555555";
// HyperLend oracle address (Aave V3 compatible)
const HYPERLEND_ORACLE: Address = "0xc9fb4fbe842d57ea1df3e641a281827493a63030";

export class KinetiqAdapter implements ILiquidStaking {
  private readonly protocolName: string;
  private readonly staking: Address;
  private readonly liquidToken: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract address");
    this.staking = staking;
    this.liquidToken = entry.contracts?.["khype_token"] ?? staking;
  }

  name(): string {
    return this.protocolName;
  }

  async buildStake(params: StakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({ abi: KINETIQ_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 300_000,
    };
  }

  async buildUnstake(params: UnstakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: KINETIQ_ABI,
      functionName: "requestUnstake",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} kHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async getInfo(): Promise<StakingInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const totalStaked = await client.readContract({
      address: this.staking,
      abi: KINETIQ_ABI,
      functionName: "totalStaked",
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalStaked failed: ${e}`);
    }) as bigint;

    const [khypePrice, hypePrice] = await Promise.all([
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI, functionName: "getAssetPrice", args: [this.liquidToken] }).catch(() => 0n),
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI, functionName: "getAssetPrice", args: [WHYPE] }).catch(() => 0n),
    ]);

    const rateF64 =
      (hypePrice as bigint) > 0n && (khypePrice as bigint) > 0n
        ? Number((khypePrice as bigint) * 10n ** 18n / (hypePrice as bigint)) / 1e18
        : 1.0;

    return {
      protocol: this.protocolName,
      staked_token: zeroAddress as Address,
      liquid_token: this.liquidToken,
      exchange_rate: rateF64,
      total_staked: totalStaked,
    };
  }
}
