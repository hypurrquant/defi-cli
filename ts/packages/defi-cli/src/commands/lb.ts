import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createMerchantMoeLB } from "@hypurrquant/defi-protocols";

export function registerLB(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lb = parent.command("lb").description("Merchant Moe Liquidity Book: add/remove liquidity, rewards, positions");

  lb.command("add")
    .description("Add liquidity to a Liquidity Book pair")
    .requiredOption("--protocol <protocol>", "Protocol slug (e.g. merchantmoe-mantle)")
    .requiredOption("--pool <address>", "LB pair address")
    .requiredOption("--token-x <address>", "Token X address")
    .requiredOption("--token-y <address>", "Token Y address")
    .requiredOption("--bin-step <step>", "Bin step of the pair")
    .option("--amount-x <wei>", "Amount of token X in wei", "0")
    .option("--amount-y <wei>", "Amount of token Y in wei", "0")
    .option("--bins <N>", "Number of bins on each side of active bin", "5")
    .option("--active-id <id>", "Active bin id (defaults to on-chain query)")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "mantle");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMerchantMoeLB(protocol, rpcUrl);
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildAddLiquidity({
        pool: opts.pool as Address,
        tokenX: opts.tokenX as Address,
        tokenY: opts.tokenY as Address,
        binStep: parseInt(opts.binStep),
        amountX: BigInt(opts.amountX),
        amountY: BigInt(opts.amountY),
        numBins: parseInt(opts.bins),
        activeIdDesired: opts.activeId ? parseInt(opts.activeId) : undefined,
        recipient,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lb.command("remove")
    .description("Remove liquidity from Liquidity Book bins")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-x <address>", "Token X address")
    .requiredOption("--token-y <address>", "Token Y address")
    .requiredOption("--bin-step <step>", "Bin step of the pair")
    .requiredOption("--bins <binIds>", "Comma-separated bin IDs to remove from")
    .requiredOption("--amounts <amounts>", "Comma-separated LB token amounts to remove per bin (wei)")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createMerchantMoeLB(protocol);
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const binIds = (opts.bins as string).split(",").map((s: string) => parseInt(s.trim()));
      const amounts = (opts.amounts as string).split(",").map((s: string) => BigInt(s.trim()));
      const tx = await adapter.buildRemoveLiquidity({
        tokenX: opts.tokenX as Address,
        tokenY: opts.tokenY as Address,
        binStep: parseInt(opts.binStep),
        binIds,
        amounts,
        recipient,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lb.command("rewards")
    .description("Show pending MOE rewards for a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pool <address>", "LB pair address")
    .option("--bins <binIds>", "Comma-separated bin IDs to check (auto-detected from rewarder range if omitted)")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "mantle");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMerchantMoeLB(protocol, rpcUrl);
      const user = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
      const binIds = opts.bins ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim())) : undefined;
      const rewards = await adapter.getPendingRewards(user, opts.pool as Address, binIds);
      printOutput(rewards, getOpts());
    });

  lb.command("claim")
    .description("Claim pending MOE rewards from a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pool <address>", "LB pair address")
    .option("--bins <binIds>", "Comma-separated bin IDs to claim from (auto-detected from rewarder range if omitted)")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "mantle");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMerchantMoeLB(protocol, rpcUrl);
      const user = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
      const binIds = opts.bins ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim())) : undefined;
      const tx = await adapter.buildClaimRewards(user, opts.pool as Address, binIds);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lb.command("discover")
    .description("Find all rewarded LB pools on chain")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--active-only", "Only show non-stopped pools")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "mantle");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMerchantMoeLB(protocol, rpcUrl);
      let pools = await adapter.discoverRewardedPools();
      if (opts.activeOnly) {
        pools = pools.filter((p) => !p.stopped);
      }
      printOutput(pools, getOpts());
    });

  lb.command("positions")
    .description("Show user positions per bin in a LB pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--pool <address>", "LB pair address")
    .option("--bins <binIds>", "Comma-separated bin IDs to query (auto-detected from rewarder range or active ± 50 if omitted)")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const chain = registry.getChain(chainName ?? "mantle");
      const rpcUrl = chain.effectiveRpcUrl();
      const adapter = createMerchantMoeLB(protocol, rpcUrl);
      const user = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
      const binIds = opts.bins ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim())) : undefined;
      const positions = await adapter.getUserPositions(user, opts.pool as Address, binIds);
      printOutput(positions, getOpts());
    });
}
