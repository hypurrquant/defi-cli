import type { Address } from "viem";
import type { VaultInfo, DeFiTx } from "../types.js";

/** ERC-4626 Vault interface — covers Capital Allocators, Yield Aggregators, and Yield vaults */
export interface IVault {
  name(): string;
  buildDeposit(assets: bigint, receiver: Address): Promise<DeFiTx>;
  buildWithdraw(assets: bigint, receiver: Address, owner: Address): Promise<DeFiTx>;
  totalAssets(): Promise<bigint>;
  convertToShares(assets: bigint): Promise<bigint>;
  convertToAssets(shares: bigint): Promise<bigint>;
  getVaultInfo(): Promise<VaultInfo>;
}
