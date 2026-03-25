import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createMasterChef, MasterChefAdapter } from "@hypurrquant/defi-protocols";

export function registerFarm(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const farm = parent.command("farm").description("LP farm operations: deposit, withdraw, claim rewards (MasterChef)");

  farm.command("deposit")
    .description("Deposit LP tokens into a MasterChef farm")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pid <pid>", "Farm pool ID")
    .requiredOption("--amount <amount>", "LP token amount in wei")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMasterChef(protocol, rpcUrl);
      const tx = await adapter.buildDeposit(
        protocol.contracts?.["masterchef"] as Address,
        BigInt(opts.amount),
        BigInt(opts.pid),
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farm.command("withdraw")
    .description("Withdraw LP tokens from a MasterChef farm")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pid <pid>", "Farm pool ID")
    .requiredOption("--amount <amount>", "LP token amount in wei")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMasterChef(protocol, rpcUrl);
      const tx = await (adapter as MasterChefAdapter).buildWithdrawPid(
        BigInt(opts.pid),
        BigInt(opts.amount),
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farm.command("claim")
    .description("Claim pending rewards from a MasterChef farm")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pid <pid>", "Farm pool ID")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMasterChef(protocol, rpcUrl);
      const tx = await (adapter as MasterChefAdapter).buildClaimRewardsPid(
        BigInt(opts.pid),
      );
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  farm.command("info")
    .description("Show pending rewards and farm info")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--pid <pid>", "Farm pool ID (optional)")
    .option("--address <address>", "Wallet address to query (defaults to DEFI_WALLET_ADDRESS env)")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "hyperevm");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMasterChef(protocol, rpcUrl);
      const walletAddress = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!walletAddress) {
        throw new Error("--address or DEFI_WALLET_ADDRESS required");
      }
      const masterchef = protocol.contracts?.["masterchef"] as Address;
      const rewards = await adapter.getPendingRewards(masterchef, walletAddress);
      printOutput(rewards, getOpts());
    });
}
