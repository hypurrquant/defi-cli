import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createPublicClient, http, formatEther } from "viem";
import { requireChain } from "../utils.js";
import { resolveWalletWithSigner } from "../signer/resolve.js";

/**
 * Resolve the wallet address that all four configured paths can reach
 * (explicit --address, OWS vault via DEFI_WALLET_ADDRESS=ows:<name>,
 * DEFI_PRIVATE_KEY → derived address, or plain DEFI_WALLET_ADDRESS).
 *
 * Returns null instead of a string sentinel so machine consumers (--json /
 * --ndjson) can branch on the absence of a wallet without parsing
 * "(not set)".
 */
function resolveCurrentAddress(override?: string): { address: string | null; source: string } {
  if (override) return { address: override, source: "flag" };
  try {
    const { address, signer } = resolveWalletWithSigner();
    return { address, source: signer ? "ows" : (process.env["DEFI_PRIVATE_KEY"] ? "private_key" : "env") };
  } catch {
    return { address: null, source: "none" };
  }
}

export function registerWallet(parent: Command, getOpts: () => OutputMode): void {
  const wallet = parent.command("wallet").description("Wallet management");

  wallet
    .command("balance")
    .description("Show native token balance")
    .option("--address <address>", "Wallet address (defaults to OWS vault, DEFI_PRIVATE_KEY, or DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const { address: addr, source } = resolveCurrentAddress(opts.address);
      if (!addr) {
        printOutput({
          error: "No wallet configured. Set DEFI_WALLET_ADDRESS, set DEFI_PRIVATE_KEY, or pass --address.",
        }, getOpts());
        return;
      }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const balance = await client.getBalance({ address: addr as `0x${string}` });
      printOutput({
        chain: chain.name,
        address: addr,
        wallet_source: source,
        native_token: chain.native_token,
        balance_wei: balance,
        balance_formatted: formatEther(balance),
      }, getOpts());
    });

  wallet
    .command("address")
    .description("Show configured wallet address")
    .action(async () => {
      const { address, source } = resolveCurrentAddress();
      // Return null + source for machine consumers; the legacy "(not set)"
      // string sentinel was unparseable for JSON/NDJSON pipelines.
      printOutput({ address, source }, getOpts());
    });
}
