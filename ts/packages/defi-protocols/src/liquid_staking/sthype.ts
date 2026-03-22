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

const STHYPE_ABI = parseAbi([
  "function submit(address referral) external payable returns (uint256)",
  "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)",
]);

const ERC20_ABI = parseAbi([
  "function totalSupply() external view returns (uint256)",
]);

export class StHypeAdapter implements ILiquidStaking {
  private readonly protocolName: string;
  private readonly staking: Address;
  private readonly sthypeToken?: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract");
    this.staking = staking;
    this.sthypeToken = entry.contracts?.["sthype_token"];
  }

  name(): string {
    return this.protocolName;
  }

  async buildStake(params: StakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: STHYPE_ABI,
      functionName: "submit",
      args: [zeroAddress as Address],
    });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for stHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 200_000,
    };
  }

  async buildUnstake(params: UnstakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: STHYPE_ABI,
      functionName: "requestWithdrawals",
      args: [[params.amount], params.recipient],
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} stHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async getInfo(): Promise<StakingInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const tokenAddr = this.sthypeToken ?? this.staking;

    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
    }) as bigint;

    return {
      protocol: this.protocolName,
      staked_token: zeroAddress as Address,
      liquid_token: tokenAddr,
      exchange_rate: 1.0,
      total_staked: totalSupply,
    };
  }
}
