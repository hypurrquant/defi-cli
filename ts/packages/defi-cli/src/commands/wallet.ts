import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createPublicClient, http, formatEther } from "viem";
import { requireChain } from "../utils.js";

export function registerWallet(parent: Command, getOpts: () => OutputMode): void {
  const wallet = parent.command("wallet").description("Wallet management");

  wallet
    .command("balance")
    .description("Show native token balance")
    .requiredOption("--address <address>", "Wallet address to query")
    .action(async (opts) => {
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const balance = await client.getBalance({ address: opts.address as `0x${string}` });
      printOutput({
        chain: chain.name,
        address: opts.address,
        native_token: chain.native_token,
        balance_wei: balance,
        balance_formatted: formatEther(balance),
      }, getOpts());
    });

  wallet
    .command("address")
    .description("Show configured wallet address")
    .action(async () => {
      const addr = process.env.DEFI_WALLET_ADDRESS ?? "(not set)";
      printOutput({ address: addr }, getOpts());
    });
}
