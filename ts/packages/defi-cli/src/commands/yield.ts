import type { Command } from "commander";
import type { Address } from "viem";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import type { LendingRates } from "@hypurrquant/defi-core";
import { createLending, createVault } from "@hypurrquant/defi-protocols";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

function resolveAsset(registry: Registry, chain: string, asset: string): Address {
  // Try parsing as address first
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    return asset as Address;
  }
  return registry.resolveToken(chain, asset).address;
}

/** Collect lending rates for aave_v3 and aave_v3_isolated protocols */
async function collectLendingRates(
  registry: Registry,
  chainName: string,
  rpc: string,
  assetAddr: Address,
): Promise<LendingRates[]> {
  const protos = registry
    .getProtocolsForChain(chainName)
    .filter(
      (p) =>
        p.category === ProtocolCategory.Lending &&
        (p.interface === "aave_v3" || p.interface === "aave_v3_isolated"),
    );

  const results: LendingRates[] = [];
  let first = true;

  for (const proto of protos) {
    if (!first) {
      // Small delay between calls to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
    first = false;

    try {
      const lending = createLending(proto, rpc);
      const rates = await lending.getRates(assetAddr);
      results.push(rates);
    } catch (err) {
      process.stderr.write(`Warning: ${proto.name} rates unavailable: ${err}\n`);
    }
  }

  return results;
}

/** Collect all yield opportunities: lending + morpho + vaults */
async function collectAllYields(
  registry: Registry,
  chainName: string,
  rpc: string,
  asset: string,
  assetAddr: Address,
): Promise<unknown[]> {
  const opportunities: unknown[] = [];

  // 1. Aave V3 lending rates
  const lendingRates = await collectLendingRates(registry, chainName, rpc, assetAddr);
  for (const r of lendingRates) {
    if (r.supply_apy > 0) {
      opportunities.push({
        protocol: r.protocol,
        type: "lending_supply",
        asset,
        apy: r.supply_apy,
        utilization: r.utilization,
      });
    }
  }

  // 2. Morpho Blue rates
  const chainProtos = registry.getProtocolsForChain(chainName);
  for (const proto of chainProtos) {
    if (proto.category === ProtocolCategory.Lending && proto.interface === "morpho_blue") {
      try {
        const lending = createLending(proto, rpc);
        const rates = await lending.getRates(assetAddr);
        if (rates.supply_apy > 0) {
          opportunities.push({
            protocol: rates.protocol,
            type: "morpho_vault",
            asset,
            apy: rates.supply_apy,
            utilization: rates.utilization,
          });
        }
      } catch {
        // skip
      }
    }
  }

  // 3. ERC-4626 vaults
  for (const proto of chainProtos) {
    if (proto.category === ProtocolCategory.Vault && proto.interface === "erc4626") {
      try {
        const vault = createVault(proto, rpc);
        const info = await vault.getVaultInfo();
        opportunities.push({
          protocol: info.protocol,
          type: "vault",
          asset,
          apy: info.apy ?? 0,
          total_assets: info.total_assets.toString(),
        });
      } catch {
        // skip
      }
    }
  }

  // Sort by APY descending
  opportunities.sort((a, b) => {
    const aa = (a as Record<string, unknown>)["apy"] as number ?? 0;
    const ba = (b as Record<string, unknown>)["apy"] as number ?? 0;
    return ba - aa;
  });

  return opportunities;
}

/** Scan all chains in parallel for best yield on an asset */
async function runYieldScan(registry: Registry, asset: string, output: OutputMode): Promise<void> {
  const t0 = Date.now();
  const chainKeys = Array.from(registry.chains.keys());

  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const chainName = chain.name.toLowerCase();

      let assetAddr: Address;
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
              chain: chain.name,
              protocol: r.protocol,
              supply_apy: r.supply_apy,
              borrow_variable_apy: r.borrow_variable_apy,
            });
          }
        } catch {
          // skip
        }
      }

      return rates;
    } catch {
      return [];
    }
  });

  const nested = await Promise.all(tasks);
  const allRates = nested.flat() as Array<Record<string, unknown>>;

  // Sort by supply APY descending
  allRates.sort((a, b) => (b["supply_apy"] as number ?? 0) - (a["supply_apy"] as number ?? 0));

  const best =
    allRates.length > 0
      ? `${allRates[0]["protocol"]} on ${allRates[0]["chain"]}`
      : null;

  // Find arb opportunities (supply on A, borrow on B)
  const arbs: unknown[] = [];
  for (const s of allRates) {
    for (const b of allRates) {
      const sp = s["supply_apy"] as number ?? 0;
      const bp = b["borrow_variable_apy"] as number ?? 0;
      if (sp > bp && bp > 0) {
        const sc = s["chain"] as string;
        const bc = b["chain"] as string;
        const sp2 = s["protocol"] as string;
        const bp2 = b["protocol"] as string;
        if (sc !== bc || sp2 !== bp2) {
          arbs.push({
            spread_pct: Math.round((sp - bp) * 100) / 100,
            supply_chain: sc,
            supply_protocol: sp2,
            supply_apy: sp,
            borrow_chain: bc,
            borrow_protocol: bp2,
            borrow_apy: bp,
            strategy: sc === bc ? "same-chain" : "cross-chain",
          });
        }
      }
    }
  }

  arbs.sort((a, b) => {
    const as_ = (a as Record<string, unknown>)["spread_pct"] as number ?? 0;
    const bs_ = (b as Record<string, unknown>)["spread_pct"] as number ?? 0;
    return bs_ - as_;
  });
  arbs.splice(10); // Top 10

  printOutput(
    {
      asset,
      scan_duration_ms: Date.now() - t0,
      chains_scanned: chainKeys.length,
      rates: allRates,
      best_supply: best,
      arb_opportunities: arbs,
    },
    output,
  );
}

export function registerYield(parent: Command, getOpts: () => OutputMode): void {
  const yieldCmd = parent
    .command("yield")
    .description("Yield operations: compare, scan, optimize");

  // yield compare
  yieldCmd
    .command("compare")
    .description("Compare lending rates across protocols for an asset")
    .requiredOption("--asset <token>", "Token symbol or address")
    .option("--chain <chain>", "Chain to query", "hyperevm")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const chainName: string = (opts.chain ?? "hyperevm").toLowerCase();
        const chain = registry.getChain(chainName);
        const rpc = chain.effectiveRpcUrl();
        const assetAddr = resolveAsset(registry, chainName, opts.asset as string);

        const results = await collectLendingRates(registry, chainName, rpc, assetAddr);

        if (results.length === 0) {
          printOutput(
            { error: `No lending rate data available for asset '${opts.asset}'` },
            getOpts(),
          );
          process.exit(1);
          return;
        }

        results.sort((a, b) => b.supply_apy - a.supply_apy);

        const bestSupply = results[0]?.protocol ?? null;
        const bestBorrow =
          results.reduce((best, r) => {
            if (!best || r.borrow_variable_apy < best.borrow_variable_apy) return r;
            return best;
          }, null as LendingRates | null)?.protocol ?? null;

        printOutput(
          {
            asset: opts.asset,
            rates: results,
            best_supply: bestSupply,
            best_borrow: bestBorrow,
          },
          getOpts(),
        );
      } catch (err) {
        printOutput({ error: String(err) }, getOpts());
        process.exit(1);
      }
    });

  // yield scan
  yieldCmd
    .command("scan")
    .description("Scan all chains for best yield opportunities (parallel)")
    .requiredOption("--asset <token>", "Token symbol (e.g. USDC, WETH)")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        await runYieldScan(registry, opts.asset as string, getOpts());
      } catch (err) {
        printOutput({ error: String(err) }, getOpts());
        process.exit(1);
      }
    });

  // yield optimize
  yieldCmd
    .command("optimize")
    .description("Find the optimal yield strategy for an asset")
    .requiredOption("--asset <token>", "Token symbol or address")
    .option("--chain <chain>", "Chain to query", "hyperevm")
    .option("--strategy <strategy>", "Strategy: best-supply, leverage-loop, auto", "auto")
    .option("--amount <amount>", "Amount to deploy (for allocation breakdown)")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const chainName: string = (opts.chain ?? "hyperevm").toLowerCase();
        const chain = registry.getChain(chainName);
        const rpc = chain.effectiveRpcUrl();
        const asset = opts.asset as string;
        const assetAddr = resolveAsset(registry, chainName, asset);
        const strategy = (opts.strategy as string) ?? "auto";

        if (strategy === "auto") {
          const opportunities = await collectAllYields(registry, chainName, rpc, asset, assetAddr);

          if (opportunities.length === 0) {
            printOutput({ error: `No yield opportunities found for '${asset}'` }, getOpts());
            process.exit(1);
            return;
          }

          const amount = opts.amount ? parseFloat(opts.amount as string) : null;
          const weights = [0.6, 0.3, 0.1];
          const allocations =
            amount !== null
              ? opportunities.slice(0, weights.length).map((opp, i) => ({
                  protocol: (opp as Record<string, unknown>)["protocol"],
                  type: (opp as Record<string, unknown>)["type"],
                  apy: (opp as Record<string, unknown>)["apy"],
                  allocation_pct: weights[i] * 100,
                  amount: (amount * weights[i]).toFixed(2),
                }))
              : [];

          const best = opportunities[0] as Record<string, unknown>;
          const weightedApy =
            allocations.length > 0
              ? opportunities.slice(0, weights.length).reduce((sum: number, o, i) => {
                  return sum + ((o as Record<string, unknown>)["apy"] as number ?? 0) * weights[i];
                }, 0)
              : (best["apy"] as number ?? 0);

          printOutput(
            {
              strategy: "auto",
              asset,
              best_protocol: best["protocol"],
              best_apy: best["apy"],
              weighted_apy: weightedApy,
              opportunities,
              allocation: allocations,
            },
            getOpts(),
          );
        } else if (strategy === "best-supply") {
          const results = await collectLendingRates(registry, chainName, rpc, assetAddr);

          if (results.length === 0) {
            printOutput({ error: `No lending rate data available for asset '${asset}'` }, getOpts());
            process.exit(1);
            return;
          }

          results.sort((a, b) => b.supply_apy - a.supply_apy);
          const best = results[0];
          const recommendations = results.map((r) => ({
            protocol: r.protocol,
            supply_apy: r.supply_apy,
            action: "supply",
          }));

          printOutput(
            {
              strategy: "best-supply",
              asset,
              recommendation: `Supply ${asset} on ${best.protocol} for ${(best.supply_apy * 100).toFixed(2)}% APY`,
              best_protocol: best.protocol,
              best_supply_apy: best.supply_apy,
              all_options: recommendations,
            },
            getOpts(),
          );
        } else if (strategy === "leverage-loop") {
          const results = await collectLendingRates(registry, chainName, rpc, assetAddr);

          if (results.length === 0) {
            printOutput({ error: `No lending rate data available for asset '${asset}'` }, getOpts());
            process.exit(1);
            return;
          }

          const ltv = 0.8;
          const loops = 5;
          const candidates: unknown[] = [];

          for (const r of results) {
            const threshold = r.borrow_variable_apy * 0.8;
            if (r.supply_apy > threshold && r.borrow_variable_apy > 0) {
              let effectiveSupplyApy = 0;
              let effectiveBorrowApy = 0;
              let leverage = 1.0;
              for (let l = 0; l < loops; l++) {
                effectiveSupplyApy += r.supply_apy * leverage;
                effectiveBorrowApy += r.borrow_variable_apy * leverage * ltv;
                leverage *= ltv;
              }
              candidates.push({
                protocol: r.protocol,
                supply_apy: r.supply_apy,
                borrow_variable_apy: r.borrow_variable_apy,
                loops,
                ltv,
                effective_supply_apy: effectiveSupplyApy,
                effective_borrow_cost: effectiveBorrowApy,
                net_apy: effectiveSupplyApy - effectiveBorrowApy,
              });
            }
          }

          candidates.sort((a, b) => {
            const an = (a as Record<string, unknown>)["net_apy"] as number ?? 0;
            const bn = (b as Record<string, unknown>)["net_apy"] as number ?? 0;
            return bn - an;
          });

          const recommendation =
            candidates.length > 0
              ? (() => {
                  const b = candidates[0] as Record<string, unknown>;
                  return `Leverage loop ${asset} on ${b["protocol"]} — net APY: ${((b["net_apy"] as number) * 100).toFixed(2)}% (${loops} loops at ${ltv * 100}% LTV)`;
                })()
              : `No favorable leverage loop found for ${asset} — supply rate too low relative to borrow rate`;

          printOutput(
            {
              strategy: "leverage-loop",
              asset,
              recommendation,
              candidates,
            },
            getOpts(),
          );
        } else {
          printOutput(
            { error: `Unknown strategy '${strategy}'. Supported: best-supply, leverage-loop, auto` },
            getOpts(),
          );
          process.exit(1);
        }
      } catch (err) {
        printOutput({ error: String(err) }, getOpts());
        process.exit(1);
      }
    });
}
