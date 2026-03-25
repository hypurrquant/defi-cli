import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGauge } from "@hypurrquant/defi-protocols";

export function registerGauge(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const gauge = parent.command("gauge").description("Gauge operations: deposit, withdraw, claim, lock, vote (ve(3,3))");

  gauge.command("deposit")
    .description("Deposit LP tokens into a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .requiredOption("--amount <amount>", "LP token amount in wei")
    .option("--ve-nft <tokenId>", "veNFT token ID for boosted rewards")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol);
      const tokenId = opts.veNft ? BigInt(opts.veNft) : undefined;
      const tx = await adapter.buildDeposit(opts.gauge as Address, BigInt(opts.amount), tokenId);
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

  gauge.command("lock")
    .description("Create a veNFT lock")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--amount <amount>", "Amount to lock in wei")
    .option("--days <days>", "Lock duration in days", "365")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol);
      const tx = await adapter.buildCreateLock(BigInt(opts.amount), parseInt(opts.days) * 86400);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  gauge.command("vote")
    .description("Vote on gauge emissions with veNFT")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--ve-nft <tokenId>", "veNFT token ID")
    .requiredOption("--pools <pools>", "Pool addresses (comma-separated)")
    .requiredOption("--weights <weights>", "Vote weights (comma-separated)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol);
      const pools = opts.pools.split(",") as Address[];
      const weights = opts.weights.split(",").map((w: string) => BigInt(w));
      const tx = await adapter.buildVote(BigInt(opts.veNft), pools, weights);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
