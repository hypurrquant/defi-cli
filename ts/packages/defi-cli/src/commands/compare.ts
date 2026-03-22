import { spawnSync } from "child_process";
import type { Command } from "commander";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import { createLending } from "@hypurrquant/defi-protocols";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Fetch perp funding rates by calling `perp --json arb scan --rates` */
async function fetchPerpRates(): Promise<unknown[]> {
  // Try global `perp` first, then npx fallback
  let result = spawnSync("perp", ["--json", "arb", "scan", "--rates"], { encoding: "utf8", timeout: 30000 });
  if (result.error || result.status !== 0) {
    result = spawnSync("npx", ["-y", "perp-cli@latest", "--json", "arb", "scan", "--rates"], {
      encoding: "utf8",
      timeout: 60000,
    });
  }

  if (result.error || result.status !== 0) {
    throw new Error("perp-cli not found or failed");
  }

  let data: unknown;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error("perp JSON parse error");
  }

  const d = data as Record<string, unknown>;
  const symbolsRaw =
    (d["data"] as Record<string, unknown> | undefined)?.["symbols"] ??
    d["symbols"];
  const symbols = Array.isArray(symbolsRaw) ? symbolsRaw : [];

  const results: unknown[] = [];
  for (const sym of symbols as Array<Record<string, unknown>>) {
    const symbol = (sym["symbol"] as string) ?? "?";
    const maxSpread = (sym["maxSpreadAnnual"] as number) ?? 0;
    const longEx = (sym["longExchange"] as string) ?? "?";
    const shortEx = (sym["shortExchange"] as string) ?? "?";

    if (Math.abs(maxSpread) > 0) {
      results.push({
        type: "perp_funding",
        asset: symbol,
        apy: round2(maxSpread),
        detail: `long ${longEx} / short ${shortEx}`,
        risk: Math.abs(maxSpread) > 50 ? "high" : Math.abs(maxSpread) > 20 ? "medium" : "low",
        source: "perp-cli",
      });
    }

    const rates = Array.isArray(sym["rates"]) ? (sym["rates"] as Array<Record<string, unknown>>) : [];
    for (const rate of rates) {
      const exchange = (rate["exchange"] as string) ?? "?";
      const annual = (rate["annualizedPct"] as number) ?? 0;
      if (Math.abs(annual) > 1.0) {
        results.push({
          type: "perp_rate",
          asset: symbol,
          apy: round2(annual),
          detail: exchange,
          risk: Math.abs(annual) > 50 ? "high" : Math.abs(annual) > 20 ? "medium" : "low",
          source: "perp-cli",
        });
      }
    }
  }

  return results;
}

/** Fetch lending supply rates across all chains for a given asset */
async function fetchLendingRates(registry: Registry, asset: string): Promise<unknown[]> {
  const chainKeys = Array.from(registry.chains.keys());

  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const chainName = chain.name.toLowerCase();

      let assetAddr: `0x${string}`;
      try {
        assetAddr = registry.resolveToken(chainName, asset).address;
      } catch {
        return [];
      }

      const protos = registry
        .getProtocolsForChain(chainName)
        .filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");

      if (protos.length === 0) return [];

      const rpc = chain.effectiveRpcUrl();
      const rates: unknown[] = [];

      for (const proto of protos) {
        try {
          const lending = createLending(proto, rpc);
          const r = await lending.getRates(assetAddr);
          if (r.supply_apy > 0) {
            rates.push({
              type: "lending_supply",
              asset,
              apy: round2(r.supply_apy * 100),
              detail: `${r.protocol} (${chain.name})`,
              risk: "low",
              source: "defi-cli",
            });
          }
        } catch {
          // skip unavailable protocols
        }
      }

      return rates;
    } catch {
      return [];
    }
  });

  const nested = await Promise.all(tasks);
  return nested.flat();
}

export function registerCompare(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("compare")
    .description("Compare all yield sources: perp funding vs lending APY vs staking")
    .option("--asset <token>", "Token symbol to compare (e.g. USDC, ETH)", "USDC")
    .option("--no-perps", "Exclude perp funding rates")
    .option("--no-lending", "Exclude lending rates")
    .option("--min-apy <pct>", "Minimum absolute APY to show", "1.0")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const asset: string = opts.asset ?? "USDC";
        const includePerps: boolean = opts.perps !== false;
        const includeLending: boolean = opts.lending !== false;
        const minApy = parseFloat(opts.minApy ?? "1.0");

        const t0 = Date.now();
        const opportunities: unknown[] = [];

        // 1. Perp funding rates
        if (includePerps) {
          try {
            const perpData = await fetchPerpRates();
            for (const opp of perpData) {
              const apy = Math.abs((opp as Record<string, unknown>)["apy"] as number ?? 0);
              if (apy >= minApy) opportunities.push(opp);
            }
          } catch {
            // perp-cli not available — skip silently
          }
        }

        // 2. Lending rates across all chains
        if (includeLending) {
          const lendingData = await fetchLendingRates(registry, asset);
          for (const opp of lendingData) {
            const apy = Math.abs((opp as Record<string, unknown>)["apy"] as number ?? 0);
            if (apy >= minApy) opportunities.push(opp);
          }
        }

        // Sort by absolute APY descending
        opportunities.sort((a, b) => {
          const aApy = Math.abs((a as Record<string, unknown>)["apy"] as number ?? 0);
          const bApy = Math.abs((b as Record<string, unknown>)["apy"] as number ?? 0);
          return bApy - aApy;
        });

        const scanMs = Date.now() - t0;

        printOutput(
          {
            asset,
            scan_duration_ms: scanMs,
            total_opportunities: opportunities.length,
            opportunities,
          },
          getOpts(),
        );
      } catch (err) {
        printOutput({ error: String(err) }, getOpts());
        process.exit(1);
      }
    });
}
