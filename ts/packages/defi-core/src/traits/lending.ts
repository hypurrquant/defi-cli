import type { Address } from "viem";
import type {
  SupplyParams,
  BorrowParams,
  RepayParams,
  WithdrawParams,
  LendingRates,
  UserPosition,
  DeFiTx,
} from "../types.js";

export interface ILending {
  name(): string;
  buildSupply(params: SupplyParams): Promise<DeFiTx>;
  buildBorrow(params: BorrowParams): Promise<DeFiTx>;
  buildRepay(params: RepayParams): Promise<DeFiTx>;
  buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
  getRates(asset: Address): Promise<LendingRates>;
  getUserPosition(user: Address): Promise<UserPosition>;
}
