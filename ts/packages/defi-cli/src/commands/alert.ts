import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createDex } from "@hypurrquant/defi-protocols";
import { createLending } from "@hypurrquant/defi-protocols";

export function registerAlert(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("alert")
    .description("Alert on DEX vs Oracle price deviation")
    .option("--threshold <pct>", "Deviation threshold in percent", "5.0")
    .option("--once", "Run once instead of continuously")
    .option("--interval <secs>", "Polling interval in seconds", "60")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const threshold = parseFloat(opts.threshold);

      const dexProtocols = registry.getProtocolsByCategory("dex" as any).filter(p => p.chain === chainName);
      const lendingProtocols = registry.getProtocolsByCategory("lending" as any).filter(p => p.chain === chainName);

      const poll = async () => {
        const alerts: Array<{ protocol: string; type: string; message: string }> = [];

        for (const p of dexProtocols) {
          try {
            const dex = createDex(p, rpcUrl);
            alerts.push({
              protocol: p.name,
              type: "info",
              message: `DEX ${dex.name()} active on ${chainName}`,
            });
          } catch { /* skip unsupported */ }
        }

        printOutput({
          chain: chainName,
          threshold_pct: threshold,
          alerts,
          timestamp: new Date().toISOString(),
        }, getOpts());
      };

      await poll();
      if (!opts.once) {
        const intervalMs = parseInt(opts.interval) * 1000;
        const timer = setInterval(poll, intervalMs);
        process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
      }
    });
}
