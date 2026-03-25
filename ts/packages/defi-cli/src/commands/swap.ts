import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";

const ODOS_API = "https://api.odos.xyz";

export function registerSwap(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  parent
    .command("swap")
    .description("Aggregator swap: best price across all DEXes (ODOS)")
    .requiredOption("--token-in <token>", "Input token symbol or address")
    .requiredOption("--token-out <token>", "Output token symbol or address")
    .requiredOption("--amount <amount>", "Amount of input token in wei")
    .option("--slippage <bps>", "Slippage tolerance in basis points", "50")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn as Address : registry.resolveToken(chainName, opts.tokenIn).address as Address;
      const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut as Address : registry.resolveToken(chainName, opts.tokenOut).address as Address;
      const sender = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;

      try {
        const quoteRes = await fetch(`${ODOS_API}/sor/quote/v2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId: chain.chain_id, inputTokens: [{ tokenAddress: tokenIn, amount: opts.amount }],
            outputTokens: [{ tokenAddress: tokenOut, proportion: 1 }],
            slippageLimitPercent: parseInt(opts.slippage) / 100, userAddr: sender,
          }),
        });
        const quote = await quoteRes.json() as any;
        if (!quote.pathId) { printOutput({ error: "No ODOS route found", quote }, getOpts()); return; }

        const assembleRes = await fetch(`${ODOS_API}/sor/assemble`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pathId: quote.pathId, userAddr: sender }),
        });
        const assembled = await assembleRes.json() as Record<string, Record<string, string>>;

        if (assembled.transaction) {
          const tx = {
            description: `ODOS swap ${tokenIn} → ${tokenOut}`,
            to: assembled.transaction.to as Address,
            data: assembled.transaction.data as `0x${string}`,
            value: BigInt(assembled.transaction.value ?? 0),
          };
          const result = await executor.execute(tx);
          printOutput({ ...result, odos_quote: quote }, getOpts());
        } else {
          printOutput({ error: "ODOS assembly failed", assembled }, getOpts());
        }
      } catch (e) {
        printOutput({ error: `ODOS API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
      }
    });
}
