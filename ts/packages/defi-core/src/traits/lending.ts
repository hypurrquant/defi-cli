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

  /**
   * Optional — toggle whether a supplied reserve is used as collateral.
   * Aave V3 surfaces this as `Pool.setUserUseReserveAsCollateral(asset,
   * useAsCollateral)`. Required before borrowing against an isolation-mode
   * reserve, and required before withdrawing the last collateral if the
   * user has open debt. Adapters that don't expose a separate toggle
   * (Compound V2's `Comptroller.enterMarkets/exitMarket`, Morpho Blue's
   * per-market authorize) can leave this undefined.
   */
  buildSetUseReserveAsCollateral?(asset: Address, useAsCollateral: boolean): Promise<DeFiTx>;

  /**
   * Optional — enroll the user in an Aave V3 efficiency-mode (eMode)
   * category. Pass `categoryId = 0` to opt out. Adapters without an
   * eMode concept leave this undefined.
   */
  buildSetEMode?(categoryId: number): Promise<DeFiTx>;
}
