import type { Address } from "viem";
import { OwsEvmSigner } from "./ows-evm.js";

/**
 * Determine signing method: OWS vault, private key, or address-only.
 *
 * Priority:
 *   1. Explicit --wallet flag -> OWS signer
 *   2. DEFI_WALLET_ADDRESS starting with "ows:" -> OWS signer
 *   3. DEFI_PRIVATE_KEY -> derive address (signer = null, executor uses key directly)
 *   4. DEFI_WALLET_ADDRESS -> address-only (read-only / dry-run)
 */
export function resolveWalletWithSigner(
  opts?: { wallet?: string; passphrase?: string },
): { address: Address; signer: OwsEvmSigner | null } {
  // 1. Explicit --wallet flag
  if (opts?.wallet) {
    const signer = OwsEvmSigner.create(opts.wallet, opts.passphrase);
    return { address: signer.getAddress() as Address, signer };
  }

  // 2. DEFI_WALLET_ADDRESS with "ows:" prefix
  const envWallet = process.env["DEFI_WALLET_ADDRESS"];
  if (envWallet?.startsWith("ows:")) {
    const walletName = envWallet.slice(4);
    const signer = OwsEvmSigner.create(walletName);
    return { address: signer.getAddress() as Address, signer };
  }

  // 3. DEFI_PRIVATE_KEY -> derive address
  const pk = process.env["DEFI_PRIVATE_KEY"];
  if (pk) {
    // Dynamic import to avoid top-level dependency on viem/accounts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { privateKeyToAccount } = require("viem/accounts") as typeof import("viem/accounts");
    return { address: privateKeyToAccount(pk as `0x${string}`).address, signer: null };
  }

  // 4. Plain DEFI_WALLET_ADDRESS
  if (envWallet) {
    return { address: envWallet as Address, signer: null };
  }

  throw new Error(
    "No wallet configured. Use --wallet <name>, set DEFI_WALLET_ADDRESS, or set DEFI_PRIVATE_KEY",
  );
}
