import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGauge } from "@hypurrquant/defi-protocols";

export function registerGauge(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const gauge = parent.command("gauge").description("Gauge operations: deposit LP, withdraw, claim rewards");

  gauge.command("deposit")
    .description("Deposit LP tokens into a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .requiredOption("--amount <amount>", "LP token amount in wei")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol);
      const tx = await adapter.buildDeposit(opts.gauge as Address, BigInt(opts.amount));
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  gauge.command("withdraw")
    .description("Withdraw LP tokens from a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .requiredOption("--amount <amount>", "LP token amount in wei")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol);
      const tx = await adapter.buildWithdraw(opts.gauge as Address, BigInt(opts.amount));
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  gauge.command("claim")
    .description("Claim earned rewards from a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, executor.rpcUrl);
      const privateKey = process.env["DEFI_PRIVATE_KEY"];
      const account = privateKey
        ? privateKeyToAccount(privateKey as `0x${string}`).address
        : undefined;
      const tx = await adapter.buildClaimRewards(opts.gauge as Address, account);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
