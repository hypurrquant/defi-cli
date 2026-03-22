import type { Command } from "commander";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { takeSnapshot, saveSnapshot, loadSnapshots, calculatePnL } from "../portfolio-tracker.js";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) external view returns (uint256)",
]);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
]);

function decodeU256(data: Hex | null, wordOffset = 0): bigint {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}

export function registerPortfolio(parent: Command, getOpts: () => OutputMode): void {
  const portfolio = parent
    .command("portfolio")
    .description("Aggregate positions across all protocols");

  // Show current positions
  portfolio
    .command("show")
    .description("Show current portfolio positions")
    .requiredOption("--address <address>", "Wallet address to query")
    .action(async (opts: { address: string }) => {

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

      const user = opts.address as Address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
        printOutput({ error: `Invalid address: ${opts.address}` }, mode);
        return;
      }

      const rpc = chain.effectiveRpcUrl();
      const calls: Array<[Address, Hex]> = [];
      const callLabels: string[] = [];

      // 1. Token balances
      const tokenSymbols: string[] = (registry.tokens.get(chainName) ?? []).map((t) => t.symbol);

      for (const symbol of tokenSymbols) {
        let entry;
        try {
          entry = registry.resolveToken(chainName, symbol);
        } catch {
          continue;
        }
        if (entry.address === ("0x0000000000000000000000000000000000000000" as Address)) continue;
        calls.push([
          entry.address as Address,
          encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
        ]);
        callLabels.push(`balance:${symbol}`);
      }

      // 2. Lending positions — aave_v3 pools
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

      // 3. Native token price from first available oracle
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

      if (calls.length === 0) {
        printOutput(
          {
            address: user,
            chain: chain.name,
            error: "No protocols or tokens configured for this chain",
          },
          mode,
        );
        return;
      }

      let results: (Hex | null)[];
      try {
        results = await multicallRead(rpc, calls);
      } catch (e) {
        printOutput({ error: `Multicall failed: ${e instanceof Error ? e.message : String(e)}` }, mode);
        return;
      }

      // Get native price (last call if oracle present)
      let nativePriceUsd = 0;
      if (oracleAddr) {
        const priceData = results[results.length - 1] ?? null;
        nativePriceUsd = Number(decodeU256(priceData)) / 1e8;
      }

      let totalValueUsd = 0;
      let idx = 0;
      const tokenBalances: unknown[] = [];

      // Parse token balances
      for (const symbol of tokenSymbols) {
        let entry;
        try {
          entry = registry.resolveToken(chainName, symbol);
        } catch {
          continue;
        }
        if (entry.address === ("0x0000000000000000000000000000000000000000" as Address)) continue;
        if (idx >= results.length) break;

        const balance = decodeU256(results[idx] ?? null);
        if (balance > 0n) {
          const decimals = entry.decimals;
          const balF64 = Number(balance) / 10 ** decimals;
          const symbolUpper = symbol.toUpperCase();
          const valueUsd =
            symbolUpper.includes("USD") || symbolUpper.includes("usd")
              ? balF64
              : balF64 * nativePriceUsd;
          totalValueUsd += valueUsd;
          tokenBalances.push({
            symbol,
            balance: balF64.toFixed(4),
            value_usd: valueUsd.toFixed(2),
          });
        }
        idx++;
      }

      // Parse lending positions
      const lendingPositions: unknown[] = [];
      for (const p of lendingProtocols) {
        if (idx >= results.length) break;
        const data = results[idx] ?? null;
        if (data && data.length >= 2 + 192 * 2) {
          const collateral = Number(decodeU256(data, 0)) / 1e8;
          const debt = Number(decodeU256(data, 1)) / 1e8;
          const hfRaw = decodeU256(data, 5);
          let hf: number | null = null;
          if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
            const v = Number(hfRaw) / 1e18;
            hf = v > 1e10 ? null : v;
          }
          if (collateral > 0 || debt > 0) {
            totalValueUsd += collateral - debt;
            lendingPositions.push({
              protocol: p.name,
              collateral_usd: collateral.toFixed(2),
              debt_usd: debt.toFixed(2),
              health_factor: hf,
            });
          }
        }
        idx++;
      }

      printOutput(
        {
          address: user,
          chain: chain.name,
          native_price_usd: nativePriceUsd.toFixed(2),
          total_value_usd: totalValueUsd.toFixed(2),
          token_balances: tokenBalances,
          lending_positions: lendingPositions,
        },
        mode,
      );
    });

  // --- Subcommand: snapshot ---
  portfolio
    .command("snapshot")
    .description("Take a new portfolio snapshot and save it locally")
    .requiredOption("--address <address>", "Wallet address to snapshot")
    .action(async (opts: { address: string }) => {
      const mode = getOpts();
      const chainName = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();
      const registry = Registry.loadEmbedded();

      if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
        printOutput({ error: `Invalid address: ${opts.address}` }, mode);
        return;
      }

      try {
        const snapshot = await takeSnapshot(chainName, opts.address, registry);
        const filepath = saveSnapshot(snapshot);
        printOutput(
          {
            saved: filepath,
            timestamp: new Date(snapshot.timestamp).toISOString(),
            chain: snapshot.chain,
            wallet: snapshot.wallet,
            total_value_usd: snapshot.total_value_usd.toFixed(2),
            token_count: snapshot.tokens.length,
            defi_position_count: snapshot.defi_positions.length,
          },
          mode,
        );
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, mode);
      }
    });

  // --- Subcommand: pnl ---
  portfolio
    .command("pnl")
    .description("Show PnL since the last snapshot")
    .requiredOption("--address <address>", "Wallet address")
    .option("--since <hours>", "Compare against snapshot from N hours ago (default: last snapshot)")
    .action(async (opts: { address: string; since?: string }) => {
      const mode = getOpts();
      const chainName = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();
      const registry = Registry.loadEmbedded();

      if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
        printOutput({ error: `Invalid address: ${opts.address}` }, mode);
        return;
      }

      const snapshots = loadSnapshots(chainName, opts.address, 50);
      if (snapshots.length === 0) {
        printOutput({ error: "No snapshots found. Run `portfolio snapshot` first." }, mode);
        return;
      }

      let previous = snapshots[0];
      if (opts.since) {
        const sinceMs = parseFloat(opts.since) * 60 * 60 * 1000;
        const cutoff = Date.now() - sinceMs;
        const match = snapshots.find((s) => s.timestamp <= cutoff);
        if (!match) {
          printOutput({ error: `No snapshot found older than ${opts.since} hours` }, mode);
          return;
        }
        previous = match;
      }

      try {
        const current = await takeSnapshot(chainName, opts.address, registry);
        const pnl = calculatePnL(current, previous);
        printOutput(
          {
            chain: chainName,
            wallet: opts.address,
            previous_snapshot: new Date(previous.timestamp).toISOString(),
            current_time: new Date(current.timestamp).toISOString(),
            ...pnl,
            pnl_usd: pnl.pnl_usd.toFixed(2),
            pnl_pct: pnl.pnl_pct.toFixed(4),
            start_value_usd: pnl.start_value_usd.toFixed(2),
            end_value_usd: pnl.end_value_usd.toFixed(2),
          },
          mode,
        );
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, mode);
      }
    });

  // --- Subcommand: history ---
  portfolio
    .command("history")
    .description("List saved portfolio snapshots with values")
    .requiredOption("--address <address>", "Wallet address")
    .option("--limit <n>", "Number of snapshots to show", "10")
    .action(async (opts: { address: string; limit: string }) => {
      const mode = getOpts();
      const chainName = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();

      if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
        printOutput({ error: `Invalid address: ${opts.address}` }, mode);
        return;
      }

      const limit = parseInt(opts.limit, 10);
      const snapshots = loadSnapshots(chainName, opts.address, limit);

      if (snapshots.length === 0) {
        printOutput({ message: "No snapshots found for this address on this chain." }, mode);
        return;
      }

      const history = snapshots.map((s) => ({
        timestamp: new Date(s.timestamp).toISOString(),
        chain: s.chain,
        wallet: s.wallet,
        total_value_usd: s.total_value_usd.toFixed(2),
        token_count: s.tokens.length,
        defi_position_count: s.defi_positions.length,
      }));

      printOutput({ snapshots: history }, mode);
    });
}
