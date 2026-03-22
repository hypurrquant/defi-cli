import type { Address } from "viem";
import type { VaultInfo, DeFiTx } from "../types.js";

export interface IYieldAggregator {
  name(): string;
  getVaults(): Promise<VaultInfo[]>;
  buildDeposit(vault: Address, amount: bigint, recipient: Address): Promise<DeFiTx>;
  buildWithdraw(vault: Address, amount: bigint, recipient: Address, owner: Address): Promise<DeFiTx>;
}
