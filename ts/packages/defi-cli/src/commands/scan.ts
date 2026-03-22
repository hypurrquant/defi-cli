import type { Command } from "commander";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

// ABI fragments for scan
const AAVE_ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
]);

const UNIV2_ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)",
]);

const VTOKEN_ABI = parseAbi([
  "function exchangeRateStored() external view returns (uint256)",
]);

const STABLECOINS = new Set(["USDC", "USDT", "DAI", "USDT0"]);

// Rounding helpers
function round2(x: number): number { return Math.round(x * 100) / 100; }
function round4(x: number): number { return Math.round(x * 10000) / 10000; }
function round6(x: number): number { return Math.round(x * 1000000) / 1000000; }

/** Parse a uint256 return from multicall (first 32 bytes) */
function parseU256F64(data: Hex | null, decimals: number): number {
  if (!data || data.length < 66) return 0;
  const raw = BigInt(data.slice(0, 66));
  return Number(raw) / 10 ** decimals;
}

/**
 * Parse the last element of a getAmountsOut return array.
 * ABI encoding: offset(32) + length(32) + elements[N * 32]
 * We want the last element.
 */
function parseAmountsOutLast(data: Hex | null, outDecimals: number): number {
  if (!data) return 0;
  // Strip 0x prefix
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  // Minimum: 128 hex chars = 64 bytes = offset(32) + length(32)
  if (hex.length < 128) return 0;
  // Array length is at bytes 32..64 (hex chars 64..128)
  const num = parseInt(hex.slice(64, 128), 16);
  if (num === 0) return 0;
  // Last element is at offset: 64 bytes header + (num-1)*32 bytes
  const byteOff = 64 + (num - 1) * 32;
  const hexOff = byteOff * 2;
  if (hex.length < hexOff + 64) return 0;
  const val = BigInt("0x" + hex.slice(hexOff, hexOff + 64));
  return Number(val) / 10 ** outDecimals;
}

type CallType =
  | { kind: "oracle"; oracle: string; token: string; oracleDecimals: number }
  | { kind: "dex"; token: string; outDecimals: number }
  | { kind: "stable"; from: string; to: string; outDecimals: number }
  | { kind: "exchangeRate"; protocol: string; vtoken: string };

export function registerScan(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("scan")
    .description("Multi-pattern exploit detection scanner")
    .option("--chain <chain>", "Chain to scan", "hyperevm")
    .option("--patterns <patterns>", "Comma-separated patterns: oracle,stable,exchange_rate", "oracle,stable,exchange_rate")
    .option("--oracle-threshold <pct>", "Oracle divergence threshold (percent)", "5.0")
    .option("--stable-threshold <price>", "Stablecoin depeg threshold (min price)", "0.98")
    .option("--rate-threshold <pct>", "Exchange rate change threshold (percent)", "5.0")
    .option("--interval <secs>", "Polling interval in seconds", "30")
    .option("--once", "Single check then exit")
    .option("--all-chains", "Scan all chains in parallel")
    .action(async (opts) => {
      try {
        const registry = Registry.loadEmbedded();
        const oracleThreshold = parseFloat(opts.oracleThreshold ?? "5.0");
        const stableThreshold = parseFloat(opts.stableThreshold ?? "0.98");
        const rateThreshold = parseFloat(opts.rateThreshold ?? "5.0");
        const interval = parseInt(opts.interval ?? "30", 10);
        const patterns: string = opts.patterns ?? "oracle,stable,exchange_rate";
        const once: boolean = !!opts.once;

        if (opts.allChains) {
          const result = await runAllChains(registry, patterns, oracleThreshold, stableThreshold, rateThreshold);
          printOutput(result, getOpts());
          return;
        }

        const chainName: string = (opts.chain ?? "hyperevm").toLowerCase();
        const chain = registry.getChain(chainName);
        const rpc = chain.effectiveRpcUrl();

        const pats = patterns.split(",").map((s: string) => s.trim());
        const doOracle = pats.includes("oracle");
        const doStable = pats.includes("stable");
        const doRate = pats.includes("exchange_rate");

        // Discover chain resources
        const allTokens = registry.tokens.get(chainName) ?? [];
        const wrappedNative = chain.wrapped_native as Address | undefined;

        const quoteStable = (() => {
          for (const sym of ["USDT", "USDC", "USDT0"]) {
            try { return registry.resolveToken(chainName, sym); } catch { /* continue */ }
          }
          return null;
        })();

        if (!quoteStable) {
          printOutput({ error: `No stablecoin found on chain ${chainName}` }, getOpts());
          return;
        }

        const scanTokens = allTokens.filter(
          (t) => t.address !== "0x0000000000000000000000000000000000000000" && !STABLECOINS.has(t.symbol),
        );

        // Aave oracles
        const oracles: Array<{ name: string; addr: Address; decimals: number }> = registry
          .getProtocolsForChain(chainName)
          .filter(
            (p) =>
              p.category === ProtocolCategory.Lending &&
              (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated"),
          )
          .flatMap((p) => {
            const oracleAddr = p.contracts?.["oracle"];
            if (!oracleAddr) return [];
            const decimals = p.interface === "aave_v2" ? 18 : 8;
            return [{ name: p.name, addr: oracleAddr, decimals }];
          });

        // First uniswap_v2 DEX router
        const dexProto = registry
          .getProtocolsForChain(chainName)
          .find((p) => p.category === ProtocolCategory.Dex && p.interface === "uniswap_v2");
        const dexRouter = dexProto?.contracts?.["router"] as Address | undefined;

        // Compound V2 forks (Venus, Sonne)
        const compoundForks = registry
          .getProtocolsForChain(chainName)
          .filter((p) => p.category === ProtocolCategory.Lending && p.interface === "compound_v2")
          .map((p) => ({
            name: p.name,
            vtokens: Object.entries(p.contracts ?? {}).filter(([k]) => k.startsWith("v")).map(([k, a]) => ({ key: k, addr: a as Address })),
          }));

        const usdc = (() => { try { return registry.resolveToken(chainName, "USDC"); } catch { return null; } })();
        const usdt = (() => { try { return registry.resolveToken(chainName, "USDT"); } catch { return null; } })();

        // Track prev exchange rates across iterations
        const prevRates = new Map<string, number>();

        const runOnce = async () => {
          const timestamp = Math.floor(Date.now() / 1000);
          const t0 = Date.now();

          const calls: Array<[Address, Hex]> = [];
          const callTypes: CallType[] = [];

          // P1: Oracle + DEX price calls
          if (doOracle) {
            for (const oracle of oracles) {
              for (const token of scanTokens) {
                callTypes.push({ kind: "oracle", oracle: oracle.name, token: token.symbol, oracleDecimals: oracle.decimals });
                calls.push([
                  oracle.addr,
                  encodeFunctionData({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] }),
                ]);
              }
            }

            if (dexRouter) {
              for (const token of scanTokens) {
                const amountIn = BigInt(10) ** BigInt(token.decimals);
                const path: Address[] =
                  wrappedNative && token.address.toLowerCase() === wrappedNative.toLowerCase()
                    ? [token.address, quoteStable.address]
                    : wrappedNative
                    ? [token.address, wrappedNative, quoteStable.address]
                    : [token.address, quoteStable.address];
                callTypes.push({ kind: "dex", token: token.symbol, outDecimals: quoteStable.decimals });
                calls.push([
                  dexRouter,
                  encodeFunctionData({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] }),
                ]);
              }
            }
          }

          // P2: Stablecoin cross-peg calls
          if (doStable && usdc && usdt && dexRouter) {
            callTypes.push({ kind: "stable", from: "USDC", to: "USDT", outDecimals: usdt.decimals });
            calls.push([
              dexRouter,
              encodeFunctionData({
                abi: UNIV2_ROUTER_ABI,
                functionName: "getAmountsOut",
                args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]],
              }),
            ]);
            callTypes.push({ kind: "stable", from: "USDT", to: "USDC", outDecimals: usdc.decimals });
            calls.push([
              dexRouter,
              encodeFunctionData({
                abi: UNIV2_ROUTER_ABI,
                functionName: "getAmountsOut",
                args: [BigInt(10) ** BigInt(usdt.decimals), [usdt.address, usdc.address]],
              }),
            ]);
          }

          // P4: Exchange rate calls
          if (doRate) {
            for (const fork of compoundForks) {
              for (const { key, addr } of fork.vtokens) {
                callTypes.push({ kind: "exchangeRate", protocol: fork.name, vtoken: key });
                calls.push([addr, encodeFunctionData({ abi: VTOKEN_ABI, functionName: "exchangeRateStored", args: [] })]);
              }
            }
          }

          if (calls.length === 0) {
            printOutput({ error: `No scannable resources found on ${chainName}` }, getOpts());
            return;
          }

          const results = await multicallRead(rpc, calls);
          const scanMs = Date.now() - t0;

          const alerts: unknown[] = [];
          const oracleByToken = new Map<string, Array<{ oracle: string; price: number }>>();
          const dexByToken = new Map<string, number>();
          const oracleData: Record<string, number> = {};
          const dexData: Record<string, number> = {};
          const stableData: Record<string, number> = {};
          const stablePrices: Array<{ asset: string; pair: string; price: number }> = [];
          const rateData: Record<string, number> = {};

          for (let i = 0; i < callTypes.length; i++) {
            const ct = callTypes[i];
            const raw = results[i] ?? null;

            if (ct.kind === "oracle") {
              const price = parseU256F64(raw, ct.oracleDecimals);
              if (price > 0) {
                const existing = oracleByToken.get(ct.token) ?? [];
                existing.push({ oracle: ct.oracle, price });
                oracleByToken.set(ct.token, existing);
                oracleData[`${ct.oracle}/${ct.token}`] = round4(price);
              }
            } else if (ct.kind === "dex") {
              const price = parseAmountsOutLast(raw, ct.outDecimals);
              if (price > 0) {
                dexByToken.set(ct.token, price);
                dexData[ct.token] = round4(price);
              }
            } else if (ct.kind === "stable") {
              const price = parseAmountsOutLast(raw, ct.outDecimals);
              if (price <= 0) continue;
              const pair = `${ct.from}/${ct.to}`;
              stableData[pair] = round4(price);
              stablePrices.push({ asset: ct.from, pair, price });
            } else if (ct.kind === "exchangeRate") {
              const rate = parseU256F64(raw, 18);
              const key = `${ct.protocol}/${ct.vtoken}`;
              rateData[key] = round6(rate);
              if (rate > 0) {
                const prev = prevRates.get(key);
                if (prev !== undefined) {
                  const change = Math.abs((rate - prev) / prev * 100);
                  if (change > rateThreshold) {
                    const severity = change > 50 ? "critical" : change > 20 ? "high" : "medium";
                    alerts.push({
                      pattern: "exchange_rate_anomaly",
                      severity,
                      protocol: ct.protocol,
                      vtoken: ct.vtoken,
                      prev_rate: round6(prev),
                      curr_rate: round6(rate),
                      change_pct: round2(change),
                      action: `possible donation attack on ${ct.protocol} ${ct.vtoken}`,
                    });
                  }
                }
                prevRates.set(key, rate);
              }
            }
          }

          // Stablecoin depeg alerts
          if (stablePrices.length >= 2) {
            const allBelow = stablePrices.every((s) => s.price < stableThreshold);
            if (!allBelow) {
              for (const { asset, pair, price } of stablePrices) {
                if (price < stableThreshold) {
                  const severity = price < 0.95 ? "critical" : "high";
                  alerts.push({
                    pattern: "stablecoin_depeg",
                    severity,
                    asset,
                    pair,
                    price: round4(price),
                    threshold: stableThreshold,
                    action: `buy ${asset} at $${round4(price)}, wait for repeg`,
                  });
                }
              }
            }
          } else {
            for (const { asset, pair, price } of stablePrices) {
              if (price < stableThreshold) {
                const severity = price < 0.95 ? "critical" : "high";
                alerts.push({
                  pattern: "stablecoin_depeg",
                  severity,
                  asset,
                  pair,
                  price: round4(price),
                  threshold: stableThreshold,
                  action: `buy ${asset} at $${round4(price)}, wait for repeg`,
                });
              }
            }
          }

          // Oracle divergence alerts
          if (doOracle) {
            for (const [token, oracleEntries] of oracleByToken) {
              const dexPrice = dexByToken.get(token);
              if (dexPrice === undefined) continue;
              for (const { oracle, price: oraclePrice } of oracleEntries) {
                // Skip unreliable DEX quotes (no liquidity)
                if (dexPrice < oraclePrice && dexPrice < oraclePrice * 0.1) continue;
                const deviation = Math.abs(dexPrice - oraclePrice) / oraclePrice * 100;
                if (deviation > oracleThreshold) {
                  const severity = deviation > 100 ? "critical" : deviation > 20 ? "high" : "medium";
                  const action =
                    dexPrice > oraclePrice
                      ? `borrow ${token} from ${oracle}, sell on DEX`
                      : `buy ${token} on DEX, use as collateral on ${oracle}`;
                  alerts.push({
                    pattern: "oracle_divergence",
                    severity,
                    asset: token,
                    oracle,
                    oracle_price: round4(oraclePrice),
                    dex_price: round4(dexPrice),
                    deviation_pct: round2(deviation),
                    action,
                  });
                }
              }
            }
          }

          // Build output data object
          const data: Record<string, unknown> = {};
          if (Object.keys(oracleData).length > 0) data["oracle_prices"] = oracleData;
          if (Object.keys(dexData).length > 0) data["dex_prices"] = dexData;
          if (Object.keys(stableData).length > 0) data["stablecoin_pegs"] = stableData;
          if (Object.keys(rateData).length > 0) data["exchange_rates"] = rateData;

          const output = {
            timestamp,
            chain: chain.name,
            scan_duration_ms: scanMs,
            patterns,
            alert_count: alerts.length,
            alerts,
            data,
          };

          for (const alert of alerts as Array<Record<string, unknown>>) {
            process.stderr.write(
              `ALERT [${alert["severity"]}]: ${alert["pattern"]} — ${alert["action"]}\n`,
            );
          }

          printOutput(output, getOpts());
        };

        await runOnce();

        if (!once) {
          const intervalMs = interval * 1000;
          const loop = async () => {
            await new Promise((r) => setTimeout(r, intervalMs));
            await runOnce();
            void loop();
          };
          await loop();
        }
      } catch (err) {
        printOutput({ error: String(err) }, getOpts());
        process.exit(1);
      }
    });
}

async function runAllChains(
  registry: Registry,
  patterns: string,
  oracleThreshold: number,
  stableThreshold: number,
  _rateThreshold: number,
): Promise<unknown> {
  const t0 = Date.now();
  const chainKeys = Array.from(registry.chains.keys());

  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const rpc = chain.effectiveRpcUrl();
      const chainName = chain.name.toLowerCase();
      const allTokens = registry.tokens.get(chainName) ?? [];
      const wrappedNative = chain.wrapped_native as Address | undefined;

      const quoteStable = (() => {
        for (const sym of ["USDT", "USDC", "USDT0"]) {
          try { return registry.resolveToken(chainName, sym); } catch { /* continue */ }
        }
        return null;
      })();
      if (!quoteStable) return null;

      const scanTokens = allTokens.filter(
        (t) => t.address !== "0x0000000000000000000000000000000000000000" && !STABLECOINS.has(t.symbol),
      );

      const pats = patterns.split(",").map((s) => s.trim());
      const doOracle = pats.includes("oracle");
      const doStable = pats.includes("stable");

      const oracles: Array<{ name: string; addr: Address; decimals: number }> = registry
        .getProtocolsForChain(chainName)
        .filter(
          (p) =>
            p.category === ProtocolCategory.Lending &&
            (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated"),
        )
        .flatMap((p) => {
          const oracleAddr = p.contracts?.["oracle"];
          if (!oracleAddr) return [];
          return [{ name: p.name, addr: oracleAddr, decimals: p.interface === "aave_v2" ? 18 : 8 }];
        });

      const dexProto = registry
        .getProtocolsForChain(chainName)
        .find((p) => p.category === ProtocolCategory.Dex && p.interface === "uniswap_v2");
      const dexRouter = dexProto?.contracts?.["router"] as Address | undefined;

      const usdc = (() => { try { return registry.resolveToken(chainName, "USDC"); } catch { return null; } })();
      const usdt = (() => { try { return registry.resolveToken(chainName, "USDT"); } catch { return null; } })();

      const calls: Array<[Address, Hex]> = [];
      type CT = { kind: "oracle"; oracle: string; token: string; dec: number } | { kind: "dex"; token: string; dec: number } | { kind: "stable"; from: string; to: string; dec: number };
      const cts: CT[] = [];

      if (doOracle) {
        for (const oracle of oracles) {
          for (const token of scanTokens) {
            cts.push({ kind: "oracle", oracle: oracle.name, token: token.symbol, dec: oracle.decimals });
            calls.push([oracle.addr, encodeFunctionData({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] })]);
          }
        }
        if (dexRouter) {
          for (const token of scanTokens) {
            const path: Address[] =
              wrappedNative && token.address.toLowerCase() === wrappedNative.toLowerCase()
                ? [token.address, quoteStable.address]
                : wrappedNative
                ? [token.address, wrappedNative, quoteStable.address]
                : [token.address, quoteStable.address];
            cts.push({ kind: "dex", token: token.symbol, dec: quoteStable.decimals });
            calls.push([dexRouter, encodeFunctionData({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(token.decimals), path] })]);
          }
        }
      }

      if (doStable && usdc && usdt && dexRouter) {
        cts.push({ kind: "stable", from: "USDC", to: "USDT", dec: usdt.decimals });
        calls.push([dexRouter, encodeFunctionData({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]] })]);
        cts.push({ kind: "stable", from: "USDT", to: "USDC", dec: usdc.decimals });
        calls.push([dexRouter, encodeFunctionData({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdt.decimals), [usdt.address, usdc.address]] })]);
      }

      if (calls.length === 0) return null;

      const ct0 = Date.now();
      const results = await multicallRead(rpc, calls);
      const scanMs = Date.now() - ct0;

      const alerts: unknown[] = [];
      const oracleByToken = new Map<string, Array<{ oracle: string; price: number }>>();
      const dexByToken = new Map<string, number>();
      const stablePrices: Array<{ asset: string; pair: string; price: number }> = [];

      for (let i = 0; i < cts.length; i++) {
        const ct = cts[i];
        const raw = results[i] ?? null;
        if (ct.kind === "oracle") {
          const price = parseU256F64(raw, ct.dec);
          if (price > 0) {
            const existing = oracleByToken.get(ct.token) ?? [];
            existing.push({ oracle: ct.oracle, price });
            oracleByToken.set(ct.token, existing);
          }
        } else if (ct.kind === "dex") {
          const price = parseAmountsOutLast(raw, ct.dec);
          if (price > 0) dexByToken.set(ct.token, price);
        } else if (ct.kind === "stable") {
          const price = parseAmountsOutLast(raw, ct.dec);
          if (price > 0) stablePrices.push({ asset: ct.from, pair: `${ct.from}/${ct.to}`, price });
        }
      }

      // Stablecoin depeg
      if (stablePrices.length >= 2) {
        const allBelow = stablePrices.every((s) => s.price < stableThreshold);
        if (!allBelow) {
          for (const { asset, pair, price } of stablePrices) {
            if (price < stableThreshold) {
              alerts.push({ pattern: "stablecoin_depeg", severity: price < 0.95 ? "critical" : "high", asset, pair, price: round4(price) });
            }
          }
        }
      }

      // Oracle divergence
      for (const [token, oEntries] of oracleByToken) {
        const dp = dexByToken.get(token);
        if (dp === undefined) continue;
        for (const { oracle, price: op } of oEntries) {
          if (dp < op && dp < op * 0.1) continue;
          const dev = Math.abs(dp - op) / op * 100;
          if (dev > oracleThreshold) {
            const sev = dev > 100 ? "critical" : dev > 20 ? "high" : "medium";
            alerts.push({
              pattern: "oracle_divergence",
              severity: sev,
              asset: token,
              oracle,
              oracle_price: round4(op),
              dex_price: round4(dp),
              deviation_pct: round2(dev),
              action: dp > op ? `borrow ${token} from ${oracle}, sell on DEX` : `buy ${token} on DEX, collateral on ${oracle}`,
            });
          }
        }
      }

      return { chain: chain.name, scan_duration_ms: scanMs, alert_count: alerts.length, alerts };
    } catch {
      return null;
    }
  });

  const chainResults = (await Promise.all(tasks)).filter(Boolean);
  chainResults.sort((a, b) => {
    const ac = (a as Record<string, unknown>)["alert_count"] as number ?? 0;
    const bc = (b as Record<string, unknown>)["alert_count"] as number ?? 0;
    return bc - ac;
  });

  const totalAlerts = chainResults.reduce((sum, r) => sum + ((r as Record<string, unknown>)["alert_count"] as number ?? 0), 0);

  return {
    mode: "all_chains",
    chains_scanned: chainKeys.length,
    scan_duration_ms: Date.now() - t0,
    total_alerts: totalAlerts,
    chains: chainResults,
  };
}
