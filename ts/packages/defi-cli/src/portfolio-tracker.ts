import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { PortfolioSnapshot, TokenBalance, DefiPosition, PortfolioPnL, TokenChange } from "@hypurrquant/defi-core";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) external view returns (uint256)",
]);

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
]);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

function decodeU256Word(data: Hex | null, wordOffset = 0): bigint {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}

function snapshotDir(): string {
  return resolve(homedir(), ".defi-cli", "snapshots");
}

export async function takeSnapshot(
  chainName: string,
  wallet: string,
  registry: Registry,
): Promise<PortfolioSnapshot> {
  const chain = registry.getChain(chainName);
  const user = wallet as Address;
  const rpc = chain.effectiveRpcUrl();

  const calls: Array<[Address, Hex]> = [];
  const callLabels: string[] = [];

  // 1. Token balances
  const tokenEntries: Array<{ symbol: string; address: Address; decimals: number }> = [];
  for (const t of registry.tokens.get(chainName) ?? []) {
    let entry;
    try {
      entry = registry.resolveToken(chainName, t.symbol);
    } catch {
      continue;
    }
    if (entry.address === ("0x0000000000000000000000000000000000000000" as Address)) continue;
    tokenEntries.push({ symbol: t.symbol, address: entry.address as Address, decimals: entry.decimals });
    calls.push([
      entry.address as Address,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
    ]);
    callLabels.push(`balance:${t.symbol}`);
  }

  // 2. Lending positions (aave_v3)
  const lendingProtocols = registry
    .getProtocolsForChain(chainName)
    .filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3")
    .filter((p) => p.contracts?.["pool"]);

  for (const p of lendingProtocols) {
    calls.push([
      p.contracts!["pool"] as Address,
      encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [user] }),
    ]);
    callLabels.push(`lending:${p.name}`);
  }

  // 3. Native price from oracle
  const oracleEntry = registry
    .getProtocolsForChain(chainName)
    .find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
  const oracleAddr = oracleEntry?.contracts?.["oracle"] as Address | undefined;
  const wrappedNative = (chain.wrapped_native ?? "0x5555555555555555555555555555555555555555") as Address;

  if (oracleAddr) {
    calls.push([
      oracleAddr,
      encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [wrappedNative] }),
    ]);
    callLabels.push("price:native");
  }

  let results: (Hex | null)[] = calls.map(() => null);
  if (calls.length > 0) {
    results = await multicallRead(rpc, calls);
  }

  // Native price
  let nativePriceUsd = 0;
  if (oracleAddr) {
    const priceData = results[results.length - 1] ?? null;
    nativePriceUsd = Number(decodeU256Word(priceData)) / 1e8;
  }

  let idx = 0;
  const tokens: TokenBalance[] = [];
  let totalValueUsd = 0;

  // Parse token balances
  for (const entry of tokenEntries) {
    if (idx >= results.length) break;
    const balance = decodeU256Word(results[idx] ?? null);
    const balF64 = Number(balance) / 10 ** entry.decimals;
    const symbolUpper = entry.symbol.toUpperCase();
    const priceUsd =
      symbolUpper.includes("USD") ? 1 : nativePriceUsd;
    const valueUsd = balF64 * priceUsd;
    totalValueUsd += valueUsd;
    tokens.push({
      token: entry.address,
      symbol: entry.symbol,
      balance,
      value_usd: valueUsd,
      price_usd: priceUsd,
    });
    idx++;
  }

  // Parse lending positions
  const defiPositions: DefiPosition[] = [];
  for (const p of lendingProtocols) {
    if (idx >= results.length) break;
    const data = results[idx] ?? null;
    if (data && data.length >= 2 + 192 * 2) {
      const collateral = Number(decodeU256Word(data, 0)) / 1e8;
      const debt = Number(decodeU256Word(data, 1)) / 1e8;
      if (collateral > 0) {
        totalValueUsd += collateral;
        defiPositions.push({
          protocol: p.name,
          type: "lending_supply",
          asset: "collateral",
          amount: BigInt(Math.round(collateral * 1e8)),
          value_usd: collateral,
        });
      }
      if (debt > 0) {
        totalValueUsd -= debt;
        defiPositions.push({
          protocol: p.name,
          type: "lending_borrow",
          asset: "debt",
          amount: BigInt(Math.round(debt * 1e8)),
          value_usd: debt,
        });
      }
    }
    idx++;
  }

  return {
    timestamp: Date.now(),
    chain: chainName,
    wallet,
    tokens,
    defi_positions: defiPositions,
    total_value_usd: totalValueUsd,
  };
}

export function saveSnapshot(snapshot: PortfolioSnapshot): string {
  const dir = snapshotDir();
  mkdirSync(dir, { recursive: true });
  const filename = `${snapshot.chain}_${snapshot.wallet}_${snapshot.timestamp}.json`;
  const filepath = resolve(dir, filename);
  writeFileSync(filepath, JSON.stringify(snapshot, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return filepath;
}

export function loadSnapshots(chain: string, wallet: string, limit = 10): PortfolioSnapshot[] {
  const dir = snapshotDir();
  if (!existsSync(dir)) return [];

  const prefix = `${chain}_${wallet}_`;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map((f) => {
    const raw = JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
    // Restore bigint fields
    if (Array.isArray(raw.tokens)) {
      for (const t of raw.tokens) {
        if (typeof t.balance === "string") t.balance = BigInt(t.balance);
      }
    }
    if (Array.isArray(raw.defi_positions)) {
      for (const p of raw.defi_positions) {
        if (typeof p.amount === "string") p.amount = BigInt(p.amount);
      }
    }
    return raw as PortfolioSnapshot;
  });
}

export function calculatePnL(current: PortfolioSnapshot, previous: PortfolioSnapshot): PortfolioPnL {
  const startValue = previous.total_value_usd;
  const endValue = current.total_value_usd;
  const pnlUsd = endValue - startValue;
  const pnlPct = startValue !== 0 ? (pnlUsd / startValue) * 100 : 0;

  const prevTokenMap = new Map<string, TokenBalance>();
  for (const t of previous.tokens) {
    prevTokenMap.set(t.symbol, t);
  }

  const tokenChanges: TokenChange[] = [];
  for (const t of current.tokens) {
    const prev = prevTokenMap.get(t.symbol);
    const prevBalance = prev?.balance ?? 0n;
    const prevValueUsd = prev?.value_usd ?? 0;
    const balanceChange = t.balance - prevBalance;
    const valueChangeUsd = t.value_usd - prevValueUsd;
    if (balanceChange !== 0n || Math.abs(valueChangeUsd) > 0.001) {
      tokenChanges.push({
        symbol: t.symbol,
        balance_change: balanceChange,
        value_change_usd: valueChangeUsd,
      });
    }
  }

  const durationMs = current.timestamp - previous.timestamp;
  const durationHours = durationMs / (1000 * 60 * 60);
  const period =
    durationHours < 1
      ? `${Math.round(durationMs / 60000)}m`
      : durationHours < 24
        ? `${durationHours.toFixed(1)}h`
        : `${(durationHours / 24).toFixed(1)}d`;

  return {
    period,
    start_value_usd: startValue,
    end_value_usd: endValue,
    pnl_usd: pnlUsd,
    pnl_pct: pnlPct,
    token_changes: tokenChanges,
  };
}
