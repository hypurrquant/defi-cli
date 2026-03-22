import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createLending } from "@hypurrquant/defi-protocols";
import type { Address } from "viem";

export function registerMonitor(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("monitor")
    .description("Monitor health factor with alerts")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--address <address>", "Wallet address to monitor")
    .option("--threshold <hf>", "Health factor alert threshold", "1.5")
    .option("--interval <secs>", "Polling interval in seconds", "60")
    .option("--once", "Run once instead of continuously")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
      const threshold = parseFloat(opts.threshold);

      const poll = async () => {
        try {
          const position = await adapter.getUserPosition(opts.address as Address);
          const hf = position.health_factor ?? Infinity;
          const alert = hf < threshold;
          printOutput({
            protocol: protocol.name,
            user: opts.address,
            health_factor: hf,
            threshold,
            alert,
            timestamp: new Date().toISOString(),
            supplies: position.supplies,
            borrows: position.borrows,
          }, getOpts());
        } catch (e) {
          printOutput({
            error: e instanceof Error ? e.message : String(e),
            protocol: protocol.name,
            timestamp: new Date().toISOString(),
          }, getOpts());
        }
      };

      await poll();
      if (!opts.once) {
        const intervalMs = parseInt(opts.interval) * 1000;
        const timer = setInterval(poll, intervalMs);
        process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
      }
    });
}
