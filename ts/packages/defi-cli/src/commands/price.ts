import type { Command } from "commander";
import type { Address } from "viem";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import { createOracleFromLending, createOracleFromCdp, createDex, DexSpotPrice } from "@hypurrquant/defi-protocols";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

interface PriceEntry {
  source: string;
  source_type: string;
  price: number;
}

interface PriceReport {
  asset: string;
  asset_address: string;
  prices: PriceEntry[];
  max_spread_pct: number;
  oracle_vs_dex_spread_pct: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function resolveAsset(
  registry: Registry,
  chain: string,
  asset: string,
): { address: Address; symbol: string; decimals: number } {
  // Try parse as address
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    return { address: asset as Address, symbol: asset, decimals: 18 };
  }
  const token = registry.resolveToken(chain, asset);
  return { address: token.address, symbol: token.symbol, decimals: token.decimals };
}

const WHYPE_ADDRESS = "0x5555555555555555555555555555555555555555" as Address;

export function registerPrice(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("price")
    .description("Query asset prices from oracles and DEXes")
    .requiredOption("--asset <token>", "Token symbol or address")
    .option("--source <source>", "Price source: oracle, dex, or all", "all")
    .action(async (opts: { asset: string; source: string }) => {
      const mode = getOpts();
      const registry = Registry.loadEmbedded();
      const chainName = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();

      let chain;
      try {
        chain = registry.getChain(chainName);
      } catch (e) {
        printOutput({ error: `Chain not found: ${chainName}` }, mode);
        return;
      }

      const rpcUrl = chain.effectiveRpcUrl();

      let assetAddr: Address;
      let assetSymbol: string;
      let assetDecimals: number;
      try {
        const resolved = resolveAsset(registry, chainName, opts.asset);
        assetAddr = resolved.address;
        assetSymbol = resolved.symbol;
        assetDecimals = resolved.decimals;
      } catch (e) {
        printOutput({ error: `Could not resolve asset: ${opts.asset}` }, mode);
        return;
      }

      const fetchOracle = opts.source === "all" || opts.source === "oracle";
      const fetchDex = opts.source === "all" || opts.source === "dex";

      const allPrices: Array<{ source: string; source_type: string; price_f64: number }> = [];

      // Oracle prices from lending protocols (Aave V3 forks)
      if (fetchOracle) {
        const lendingProtocols = registry.getProtocolsByCategory(ProtocolCategory.Lending)
          .filter((p) => p.chain.toLowerCase() === chainName);

        await Promise.all(
          lendingProtocols.map(async (entry) => {
            try {
              const oracle = createOracleFromLending(entry, rpcUrl);
              const price = await oracle.getPrice(assetAddr);
              allPrices.push({
                source: price.source,
                source_type: price.source_type,
                price_f64: price.price_f64,
              });
            } catch {
              // Interface doesn't support oracle — skip
            }
          }),
        );

        // Oracle prices from CDP protocols (Felix) — only for WHYPE
        const isWhype =
          assetAddr.toLowerCase() === WHYPE_ADDRESS.toLowerCase() ||
          assetSymbol.toUpperCase() === "WHYPE" ||
          assetSymbol.toUpperCase() === "HYPE";

        if (isWhype) {
          const cdpProtocols = registry.getProtocolsByCategory(ProtocolCategory.Cdp)
            .filter((p) => p.chain.toLowerCase() === chainName);

          await Promise.all(
            cdpProtocols.map(async (entry) => {
              try {
                const oracle = createOracleFromCdp(entry, assetAddr, rpcUrl);
                const price = await oracle.getPrice(assetAddr);
                allPrices.push({
                  source: price.source,
                  source_type: price.source_type,
                  price_f64: price.price_f64,
                });
              } catch {
                // skip
              }
            }),
          );
        }
      }

      // DEX spot prices
      if (fetchDex) {
        let usdcToken;
        try {
          usdcToken = registry.resolveToken(chainName, "USDC");
        } catch {
          process.stderr.write("USDC token not found in registry — skipping DEX prices\n");
        }

        if (usdcToken) {
          const dexProtocols = registry.getProtocolsByCategory(ProtocolCategory.Dex)
            .filter((p) => p.chain.toLowerCase() === chainName);

          await Promise.all(
            dexProtocols.map(async (entry) => {
              try {
                const dex = createDex(entry, rpcUrl);
                const price = await DexSpotPrice.getPrice(
                  dex,
                  assetAddr,
                  assetDecimals,
                  usdcToken!.address,
                  usdcToken!.decimals,
                );
                allPrices.push({
                  source: price.source,
                  source_type: price.source_type,
                  price_f64: price.price_f64,
                });
              } catch {
                // skip
              }
            }),
          );
        }
      }

      if (allPrices.length === 0) {
        printOutput({ error: "No prices could be fetched from any source" }, mode);
        return;
      }

      const pricesF64 = allPrices.map((p) => p.price_f64);
      const maxPrice = Math.max(...pricesF64);
      const minPrice = Math.min(...pricesF64);
      const maxSpreadPct = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;

      const oraclePrices = allPrices.filter((p) => p.source_type === "oracle").map((p) => p.price_f64);
      const dexPrices = allPrices.filter((p) => p.source_type === "dex_spot").map((p) => p.price_f64);

      let oracleVsDexSpreadPct = 0;
      if (oraclePrices.length > 0 && dexPrices.length > 0) {
        const avgOracle = oraclePrices.reduce((a, b) => a + b, 0) / oraclePrices.length;
        const avgDex = dexPrices.reduce((a, b) => a + b, 0) / dexPrices.length;
        const minAvg = Math.min(avgOracle, avgDex);
        oracleVsDexSpreadPct = minAvg > 0 ? (Math.abs(avgOracle - avgDex) / minAvg) * 100 : 0;
      }

      const report: PriceReport = {
        asset: assetSymbol,
        asset_address: assetAddr,
        prices: allPrices.map((p) => ({
          source: p.source,
          source_type: p.source_type,
          price: round2(p.price_f64),
        })),
        max_spread_pct: round2(maxSpreadPct),
        oracle_vs_dex_spread_pct: round2(oracleVsDexSpreadPct),
      };

      printOutput(report, mode);
    });
}
