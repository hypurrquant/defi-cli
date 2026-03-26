import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGauge } from "@hypurrquant/defi-protocols";

function resolveAccount(): Address | undefined {
  const walletAddr = process.env["DEFI_WALLET_ADDRESS"];
  if (walletAddr) return walletAddr as Address;
  const privateKey = process.env["DEFI_PRIVATE_KEY"];
  if (privateKey) return privateKeyToAccount(privateKey as `0x${string}`).address;
  return undefined;
}

export function registerGauge(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const gauge = parent.command("gauge").description("Gauge operations: find, deposit, withdraw, claim, earned");

  gauge.command("find")
    .description("Find gauge address for a pool via voter contract")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pool <address>", "Pool address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, chain.effectiveRpcUrl());
      if (!adapter.resolveGauge) throw new Error(`${protocol.name} does not support gauge lookup`);
      const gaugeAddr = await adapter.resolveGauge(opts.pool as Address);
      printOutput({ pool: opts.pool, gauge: gaugeAddr, protocol: protocol.name }, getOpts());
    });

  gauge.command("earned")
    .description("Check pending rewards for a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, chain.effectiveRpcUrl());

      if (opts.tokenId) {
        if (!adapter.getPendingRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT rewards`);
        const earned = await adapter.getPendingRewardsByTokenId(opts.gauge as Address, BigInt(opts.tokenId));
        printOutput({ gauge: opts.gauge, token_id: opts.tokenId, earned: earned.toString() }, getOpts());
      } else {
        const account = resolveAccount();
        if (!account) throw new Error("DEFI_WALLET_ADDRESS or DEFI_PRIVATE_KEY required");
        const rewards = await adapter.getPendingRewards(opts.gauge as Address, account);
        printOutput(rewards.map(r => ({ token: r.token, amount: r.amount.toString() })), getOpts());
      }
    });

  gauge.command("deposit")
    .description("Deposit LP tokens or NFT into a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .option("--amount <amount>", "LP token amount in wei (for V2 gauges)")
    .option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, chain.effectiveRpcUrl());
      const amount = opts.amount ? BigInt(opts.amount) : 0n;
      const tokenId = opts.tokenId ? BigInt(opts.tokenId) : undefined;
      const tx = await adapter.buildDeposit(opts.gauge as Address, amount, tokenId);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  gauge.command("withdraw")
    .description("Withdraw LP tokens or NFT from a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .option("--amount <amount>", "LP token amount in wei (for V2 gauges)")
    .option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, chain.effectiveRpcUrl());
      const amount = opts.amount ? BigInt(opts.amount) : 0n;
      const tokenId = opts.tokenId ? BigInt(opts.tokenId) : undefined;
      const tx = await adapter.buildWithdraw(opts.gauge as Address, amount, tokenId);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  gauge.command("claim")
    .description("Claim earned rewards from a gauge")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--gauge <address>", "Gauge contract address")
    .option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createGauge(protocol, chain.effectiveRpcUrl());

      if (opts.tokenId) {
        if (!adapter.buildClaimRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT claim`);
        const tx = await adapter.buildClaimRewardsByTokenId(opts.gauge as Address, BigInt(opts.tokenId));
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
      } else {
        const account = resolveAccount();
        const tx = await adapter.buildClaimRewards(opts.gauge as Address, account);
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
      }
    });
}
