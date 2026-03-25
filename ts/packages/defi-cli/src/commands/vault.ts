import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createVault } from "@hypurrquant/defi-protocols";

export function registerVault(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const vault = parent.command("vault").description("Vault operations: deposit, withdraw, info");

  vault.command("deposit")
    .description("Deposit assets into a vault")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--amount <amount>", "Amount in wei")
    .option("--receiver <address>", "Receiver address for vault shares")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createVault(protocol, chain.effectiveRpcUrl());
      const receiver = (opts.receiver ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildDeposit(BigInt(opts.amount), receiver);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  vault.command("withdraw")
    .description("Withdraw assets from a vault")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--amount <amount>", "Amount in wei (shares)")
    .option("--receiver <address>", "Receiver address")
    .option("--owner <address>", "Owner address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createVault(protocol, chain.effectiveRpcUrl());
      const receiver = (opts.receiver ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const owner = (opts.owner ?? receiver) as Address;
      const tx = await adapter.buildWithdraw(BigInt(opts.amount), receiver, owner);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  vault.command("info")
    .description("Show vault info (TVL, APY, shares)")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createVault(protocol, chain.effectiveRpcUrl());
      const info = await adapter.getVaultInfo();
      printOutput(info, getOpts());
    });
}
