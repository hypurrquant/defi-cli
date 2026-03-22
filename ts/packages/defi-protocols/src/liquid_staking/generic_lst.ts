import { parseAbi, encodeFunctionData } from "viem";
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

const GENERIC_LST_ABI = parseAbi([
  "function stake() external payable returns (uint256)",
  "function unstake(uint256 amount) external returns (uint256)",
]);

export class GenericLstAdapter implements ILiquidStaking {
  private readonly protocolName: string;
  private readonly staking: Address;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract");
    this.staking = staking;
  }

  name(): string {
    return this.protocolName;
  }

  async buildStake(params: StakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({ abi: GENERIC_LST_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 200_000,
    };
  }

  async buildUnstake(params: UnstakeParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: GENERIC_LST_ABI,
      functionName: "unstake",
      args: [params.amount],
    });
    return {
      description: `[${this.protocolName}] Unstake ${params.amount}`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async getInfo(): Promise<StakingInfo> {
    throw DefiError.unsupported(`[${this.protocolName}] getInfo requires RPC`);
  }
}
