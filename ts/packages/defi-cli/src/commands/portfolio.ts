import type { Command } from "commander";
import type { Address, Hex } from "viem";
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { takeSnapshot, saveSnapshot, loadSnapshots, calculatePnL } from "../portfolio-tracker.js";
import { requireChain, errMsg } from "../utils.js";

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
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts: { address?: string }) => {

      const mode = getOpts();
      const registry = Registry.loadEmbedded();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;

      let chain;
      try {
        chain = registry.getChain(chainName);
      } catch (e) {
        printOutput({ error: `Chain not found: ${chainName}` }, mode);
        return;
      }

      const addr = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!addr) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, mode); return; }
      const user = addr as Address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
        printOutput({ error: `Invalid address: ${addr}` }, mode);
        return;
      }

      const rpc = chain.effectiveRpcUrl();
      const calls: Array<[Address, Hex]> = [];
      const callLabels: string[] = [];

      // 1. Token balances + per-asset oracle prices.
      // We collect ERC20 balances and (when an oracle is configured) the
      // matching getAssetPrice for each token in one multicall round-trip,
      // because pricing every non-USD token at the *native* asset's price
      // (the previous behaviour) wildly mis-valued positions like RAM/KITTEN
      // — RAM ≈ $0.01 was being reported as ≈$41/RAM (HYPE price).
      const tokenSymbols: string[] = (registry.tokens.get(chainName) ?? []).map((t) => t.symbol);
      const tokenAddrsByCallIdx: Address[] = []; // address per balance call (parallel array)

      const oracleEntry = registry
        .getProtocolsForChain(chainName)
        .find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
      const oracleAddr = oracleEntry?.contracts?.["oracle"] as Address | undefined;
      const wrappedNative = (chain.wrapped_native ?? "0x5555555555555555555555555555555555555555") as Address;

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
        tokenAddrsByCallIdx.push(entry.address as Address);
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

      // 3. Per-token oracle prices + wrapped-native price.
      // The wrapped-native price is also used as the native gas-token price.
      const priceTokens: Address[] = [];
      if (oracleAddr) {
        for (const tokenAddr of tokenAddrsByCallIdx) {
          calls.push([
            oracleAddr,
            encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [tokenAddr] }),
          ]);
          callLabels.push(`price:${tokenAddr}`);
          priceTokens.push(tokenAddr);
        }
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
        printOutput({ error: `Multicall failed: ${errMsg(e)}` }, mode);
        return;
      }

      // Per-token oracle prices and the native price live at the tail of the
      // results array (after balances + lending data). Decode the native
      // price first, then build a lookup map of tokenAddr → priceUsd.
      const balanceCallCount = tokenAddrsByCallIdx.length;
      const lendingCallCount = lendingProtocols.length;
      const priceStartIdx = balanceCallCount + lendingCallCount;

      let nativePriceUsd = 0;
      const priceByToken = new Map<string, number>();
      if (oracleAddr) {
        for (let i = 0; i < priceTokens.length; i++) {
          const priceData = results[priceStartIdx + i] ?? null;
          const px = Number(decodeU256(priceData)) / 1e8;
          if (px > 0) priceByToken.set(priceTokens[i].toLowerCase(), px);
        }
        const nativePriceData = results[priceStartIdx + priceTokens.length] ?? null;
        nativePriceUsd = Number(decodeU256(nativePriceData)) / 1e8;
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
          // Pricing precedence:
          //   1. USD-symbol stablecoins → 1:1 (covers USDC/USDT/USDe/USDH/etc.).
          //   2. Wrapped-native token → use the native price we already fetched.
          //   3. Any other token → use the per-asset oracle price if available;
          //      otherwise null (omit from total) instead of pretending the
          //      token trades at the native asset's price.
          const tokenAddrLower = (entry.address as Address).toLowerCase();
          let valueUsd: number | null;
          if (symbolUpper.includes("USD")) {
            valueUsd = balF64;
          } else if (tokenAddrLower === wrappedNative.toLowerCase()) {
            valueUsd = balF64 * nativePriceUsd;
          } else {
            const px = priceByToken.get(tokenAddrLower);
            valueUsd = px && px > 0 ? balF64 * px : null;
          }
          if (valueUsd !== null) totalValueUsd += valueUsd;
          tokenBalances.push({
            symbol,
            balance: balF64.toFixed(4),
            value_usd: valueUsd !== null ? valueUsd.toFixed(2) : null,
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

      // Native gas-token balance — separate eth_getBalance round-trip so the
      // total reflects the wallet's actual on-chain net worth rather than just
      // the ERC20 + lending slice.
      let nativeBalance = 0n;
      let nativeValueUsd = 0;
      try {
        const client = createPublicClient({ transport: http(rpc) });
        nativeBalance = await client.getBalance({ address: user });
        const nativeF64 = Number(nativeBalance) / 1e18;
        nativeValueUsd = nativeF64 * nativePriceUsd;
        if (nativeBalance > 0n) totalValueUsd += nativeValueUsd;
      } catch {
        // Native balance is best-effort; an RPC hiccup here shouldn't fail
        // the whole portfolio query.
      }

      printOutput(
        {
          address: user,
          chain: chain.name,
          native_price_usd: nativePriceUsd.toFixed(2),
          native_balance: (Number(nativeBalance) / 1e18).toFixed(6),
          native_value_usd: nativeValueUsd.toFixed(2),
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
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts: { address?: string }) => {
      const mode = getOpts();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();

      const addr = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!addr) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, mode); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        printOutput({ error: `Invalid address: ${addr}` }, mode);
        return;
      }

      try {
        const snapshot = await takeSnapshot(chainName, addr, registry);
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
        printOutput({ error: errMsg(e) }, mode);
      }
    });

  // --- Subcommand: pnl ---
  portfolio
    .command("pnl")
    .description("Show PnL since the last snapshot")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .option("--since <hours>", "Compare against snapshot from N hours ago (default: last snapshot)")
    .action(async (opts: { address?: string; since?: string }) => {
      const mode = getOpts();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();

      const addr = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!addr) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, mode); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        printOutput({ error: `Invalid address: ${addr}` }, mode);
        return;
      }

      const snapshots = loadSnapshots(chainName, addr, 50);
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
        const current = await takeSnapshot(chainName, addr, registry);
        const pnl = calculatePnL(current, previous);
        printOutput(
          {
            chain: chainName,
            wallet: addr,
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
        printOutput({ error: errMsg(e) }, mode);
      }
    });

  // --- Subcommand: history ---
  portfolio
    .command("history")
    .description("List saved portfolio snapshots with values")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .option("--limit <n>", "Number of snapshots to show", "10")
    .action(async (opts: { address?: string; limit: string }) => {
      const mode = getOpts();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;

      const addr = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!addr) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, mode); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        printOutput({ error: `Invalid address: ${addr}` }, mode);
        return;
      }

      const limit = parseInt(opts.limit, 10);
      const snapshots = loadSnapshots(chainName, addr, limit);

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
