import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry, InterestRateMode } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createLending } from "@hypurrquant/defi-protocols";

export function registerLending(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lending = parent.command("lending").description("Lending operations: supply, borrow, repay, withdraw, rates, position");

  lending.command("rates")
    .description("Show current lending rates")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const asset = opts.asset.startsWith("0x") ? opts.asset as Address : registry.resolveToken(chainName, opts.asset).address as Address;
      const rates = await adapter.getRates(asset);
      printOutput(rates, getOpts());
    });

  lending.command("position")
    .description("Show current lending position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--address <address>", "Wallet address to query")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
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
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const asset = opts.asset.startsWith("0x") ? opts.asset as Address : registry.resolveToken(chainName, opts.asset).address as Address;
      const onBehalfOf = (opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildSupply({ protocol: protocol.name, asset, amount: BigInt(opts.amount), on_behalf_of: onBehalfOf });
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
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const asset = opts.asset.startsWith("0x") ? opts.asset as Address : registry.resolveToken(chainName, opts.asset).address as Address;
      const onBehalfOf = (opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildBorrow({
        protocol: protocol.name, asset, amount: BigInt(opts.amount),
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
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const asset = opts.asset.startsWith("0x") ? opts.asset as Address : registry.resolveToken(chainName, opts.asset).address as Address;
      const onBehalfOf = (opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildRepay({
        protocol: protocol.name, asset, amount: BigInt(opts.amount),
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
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const asset = opts.asset.startsWith("0x") ? opts.asset as Address : registry.resolveToken(chainName, opts.asset).address as Address;
      const to = (opts.to ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildWithdraw({ protocol: protocol.name, asset, amount: BigInt(opts.amount), to });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
