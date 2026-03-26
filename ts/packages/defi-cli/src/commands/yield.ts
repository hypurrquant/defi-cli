import type { Command } from "commander";
import type { Address } from "viem";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import type { LendingRates } from "@hypurrquant/defi-core";
import { createLending, createVault } from "@hypurrquant/defi-protocols";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import type { Executor } from "../executor.js";

function resolveAsset(registry: Registry, chain: string, asset: string): Address {
  // Try parsing as address first
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    return asset as Address;
  }
  return registry.resolveToken(chain, asset).address;
}

/** Collect lending rates for all lending protocols */
async function collectLendingRates(
  registry: Registry,
  chainName: string,
  rpc: string,
  assetAddr: Address,
): Promise<LendingRates[]> {
  const protos = registry
    .getProtocolsForChain(chainName)
    .filter((p) => p.category === ProtocolCategory.Lending);

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
        .filter((p) => p.category === ProtocolCategory.Lending);

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

/** Scan rate entry with slug for execute subcommand */
interface ScanRate {
  chain: string;
  protocol: string;
  slug: string;
  supply_apy: number;
  borrow_variable_apy: number;
}

/** Run a cross-chain yield scan and return typed rate entries */
async function scanRatesForExecute(registry: Registry, asset: string): Promise<ScanRate[]> {
  const chainKeys = Array.from(registry.chains.keys());

  const tasks = chainKeys.map(async (ck): Promise<ScanRate[]> => {
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
        .filter((p) => p.category === ProtocolCategory.Lending);
      if (protos.length === 0) return [];
      const rpc = chain.effectiveRpcUrl();
      const rates: ScanRate[] = [];
      for (const proto of protos) {
        try {
          const lending = createLending(proto, rpc);
          const r = await lending.getRates(assetAddr);
          if (r.supply_apy > 0) {
            rates.push({
              chain: chain.name,
              protocol: r.protocol,
              slug: proto.slug,
              supply_apy: r.supply_apy,
              borrow_variable_apy: r.borrow_variable_apy,
            });
          }
        } catch {
          // skip unreachable
        }
      }
      return rates;
    } catch {
      return [];
    }
  });

  const nested = await Promise.all(tasks);
  const all = nested.flat();
  all.sort((a, b) => b.supply_apy - a.supply_apy);
  return all;
}

export function registerYield(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const yieldCmd = parent
    .command("yield")
    .description("Yield operations: compare, scan, optimize, execute");

  // yield compare
  yieldCmd
    .command("compare")
    .description("Compare lending rates across protocols for an asset")
    .requiredOption("--asset <token>", "Token symbol or address")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const chainName: string = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();
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

  // yield execute
  yieldCmd
    .command("execute")
    .description("Find the best yield opportunity and execute supply (or show cross-chain plan)")
    .requiredOption("--asset <token>", "Token symbol or address (e.g. USDC)")
    .requiredOption("--amount <amount>", "Human-readable amount to supply (e.g. 1000)")
    .option("--min-spread <percent>", "Minimum spread % required to execute cross-chain arb", "1.0")
    .option("--target-chain <chain>", "Override auto-detected best chain")
    .option("--target-protocol <protocol>", "Override auto-detected best protocol slug")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const asset = opts.asset as string;
        const humanAmount = parseFloat(opts.amount as string);
        if (isNaN(humanAmount) || humanAmount <= 0) {
          printOutput({ error: `Invalid amount: ${opts.amount}` }, getOpts());
          process.exit(1);
          return;
        }
        const minSpread = parseFloat((opts.minSpread as string) ?? "1.0");

        let targetChainName: string;
        let targetProtocolSlug: string | undefined = opts.targetProtocol as string | undefined;

        if (opts.targetChain) {
          // Manual chain override — skip scan
          targetChainName = (opts.targetChain as string).toLowerCase();
        } else {
          // Run cross-chain scan to find best supply opportunity
          process.stderr.write(`Scanning all chains for best ${asset} yield...\n`);
          const t0 = Date.now();
          const allRates = await scanRatesForExecute(registry, asset);
          process.stderr.write(`Scan done in ${Date.now() - t0}ms — ${allRates.length} rates found\n`);

          if (allRates.length === 0) {
            printOutput({ error: `No yield opportunities found for ${asset}` }, getOpts());
            process.exit(1);
            return;
          }

          // Find best cross-chain arb (highest spread)
          let bestArb: {
            spread_pct: number;
            supply_chain: string;
            supply_protocol: string;
            supply_slug: string;
            supply_apy: number;
            borrow_chain: string;
            borrow_protocol: string;
            borrow_apy: number;
            strategy: string;
          } | null = null;

          for (const s of allRates) {
            for (const b of allRates) {
              const spread = s.supply_apy - b.borrow_variable_apy;
              if (spread > 0 && b.borrow_variable_apy > 0 && (s.chain !== b.chain || s.slug !== b.slug)) {
                if (!bestArb || spread > bestArb.spread_pct) {
                  bestArb = {
                    spread_pct: Math.round(spread * 10000) / 10000,
                    supply_chain: s.chain,
                    supply_protocol: s.protocol,
                    supply_slug: s.slug,
                    supply_apy: s.supply_apy,
                    borrow_chain: b.chain,
                    borrow_protocol: b.protocol,
                    borrow_apy: b.borrow_variable_apy,
                    strategy: s.chain === b.chain ? "same-chain" : "cross-chain",
                  };
                }
              }
            }
          }

          // If best arb is cross-chain and meets min-spread: output plan only (no execution)
          if (bestArb && bestArb.strategy === "cross-chain" && bestArb.spread_pct >= minSpread) {
            const supplyChainLower = bestArb.supply_chain.toLowerCase();
            let supplyAssetAddr: Address | undefined;
            let supplyDecimals = 18;
            try {
              const tok = registry.resolveToken(supplyChainLower, asset);
              supplyAssetAddr = tok.address;
              supplyDecimals = tok.decimals;
            } catch {
              // leave as undefined
            }
            const amountWei = BigInt(Math.round(humanAmount * 10 ** supplyDecimals));

            printOutput(
              {
                mode: "plan_only",
                reason: "cross-chain arb requires manual bridge execution",
                asset,
                amount_human: humanAmount,
                amount_wei: amountWei.toString(),
                best_arb: bestArb,
                steps: [
                  {
                    step: 1,
                    action: "bridge",
                    description: `Bridge ${humanAmount} ${asset} from current chain to ${bestArb.supply_chain}`,
                    from_chain: "current",
                    to_chain: bestArb.supply_chain,
                    token: asset,
                    amount_wei: amountWei.toString(),
                  },
                  {
                    step: 2,
                    action: "supply",
                    description: `Supply ${humanAmount} ${asset} on ${bestArb.supply_protocol}`,
                    chain: bestArb.supply_chain,
                    protocol: bestArb.supply_protocol,
                    protocol_slug: bestArb.supply_slug,
                    asset_address: supplyAssetAddr,
                    amount_wei: amountWei.toString(),
                    expected_apy: bestArb.supply_apy,
                  },
                ],
                expected_spread_pct: bestArb.spread_pct,
                supply_apy: bestArb.supply_apy,
                borrow_apy: bestArb.borrow_apy,
              },
              getOpts(),
            );
            return;
          }

          // Fall through to same-chain supply on the best rate
          targetChainName = allRates[0].chain.toLowerCase();
          if (!targetProtocolSlug) {
            targetProtocolSlug = allRates[0].slug;
          }
        }

        // Same-chain supply execution path
        const chain = registry.getChain(targetChainName);
        const chainName = chain.name.toLowerCase();
        const rpc = chain.effectiveRpcUrl();

        // Resolve asset address + decimals on target chain
        let assetAddr: Address;
        let decimals = 18;
        try {
          const tok = registry.resolveToken(chainName, asset);
          assetAddr = tok.address;
          decimals = tok.decimals;
        } catch {
          if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
            assetAddr = asset as Address;
          } else {
            printOutput({ error: `Cannot resolve ${asset} on chain ${chainName}` }, getOpts());
            process.exit(1);
            return;
          }
        }

        const amountWei = BigInt(Math.round(humanAmount * 10 ** decimals));

        // Resolve protocol
        let proto: ReturnType<typeof registry.getProtocol>;
        if (targetProtocolSlug) {
          try {
            proto = registry.getProtocol(targetProtocolSlug);
          } catch {
            printOutput({ error: `Protocol not found: ${targetProtocolSlug}` }, getOpts());
            process.exit(1);
            return;
          }
        } else {
          // Pick the aave_v3 protocol on the target chain with highest supply APY
          const candidates = registry
            .getProtocolsForChain(chainName)
            .filter((p) => p.category === ProtocolCategory.Lending);
          if (candidates.length === 0) {
            printOutput({ error: `No aave_v3 lending protocol found on ${chainName}` }, getOpts());
            process.exit(1);
            return;
          }
          let bestRate: LendingRates | null = null;
          let bestProto = candidates[0];
          for (const c of candidates) {
            try {
              const lending = createLending(c, rpc);
              const r = await lending.getRates(assetAddr);
              if (!bestRate || r.supply_apy > bestRate.supply_apy) {
                bestRate = r;
                bestProto = c;
              }
            } catch {
              // skip
            }
          }
          proto = bestProto;
        }

        const onBehalfOf = (
          process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001"
        ) as Address;
        const adapter = createLending(proto, rpc);

        // Fetch current rate for display (non-fatal)
        let currentApy: number | undefined;
        try {
          const r = await adapter.getRates(assetAddr);
          currentApy = r.supply_apy;
        } catch {
          // non-fatal
        }

        process.stderr.write(
          `Supplying ${humanAmount} ${asset} (${amountWei} wei) on ${proto.name} (${chain.name})...\n`,
        );

        const executor = makeExecutor();
        const tx = await adapter.buildSupply({
          protocol: proto.name,
          asset: assetAddr,
          amount: amountWei,
          on_behalf_of: onBehalfOf,
        });

        const result = await executor.execute(tx);

        printOutput(
          {
            action: "yield_execute",
            asset,
            amount_human: humanAmount,
            amount_wei: amountWei.toString(),
            chain: chain.name,
            protocol: proto.name,
            protocol_slug: proto.slug,
            supply_apy: currentApy,
            result,
          },
          getOpts(),
        );
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
    .option("--strategy <strategy>", "Strategy: best-supply, leverage-loop, auto", "auto")
    .option("--amount <amount>", "Amount to deploy (for allocation breakdown)")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const chainName: string = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();
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
