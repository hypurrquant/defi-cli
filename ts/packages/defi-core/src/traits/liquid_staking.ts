import type { StakeParams, UnstakeParams, StakingInfo, DeFiTx } from "../types.js";

export interface ILiquidStaking {
  name(): string;
  buildStake(params: StakeParams): Promise<DeFiTx>;
  buildUnstake(params: UnstakeParams): Promise<DeFiTx>;
  getInfo(): Promise<StakingInfo>;
}
