import type { Address } from "viem";
import type { YieldInfo, DeFiTx } from "../types.js";

export interface IYieldSource {
  name(): string;
  getYields(): Promise<YieldInfo[]>;
  buildDeposit(pool: string, amount: bigint, recipient: Address): Promise<DeFiTx>;
  buildWithdraw(pool: string, amount: bigint, recipient: Address): Promise<DeFiTx>;
}
