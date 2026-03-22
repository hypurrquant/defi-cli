import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import { createLending } from "@hypurrquant/defi-protocols";
import type { Address } from "viem";

interface PositionResult {
  chain: string;
  protocol: string;
  health_factor: number;
  total_supply_usd: number;
  total_borrow_usd: number;
  alert: boolean;
}

async function checkChainLendingPositions(
  chainKey: string,
  registry: Registry,
  address: Address,
  threshold: number,
): Promise<PositionResult[]> {
  let chain;
  try {
    chain = registry.getChain(chainKey);
  } catch {
    return [];
  }

  const rpc = chain.effectiveRpcUrl();
  const chainName = chain.name;
  const protocols = registry.getProtocolsForChain(chainKey).filter(
    (p) => p.category === ProtocolCategory.Lending,
  );

  const results = await Promise.all(
    protocols.map(async (proto): Promise<PositionResult | null> => {
      try {
        const adapter = createLending(proto, rpc);
        const position = await adapter.getUserPosition(address);
        const hf = position.health_factor ?? Infinity;

        // Skip positions with no borrows (no liquidation risk)
        const totalBorrow = position.borrows?.reduce(
          (sum, b) => sum + (b.value_usd ?? 0),
          0,
        ) ?? 0;
        if (totalBorrow === 0) return null;

        const totalSupply = position.supplies?.reduce(
          (sum, s) => sum + (s.value_usd ?? 0),
          0,
        ) ?? 0;

        return {
          chain: chainName,
          protocol: proto.name,
          health_factor: hf === Infinity ? 999999 : Math.round(hf * 100) / 100,
          total_supply_usd: Math.round(totalSupply * 100) / 100,
          total_borrow_usd: Math.round(totalBorrow * 100) / 100,
          alert: hf < threshold,
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((r): r is PositionResult => r !== null);
}

export function registerMonitor(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("monitor")
    .description("Monitor health factor with alerts")
    .option("--protocol <protocol>", "Protocol slug (required unless --all-chains)")
    .requiredOption("--address <address>", "Wallet address to monitor")
    .option("--threshold <hf>", "Health factor alert threshold", "1.5")
    .option("--interval <secs>", "Polling interval in seconds", "60")
    .option("--once", "Run once instead of continuously")
    .option("--all-chains", "Scan all chains for lending positions")
    .action(async (opts) => {
      const threshold = parseFloat(opts.threshold);
      const address = opts.address as Address;

      if (opts.allChains) {
        // Multi-chain mode
        const registry = Registry.loadEmbedded();
        const chainKeys = Array.from(registry.chains.keys());

        const poll = async () => {
          const timestamp = new Date().toISOString();

          const chainResults = await Promise.all(
            chainKeys.map((ck) =>
              checkChainLendingPositions(ck, registry, address, threshold),
            ),
          );

          const positions = chainResults.flat();
          const alertsCount = positions.filter((p) => p.alert).length;

          const output = {
            timestamp,
            address,
            threshold,
            positions,
            alerts_count: alertsCount,
          };

          // Write alerts to stderr for visibility
          for (const pos of positions) {
            if (pos.alert) {
              process.stderr.write(
                `ALERT: ${pos.chain}/${pos.protocol} HF=${pos.health_factor} < ${threshold}\n`,
              );
            }
          }

          printOutput(output, getOpts());
        };

        await poll();
        if (!opts.once) {
          const intervalMs = parseInt(opts.interval) * 1000;
          const timer = setInterval(poll, intervalMs);
          process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
        }
      } else {
        // Single-protocol mode (backward compat)
        if (!opts.protocol) {
          printOutput({ error: "Either --protocol or --all-chains is required" }, getOpts());
          process.exit(1);
        }

        const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
        const registry = Registry.loadEmbedded();
        const chain = registry.getChain(chainName);
        const protocol = registry.getProtocol(opts.protocol);
        const adapter = createLending(protocol, chain.effectiveRpcUrl());

        const poll = async () => {
          try {
            const position = await adapter.getUserPosition(address);
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
      }
    });
}
