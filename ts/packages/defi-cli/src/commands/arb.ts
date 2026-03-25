import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createDex } from "@hypurrquant/defi-protocols";
import type { Address } from "viem";

export function registerArb(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  parent
    .command("arb")
    .description("Detect arbitrage opportunities across DEXes")
    .option("--token-in <token>", "Base token (default: WHYPE)", "WHYPE")
    .option("--token-out <token>", "Quote token (default: USDC)", "USDC")
    .option("--amount <amount>", "Test amount in wei", "1000000000000000000")
    .option("--execute", "Execute best arb (default: analysis only)")
    .option("--min-profit <bps>", "Min profit in bps to execute", "10")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();

      const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn as Address : registry.resolveToken(chainName, opts.tokenIn).address as Address;
      const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut as Address : registry.resolveToken(chainName, opts.tokenOut).address as Address;
      const amountIn = BigInt(opts.amount);

      const dexProtocols = registry.getProtocolsByCategory("dex" as any).filter(p => p.chain === chainName);
      const quotes: Array<{ protocol: string; buy: bigint; sell: bigint; profit_bps: number }> = [];

      for (const p of dexProtocols) {
        try {
          const adapter = createDex(p, rpcUrl);
          const buyQuote = await adapter.quote({ protocol: p.name, token_in: tokenIn, token_out: tokenOut, amount_in: amountIn });
          if (buyQuote.amount_out === 0n) continue;
          const sellQuote = await adapter.quote({ protocol: p.name, token_in: tokenOut, token_out: tokenIn, amount_in: buyQuote.amount_out });
          const profitBps = Number((sellQuote.amount_out - amountIn) * 10000n / amountIn);
          quotes.push({ protocol: p.name, buy: buyQuote.amount_out, sell: sellQuote.amount_out, profit_bps: profitBps });
        } catch { /* skip unsupported */ }
      }

      // Cross-DEX arb: buy on cheapest, sell on most expensive
      const opportunities: Array<{ buy_on: string; sell_on: string; profit_bps: number }> = [];
      for (let i = 0; i < quotes.length; i++) {
        for (let j = 0; j < quotes.length; j++) {
          if (i === j) continue;
          const buyAmount = quotes[i].buy;
          const sellAmount = quotes[j].sell;
          if (sellAmount > amountIn) {
            const profitBps = Number((sellAmount - amountIn) * 10000n / amountIn);
            opportunities.push({ buy_on: quotes[i].protocol, sell_on: quotes[j].protocol, profit_bps: profitBps });
          }
        }
      }
      opportunities.sort((a, b) => b.profit_bps - a.profit_bps);

      printOutput({
        chain: chainName, token_in: tokenIn, token_out: tokenOut,
        amount_in: amountIn, single_dex: quotes, cross_dex_opportunities: opportunities.slice(0, 5),
      }, getOpts());
    });
}
