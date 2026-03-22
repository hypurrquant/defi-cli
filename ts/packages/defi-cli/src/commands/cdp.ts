import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createCdp } from "@hypurrquant/defi-protocols";

export function registerCdp(parent: Command, getOpts: () => OutputMode, executor: Executor): void {
  const cdp = parent.command("cdp").description("CDP operations: open, adjust, close, info");

  cdp.command("open")
    .description("Open a new CDP position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--collateral <token>", "Collateral token address")
    .requiredOption("--amount <amount>", "Collateral amount in wei")
    .requiredOption("--mint <amount>", "Stablecoin to mint in wei")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createCdp(protocol, chain.effectiveRpcUrl());
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildOpen({
        protocol: protocol.name, collateral: opts.collateral as Address,
        collateral_amount: BigInt(opts.amount), debt_amount: BigInt(opts.mint), recipient,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  cdp.command("info")
    .description("Show CDP position info")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--position <id>", "CDP/trove ID")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createCdp(protocol, chain.effectiveRpcUrl());
      const info = await adapter.getCdpInfo(BigInt(opts.position));
      printOutput(info, getOpts());
    });

  cdp.command("adjust")
    .description("Adjust an existing CDP position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--position <id>", "CDP/trove ID")
    .option("--add-collateral <amount>", "Add collateral in wei")
    .option("--withdraw-collateral <amount>", "Withdraw collateral in wei")
    .option("--mint <amount>", "Mint additional stablecoin")
    .option("--repay <amount>", "Repay stablecoin")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createCdp(protocol, chain.effectiveRpcUrl());
      const tx = await adapter.buildAdjust({
        protocol: protocol.name, cdp_id: BigInt(opts.position),
        collateral_delta: opts.addCollateral ? BigInt(opts.addCollateral) : opts.withdrawCollateral ? BigInt(opts.withdrawCollateral) : undefined,
        debt_delta: opts.mint ? BigInt(opts.mint) : opts.repay ? BigInt(opts.repay) : undefined,
        add_collateral: !!opts.addCollateral, add_debt: !!opts.mint,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  cdp.command("close")
    .description("Close a CDP position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--position <id>", "CDP/trove ID")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createCdp(protocol, chain.effectiveRpcUrl());
      const tx = await adapter.buildClose({ protocol: protocol.name, cdp_id: BigInt(opts.position) });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
