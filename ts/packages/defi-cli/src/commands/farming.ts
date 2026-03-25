import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKittenSwapFarming } from "@hypurrquant/defi-protocols";

export function registerFarming(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const farming = parent
    .command("farming")
    .description("Algebra eternal farming operations (KittenSwap): enter, exit, collect rewards, claim, discover");

  farming
    .command("enter")
    .description("Enter farming: stake an NFT position to start earning rewards")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .requiredOption("--pool <address>", "Pool address")
    .requiredOption("--token-id <id>", "NFT position token ID")
    .option("--owner <address>", "Owner address to receive claimed rewards (defaults to DEFI_WALLET_ADDRESS or private key address)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const owner = resolveOwner(opts.owner);
      const tx = await adapter.buildEnterFarming(
        BigInt(opts.tokenId),
        opts.pool as Address,
        owner,
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farming
    .command("exit")
    .description("Exit farming: unstake an NFT position")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .requiredOption("--pool <address>", "Pool address")
    .requiredOption("--token-id <id>", "NFT position token ID")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const tx = await adapter.buildExitFarming(
        BigInt(opts.tokenId),
        opts.pool as Address,
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farming
    .command("rewards")
    .description("Collect + claim farming rewards for a staked position (collectRewards + claimReward multicall)")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .requiredOption("--pool <address>", "Pool address")
    .requiredOption("--token-id <id>", "NFT position token ID")
    .option("--owner <address>", "Owner address to receive claimed rewards (defaults to DEFI_WALLET_ADDRESS or private key address)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const owner = resolveOwner(opts.owner);
      const tx = await adapter.buildCollectRewards(
        BigInt(opts.tokenId),
        opts.pool as Address,
        owner,
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farming
    .command("claim")
    .description("Claim accumulated farming rewards (KITTEN + WHYPE) without changing position")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .option("--owner <address>", "Owner address to receive rewards (defaults to DEFI_WALLET_ADDRESS or private key address)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const owner = resolveOwner(opts.owner);
      const tx = await adapter.buildClaimReward(owner);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farming
    .command("pending")
    .description("Query pending farming rewards for a position (read-only)")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .requiredOption("--pool <address>", "Pool address")
    .requiredOption("--token-id <id>", "NFT position token ID")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const rewards = await adapter.getPendingRewards(
        BigInt(opts.tokenId),
        opts.pool as Address,
      );
      printOutput(
        {
          tokenId: opts.tokenId,
          pool: opts.pool,
          reward_kitten: rewards.reward.toString(),
          bonus_reward_whype: rewards.bonusReward.toString(),
        },
        getOpts(),
      );
    });

  farming
    .command("discover")
    .description("Discover all pools with active KittenSwap farming incentives")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createKittenSwapFarming(protocol, rpcUrl);
      const pools = await adapter.discoverFarmingPools();
      const output = pools.map((p) => ({
        pool: p.pool,
        nonce: p.key.nonce.toString(),
        total_reward: p.totalReward.toString(),
        bonus_reward: p.bonusReward.toString(),
        active: p.active,
      }));
      printOutput(output, getOpts());
    });
}

/** Resolve owner address from CLI option, env vars, or private key */
function resolveOwner(optOwner?: string): Address {
  if (optOwner) return optOwner as Address;

  const walletAddr = process.env["DEFI_WALLET_ADDRESS"];
  if (walletAddr) return walletAddr as Address;

  const privateKey = process.env["DEFI_PRIVATE_KEY"];
  if (privateKey) {
    return privateKeyToAccount(privateKey as `0x${string}`).address;
  }

  throw new Error(
    "--owner, DEFI_WALLET_ADDRESS, or DEFI_PRIVATE_KEY is required to resolve reward recipient",
  );
}
