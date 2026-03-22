import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createDex } from "@hypurrquant/defi-protocols";

export function registerDex(parent: Command, getOpts: () => OutputMode, executor: Executor): void {
  const dex = parent.command("dex").description("DEX operations: swap, quote, compare");

  dex.command("quote")
    .description("Get a swap quote without executing")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-in <token>", "Input token symbol or address")
    .requiredOption("--token-out <token>", "Output token symbol or address")
    .requiredOption("--amount <amount>", "Amount of input token in wei")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn as Address : registry.resolveToken(chainName, opts.tokenIn).address as Address;
      const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut as Address : registry.resolveToken(chainName, opts.tokenOut).address as Address;
      const result = await adapter.quote({ protocol: protocol.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(opts.amount) });
      printOutput(result, getOpts());
    });

  dex.command("swap")
    .description("Execute a token swap")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-in <token>", "Input token")
    .requiredOption("--token-out <token>", "Output token")
    .requiredOption("--amount <amount>", "Amount in wei")
    .option("--slippage <bps>", "Slippage tolerance in bps", "50")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn as Address : registry.resolveToken(chainName, opts.tokenIn).address as Address;
      const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut as Address : registry.resolveToken(chainName, opts.tokenOut).address as Address;
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildSwap({
        protocol: protocol.name, token_in: tokenIn, token_out: tokenOut,
        amount_in: BigInt(opts.amount), slippage: { bps: parseInt(opts.slippage) }, recipient,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  dex.command("compare")
    .description("Compare quotes across DEXes")
    .requiredOption("--token-in <token>", "Input token")
    .requiredOption("--token-out <token>", "Output token")
    .requiredOption("--amount <amount>", "Amount in wei")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn as Address : registry.resolveToken(chainName, opts.tokenIn).address as Address;
      const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut as Address : registry.resolveToken(chainName, opts.tokenOut).address as Address;
      const dexProtocols = registry.getProtocolsByCategory("dex" as any).filter(p => p.chain === chainName);
      const results: Array<{ protocol: string; amount_out: bigint; error?: string }> = [];
      await Promise.all(dexProtocols.map(async (p) => {
        try {
          const adapter = createDex(p, chain.effectiveRpcUrl());
          const q = await adapter.quote({ protocol: p.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(opts.amount) });
          results.push({ protocol: p.name, amount_out: q.amount_out });
        } catch (e) { results.push({ protocol: p.name, amount_out: 0n, error: e instanceof Error ? e.message : String(e) }); }
      }));
      results.sort((a, b) => (b.amount_out > a.amount_out ? 1 : -1));
      printOutput({ chain: chainName, quotes: results }, getOpts());
    });
}
