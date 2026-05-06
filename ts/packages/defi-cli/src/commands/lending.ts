import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { InterestRateMode } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { createLending } from "@hypurrquant/defi-protocols";
import { resolveContext, resolveTokenAddress, resolveWallet } from "../utils.js";

/**
 * Accept "max" / "all" (case-insensitive) as a sentinel for type(uint256).max
 * — the well-known Aave V3 / Compound V2 convention for "withdraw all" /
 * "repay all" / unlimited approve. Without this carve-out, BigInt("max")
 * throws SyntaxError and the CLI surfaces a confusing
 * `Cannot convert max to a BigInt` error.
 *
 * Mirrors `commands/token.ts approve --amount max`, which has supported
 * this since the SSOT 7.x baseline; lending lagged behind.
 */
function parseAmount(s: string): bigint {
  const lower = s.toLowerCase();
  if (lower === "max" || lower === "all") return maxUint256;
  return BigInt(s);
}

export function registerLending(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lending = parent.command("lending").description("Lending operations: supply, borrow, repay, withdraw, rates, position");

  lending.command("rates")
    .description("Show current lending rates")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .action(async (opts) => {
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const rates = await adapter.getRates(asset);
      printOutput(rates, getOpts());
    });

  lending.command("position")
    .description("Show current lending position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const address = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!address) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, getOpts()); return; }
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const position = await adapter.getUserPosition(address);
      printOutput(position, getOpts());
    });

  lending.command("supply")
    .description("Supply an asset to a lending protocol")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount to supply in wei (or 'max')")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildSupply({ protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount), on_behalf_of: onBehalfOf });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("borrow")
    .description("Borrow an asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--rate-mode <mode>", "variable or stable", "variable")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildBorrow({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount),
        interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
        on_behalf_of: onBehalfOf,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("repay")
    .description("Repay a borrowed asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--rate-mode <mode>", "variable or stable", "variable")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildRepay({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount),
        interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
        on_behalf_of: onBehalfOf,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("withdraw")
    .description("Withdraw a supplied asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--to <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const to = resolveWallet(opts.to);
      const tx = await adapter.buildWithdraw({ protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount), to });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
