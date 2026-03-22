import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";

const LIFI_API = "https://li.quest/v1";

export function registerBridge(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("bridge")
    .description("Cross-chain bridge: move assets between chains (LI.FI)")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei")
    .requiredOption("--to-chain <chain>", "Destination chain name")
    .option("--recipient <address>", "Recipient address on destination chain")
    .option("--slippage <bps>", "Slippage in bps", "50")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const fromChain = registry.getChain(chainName);
      const toChain = registry.getChain(opts.toChain);
      const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
      const sender = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;

      try {
        const params = new URLSearchParams({
          fromChain: String(fromChain.chain_id), toChain: String(toChain.chain_id),
          fromToken: tokenAddr, toToken: tokenAddr,
          fromAmount: opts.amount, fromAddress: sender,
          slippage: String(parseInt(opts.slippage) / 10000),
        });
        const res = await fetch(`${LIFI_API}/quote?${params}`);
        const quote = await res.json() as any;

        if (quote.transactionRequest) {
          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: tokenAddr, amount: opts.amount,
            bridge: quote.toolDetails?.name ?? "LI.FI",
            estimated_output: quote.estimate?.toAmount,
            tx: { to: quote.transactionRequest.to, data: quote.transactionRequest.data, value: quote.transactionRequest.value },
          }, getOpts());
        } else {
          printOutput({ error: "No LI.FI route found", details: quote }, getOpts());
        }
      } catch (e) {
        printOutput({ error: `LI.FI API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
      }
    });
}
