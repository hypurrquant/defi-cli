import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createLiquidStaking } from "@hypurrquant/defi-protocols";

export function registerStaking(parent: Command, getOpts: () => OutputMode, executor: Executor): void {
  const staking = parent.command("staking").description("Liquid staking: stake, unstake, info");

  staking.command("stake")
    .description("Stake tokens via liquid staking")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--amount <amount>", "Amount in wei")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildStake({ protocol: protocol.name, amount: BigInt(opts.amount), recipient });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  staking.command("unstake")
    .description("Unstake tokens")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--amount <amount>", "Amount in wei")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildUnstake({ protocol: protocol.name, amount: BigInt(opts.amount), recipient });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  staking.command("info")
    .description("Show staking info and rates")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
      const info = await adapter.getInfo();
      printOutput(info, getOpts());
    });
}
