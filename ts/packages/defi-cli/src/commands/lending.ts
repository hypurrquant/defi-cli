import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { InterestRateMode } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createLending } from "@hypurrquant/defi-protocols";
import { resolveContext, resolveTokenAddress, resolveWallet } from "../utils.js";

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
    .requiredOption("--address <address>", "Wallet address to query")
    .action(async (opts) => {
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const position = await adapter.getUserPosition(opts.address as Address);
      printOutput(position, getOpts());
    });

  lending.command("supply")
    .description("Supply an asset to a lending protocol")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount to supply in wei")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildSupply({ protocol: ctx.protocol!.name, asset, amount: BigInt(opts.amount), on_behalf_of: onBehalfOf });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("borrow")
    .description("Borrow an asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei")
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
        protocol: ctx.protocol!.name, asset, amount: BigInt(opts.amount),
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
    .requiredOption("--amount <amount>", "Amount in wei")
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
        protocol: ctx.protocol!.name, asset, amount: BigInt(opts.amount),
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
    .requiredOption("--amount <amount>", "Amount in wei")
    .option("--to <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const to = resolveWallet(opts.to);
      const tx = await adapter.buildWithdraw({ protocol: ctx.protocol!.name, asset, amount: BigInt(opts.amount), to });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
