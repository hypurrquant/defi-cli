import type { Command } from "commander";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) external view returns (uint256)",
]);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
]);

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function estimateTokenValue(symbol: string, balance: number, nativePrice: number): number {
  const s = symbol.toUpperCase();
  if (s.includes("USD") || s.includes("DAI")) return balance;
  if (s.includes("BTC") || s.includes("FBTC")) return balance * 75000;
  if (["WETH", "ETH", "METH", "CBETH", "WSTETH"].includes(s)) return balance * 2350;
  return balance * nativePrice;
}

function decodeU256(data: Hex | null, offset = 0): bigint {
  if (!data || data.length < 2 + (offset + 32) * 2) return 0n;
  const hex = data.slice(2 + offset * 64, 2 + offset * 64 + 64);
  return BigInt("0x" + hex);
}

interface ChainScanResult {
  chain_name: string;
  native_price: number;
  chain_value: number;
  collateral: number;
  debt: number;
  token_balances: unknown[];
  lending_positions: unknown[];
}

async function scanSingleChain(
  chainName: string,
  rpc: string,
  user: Address,
  tokens: Array<{ address: Address; symbol: string; decimals: number }>,
  lendingPools: Array<{ name: string; pool: Address; iface: string }>,
  oracleAddr: Address | undefined,
  wrappedNative: Address,
): Promise<ChainScanResult | null> {
  const calls: Array<[Address, Hex]> = [];

  type CallType =
    | { kind: "token"; symbol: string; decimals: number }
    | { kind: "lending"; protocol: string; iface: string }
    | { kind: "native_price" };

  const callTypes: CallType[] = [];

  for (const token of tokens) {
    if (token.address !== ("0x0000000000000000000000000000000000000000" as Address)) {
      callTypes.push({ kind: "token", symbol: token.symbol, decimals: token.decimals });
      calls.push([
        token.address,
        encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
      ]);
    }
  }

  for (const { name, pool, iface } of lendingPools) {
    callTypes.push({ kind: "lending", protocol: name, iface });
    calls.push([
      pool,
      encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [user] }),
    ]);
  }

  if (oracleAddr) {
    callTypes.push({ kind: "native_price" });
    calls.push([
      oracleAddr,
      encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [wrappedNative] }),
    ]);
  }

  if (calls.length === 0) return null;

  let results: (Hex | null)[];
  try {
    results = await multicallRead(rpc, calls);
  } catch {
    return null;
  }

  const nativePrice = oracleAddr
    ? Number(decodeU256(results[results.length - 1]!)) / 1e8
    : 0;

  const tokenBalances: unknown[] = [];
  const lendingPositions: unknown[] = [];
  let chainValue = 0;
  let totalColl = 0;
  let totalDebt = 0;

  for (let i = 0; i < callTypes.length; i++) {
    const ct = callTypes[i]!;
    const data = results[i] ?? null;

    if (ct.kind === "token") {
      const balance = decodeU256(data);
      if (balance > 0n) {
        const balF64 = Number(balance) / 10 ** ct.decimals;
        const valueUsd = estimateTokenValue(ct.symbol, balF64, nativePrice);
        if (valueUsd > 0.01) {
          chainValue += valueUsd;
          tokenBalances.push({
            symbol: ct.symbol,
            balance: round4(balF64),
            value_usd: round2(valueUsd),
          });
        }
      }
    } else if (ct.kind === "lending") {
      if (data && data.length >= 2 + 192 * 2) {
        const priceDecimals = ct.iface === "aave_v2" ? 18 : 8;
        const divisor = 10 ** priceDecimals;
        const collateral = Number(decodeU256(data, 0)) / divisor;
        const debt = Number(decodeU256(data, 1)) / divisor;
        const hfRaw = decodeU256(data, 5);
        let hf: number | null = null;
        if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
          const v = Number(hfRaw) / 1e18;
          hf = v > 1e10 ? null : round2(v);
        }

        if (collateral > 0.01 || debt > 0.01) {
          const net = collateral - debt;
          chainValue += net;
          totalColl += collateral;
          totalDebt += debt;
          lendingPositions.push({
            protocol: ct.protocol,
            collateral_usd: round2(collateral),
            debt_usd: round2(debt),
            net_usd: round2(net),
            health_factor: hf,
          });
        }
      }
    }
    // native_price call — already decoded above
  }

  if (tokenBalances.length === 0 && lendingPositions.length === 0) return null;

  return {
    chain_name: chainName,
    native_price: nativePrice,
    chain_value: chainValue,
    collateral: totalColl,
    debt: totalDebt,
    token_balances: tokenBalances,
    lending_positions: lendingPositions,
  };
}

export function registerPositions(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("positions")
    .description("Cross-chain position scanner: find all your positions everywhere")
    .requiredOption("--address <address>", "Wallet address to scan")
    .option("--chains <chains>", "Comma-separated chain names (omit for all)")
    .action(async (opts: { address: string; chains?: string }) => {
      const mode = getOpts();
      const registry = Registry.loadEmbedded();

      const user = opts.address as Address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
        printOutput({ error: `Invalid address: ${opts.address}` }, mode);
        return;
      }

      const chainFilter = opts.chains
        ? opts.chains.split(",").map((s) => s.trim().toLowerCase())
        : null;

      const chainKeys = chainFilter ?? Array.from(registry.chains.keys());

      const start = Date.now();

      // Build scan params for each chain
      const scanParams: Array<{
        chainName: string;
        rpc: string;
        tokens: Array<{ address: Address; symbol: string; decimals: number }>;
        lendingPools: Array<{ name: string; pool: Address; iface: string }>;
        oracleAddr: Address | undefined;
        wrappedNative: Address;
      }> = [];

      for (const chainKey of chainKeys) {
        let chain;
        try {
          chain = registry.getChain(chainKey);
        } catch {
          continue;
        }
        const rpc = chain.effectiveRpcUrl();
        const rawTokens = registry.tokens.get(chainKey) ?? [];
        const tokens = rawTokens.map((t) => ({
          address: t.address as Address,
          symbol: t.symbol,
          decimals: t.decimals,
        }));

        const chainProtocols = registry.getProtocolsForChain(chainKey);

        const lendingPools = chainProtocols
          .filter(
            (p) =>
              p.category === ProtocolCategory.Lending &&
              (p.interface === "aave_v3" || p.interface === "aave_v2"),
          )
          .filter((p) => p.contracts?.["pool"])
          .map((p) => ({
            name: p.name,
            pool: p.contracts!["pool"] as Address,
            iface: p.interface,
          }));

        const oracleEntry = chainProtocols.find(
          (p) => p.interface === "aave_v3" && p.contracts?.["oracle"],
        );
        const oracleAddr = oracleEntry?.contracts?.["oracle"] as Address | undefined;

        const wrappedNative = (chain.wrapped_native ?? "0x5555555555555555555555555555555555555555") as Address;

        scanParams.push({ chainName: chain.name, rpc, tokens, lendingPools, oracleAddr, wrappedNative });
      }

      // Run all chains in parallel
      const chainResultsRaw = await Promise.all(
        scanParams.map((p) =>
          scanSingleChain(p.chainName, p.rpc, user, p.tokens, p.lendingPools, p.oracleAddr, p.wrappedNative),
        ),
      );

      let grandTotalUsd = 0;
      let totalCollateralUsd = 0;
      let totalDebtUsd = 0;

      const chainResults = chainResultsRaw
        .filter((r): r is ChainScanResult => r !== null)
        .map((r) => {
          grandTotalUsd += r.chain_value;
          totalCollateralUsd += r.collateral;
          totalDebtUsd += r.debt;
          return {
            chain: r.chain_name,
            native_price_usd: round2(r.native_price),
            chain_total_usd: round2(r.chain_value),
            token_balances: r.token_balances,
            lending_positions: r.lending_positions,
          };
        })
        .sort((a, b) => b.chain_total_usd - a.chain_total_usd);

      const scanMs = Date.now() - start;

      printOutput(
        {
          address: user,
          scan_duration_ms: scanMs,
          chains_scanned: chainKeys.length,
          chains_with_positions: chainResults.length,
          summary: {
            total_value_usd: round2(grandTotalUsd),
            total_collateral_usd: round2(totalCollateralUsd),
            total_debt_usd: round2(totalDebtUsd),
            net_lending_usd: round2(totalCollateralUsd - totalDebtUsd),
          },
          chains: chainResults,
        },
        mode,
      );
    });
}
