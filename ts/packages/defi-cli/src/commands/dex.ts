import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createDex } from "@hypurrquant/defi-protocols";

export function registerDex(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const dex = parent.command("dex").description("DEX LP operations: add/remove liquidity");

  dex.command("lp-add")
    .description("Add liquidity to a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-a <token>", "First token symbol or address")
    .requiredOption("--token-b <token>", "Second token symbol or address")
    .requiredOption("--amount-a <amount>", "Amount of token A in wei")
    .requiredOption("--amount-b <amount>", "Amount of token B in wei")
    .option("--recipient <address>", "Recipient address")
    .option("--tick-lower <tick>", "Lower tick for concentrated LP (default: full range)")
    .option("--tick-upper <tick>", "Upper tick for concentrated LP (default: full range)")
    .option("--range <percent>", "±N% concentrated range around current price (e.g. --range 2 for ±2%)")
    .option("--pool <name_or_address>", "Pool name (e.g. WHYPE/USDC) or address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tokenA = opts.tokenA.startsWith("0x") ? opts.tokenA as Address : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x") ? opts.tokenB as Address : registry.resolveToken(chainName, opts.tokenB).address as Address;
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;

      // Resolve pool: name (WHYPE/USDC) → address from config, or raw address
      let poolAddr: Address | undefined;
      if (opts.pool) {
        if (opts.pool.startsWith("0x")) {
          poolAddr = opts.pool as Address;
        } else {
          const poolInfo = registry.resolvePool(opts.protocol, opts.pool);
          poolAddr = poolInfo.address;
        }
      }

      const tx = await adapter.buildAddLiquidity({
        protocol: protocol.name,
        token_a: tokenA,
        token_b: tokenB,
        amount_a: BigInt(opts.amountA),
        amount_b: BigInt(opts.amountB),
        recipient,
        tick_lower: opts.tickLower !== undefined ? parseInt(opts.tickLower) : undefined,
        tick_upper: opts.tickUpper !== undefined ? parseInt(opts.tickUpper) : undefined,
        range_pct: opts.range !== undefined ? parseFloat(opts.range) : undefined,
        pool: poolAddr,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  dex.command("lp-remove")
    .description("Remove liquidity from a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-a <token>", "First token symbol or address")
    .requiredOption("--token-b <token>", "Second token symbol or address")
    .requiredOption("--liquidity <amount>", "Liquidity amount to remove in wei")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tokenA = opts.tokenA.startsWith("0x") ? opts.tokenA as Address : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x") ? opts.tokenB as Address : registry.resolveToken(chainName, opts.tokenB).address as Address;
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildRemoveLiquidity({
        protocol: protocol.name,
        token_a: tokenA,
        token_b: tokenB,
        liquidity: BigInt(opts.liquidity),
        recipient,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
