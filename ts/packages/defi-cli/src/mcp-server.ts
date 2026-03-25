#!/usr/bin/env node
/**
 * MCP (Model Context Protocol) server for defi-cli.
 *
 * Exposes DeFi operations as MCP tools: lending, DEX, bridge, vault, staking,
 * price queries, exploit detection, and portfolio overview.
 * Transactions default to dry-run mode unless DEFI_PRIVATE_KEY is set and
 * broadcast is explicitly requested via the `broadcast` parameter.
 */

import "dotenv/config";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Registry, InterestRateMode } from "@hypurrquant/defi-core";
import { createLending, createDex, createVault, createLiquidStaking } from "@hypurrquant/defi-protocols";
import { Executor } from "./executor.js";
import type { Address } from "viem";

// ── JSON envelope helpers ──

function ok(data: unknown, meta?: Record<string, unknown>) {
  return JSON.stringify({ ok: true, data, meta }, null, 2);
}

function err(error: string, meta?: Record<string, unknown>) {
  return JSON.stringify({ ok: false, error, meta }, null, 2);
}

// ── Registry helper ──

function getRegistry() {
  return Registry.loadEmbedded();
}

function resolveToken(registry: Registry, chainName: string, token: string): Address {
  if (token.startsWith("0x")) return token as Address;
  return registry.resolveToken(chainName, token).address as Address;
}

function makeExecutor(broadcast: boolean, rpcUrl: string, explorerUrl?: string): Executor {
  return new Executor(broadcast, rpcUrl, explorerUrl);
}

// ── MCP Server ──

const _require = createRequire(import.meta.url);
const _pkg = _require("../package.json") as { version: string };

const server = new McpServer(
  { name: "defi-cli", version: _pkg.version },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

// ============================================================
// defi_status — chain and protocol status
// ============================================================

server.tool(
  "defi_status",
  "Show chain and protocol status: lists all protocols deployed on a chain with contract addresses and categories",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm). E.g. hyperevm, ethereum, arbitrum, base"),
  },
  async ({ chain }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocols = registry.getProtocolsForChain(chainName);

      const data = {
        chain: chainName,
        chain_id: chainConfig.chain_id,
        rpc_url: chainConfig.effectiveRpcUrl(),
        protocols: protocols.map(p => ({
          slug: p.slug,
          name: p.name,
          category: p.category,
          interface: p.interface,
          contracts: p.contracts ?? {},
        })),
        summary: {
          total_protocols: protocols.length,
        },
      };

      return { content: [{ type: "text", text: ok(data, { chain: chainName }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e)) }], isError: true };
    }
  },
);

// ============================================================
// defi_lending_rates — get lending rates for a protocol
// ============================================================

server.tool(
  "defi_lending_rates",
  "Get current supply and borrow rates for an asset on a lending protocol (e.g. Aave V3)",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3, felix"),
    asset: z.string().describe("Token symbol (e.g. USDC) or address (0x...)"),
  },
  async ({ chain, protocol, asset }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const rates = await adapter.getRates(assetAddr);
      return { content: [{ type: "text", text: ok(rates, { chain: chainName, protocol, asset }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  },
);

// ============================================================
// defi_lending_supply — supply to lending protocol
// ============================================================

server.tool(
  "defi_lending_supply",
  "Supply an asset to a lending protocol. Defaults to dry-run (no broadcast). Set broadcast=true to send transaction (requires DEFI_PRIVATE_KEY env var)",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3"),
    asset: z.string().describe("Token symbol or address"),
    amount: z.string().describe("Amount in wei (as string to avoid precision loss)"),
    on_behalf_of: z.string().optional().describe("Supply on behalf of this address (default: DEFI_WALLET_ADDRESS env var)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast the transaction (default: false = dry run)"),
  },
  async ({ chain, protocol, asset, amount, on_behalf_of, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const onBehalfOf = (on_behalf_of ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildSupply({ protocol: protocolConfig.name, asset: assetAddr, amount: BigInt(amount), on_behalf_of: onBehalfOf });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, asset, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  },
);

// ============================================================
// defi_lending_withdraw — withdraw from lending protocol
// ============================================================

server.tool(
  "defi_lending_withdraw",
  "Withdraw a supplied asset from a lending protocol. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3"),
    asset: z.string().describe("Token symbol or address"),
    amount: z.string().describe("Amount in wei to withdraw"),
    to: z.string().optional().describe("Recipient address (default: DEFI_WALLET_ADDRESS)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)"),
  },
  async ({ chain, protocol, asset, amount, to, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const toAddr = (to ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildWithdraw({ protocol: protocolConfig.name, asset: assetAddr, amount: BigInt(amount), to: toAddr });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, asset, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  },
);

// ============================================================
// defi_dex_quote — get swap quote
// ============================================================

server.tool(
  "defi_dex_quote",
  "Get a DEX swap quote without executing. Returns expected output amount and price impact",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3, algebra-v3"),
    token_in: z.string().describe("Input token symbol or address"),
    token_out: z.string().describe("Output token symbol or address"),
    amount_in: z.string().describe("Amount of input token in wei"),
  },
  async ({ chain, protocol, token_in, token_out, amount_in }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenIn = resolveToken(registry, chainName, token_in);
      const tokenOut = resolveToken(registry, chainName, token_out);
      const result = await adapter.quote({ protocol: protocolConfig.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(amount_in) });
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_in, token_out }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, token_in, token_out }) }], isError: true };
    }
  },
);

// ============================================================
// defi_dex_swap — execute swap
// ============================================================

server.tool(
  "defi_dex_swap",
  "Execute a token swap on a DEX. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_in: z.string().describe("Input token symbol or address"),
    token_out: z.string().describe("Output token symbol or address"),
    amount_in: z.string().describe("Amount of input token in wei"),
    slippage_bps: z.number().optional().describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    recipient: z.string().optional().describe("Recipient address (default: DEFI_WALLET_ADDRESS)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)"),
  },
  async ({ chain, protocol, token_in, token_out, amount_in, slippage_bps, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenIn = resolveToken(registry, chainName, token_in);
      const tokenOut = resolveToken(registry, chainName, token_out);
      const recipientAddr = (recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildSwap({
        protocol: protocolConfig.name,
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: BigInt(amount_in),
        slippage: { bps: slippage_bps ?? 50 },
        recipient: recipientAddr,
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_in, token_out, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, token_in, token_out }) }], isError: true };
    }
  },
);

// ============================================================
// defi_dex_lp_add — add liquidity
// ============================================================

server.tool(
  "defi_dex_lp_add",
  "Add liquidity to a DEX pool. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_a: z.string().describe("First token symbol or address"),
    token_b: z.string().describe("Second token symbol or address"),
    amount_a: z.string().describe("Amount of token A in wei"),
    amount_b: z.string().describe("Amount of token B in wei"),
    recipient: z.string().optional().describe("Recipient address for LP tokens"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)"),
  },
  async ({ chain, protocol, token_a, token_b, amount_a, amount_b, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenA = resolveToken(registry, chainName, token_a);
      const tokenB = resolveToken(registry, chainName, token_b);
      const recipientAddr = (recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildAddLiquidity({
        protocol: protocolConfig.name,
        token_a: tokenA,
        token_b: tokenB,
        amount_a: BigInt(amount_a),
        amount_b: BigInt(amount_b),
        recipient: recipientAddr,
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_a, token_b, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  },
);

// ============================================================
// defi_dex_lp_remove — remove liquidity
// ============================================================

server.tool(
  "defi_dex_lp_remove",
  "Remove liquidity from a DEX pool. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_a: z.string().describe("First token symbol or address"),
    token_b: z.string().describe("Second token symbol or address"),
    liquidity: z.string().describe("Liquidity amount to remove in wei"),
    recipient: z.string().optional().describe("Recipient address for returned tokens"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)"),
  },
  async ({ chain, protocol, token_a, token_b, liquidity, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenA = resolveToken(registry, chainName, token_a);
      const tokenB = resolveToken(registry, chainName, token_b);
      const recipientAddr = (recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tx = await adapter.buildRemoveLiquidity({
        protocol: protocolConfig.name,
        token_a: tokenA,
        token_b: tokenB,
        liquidity: BigInt(liquidity),
        recipient: recipientAddr,
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_a, token_b, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  },
);

// ============================================================
// defi_bridge — cross-chain bridge quote
// ============================================================

server.tool(
  "defi_bridge",
  "Get a cross-chain bridge quote via LI.FI, deBridge DLN, or Circle CCTP. Returns estimated output amount and fees",
  {
    from_chain: z.string().describe("Source chain name, e.g. ethereum, arbitrum, base"),
    to_chain: z.string().describe("Destination chain name, e.g. hyperevm, arbitrum"),
    token: z.string().optional().describe("Token symbol to bridge (default: USDC). Use native for native token"),
    amount: z.string().describe("Amount in human-readable units, e.g. '100' for 100 USDC"),
    recipient: z.string().optional().describe("Recipient address on destination chain"),
  },
  async ({ from_chain, to_chain, token, amount, recipient }) => {
    try {
      const tokenSymbol = token ?? "USDC";
      const recipientAddr = recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";

      // Use LI.FI API for a quote
      const LIFI_API = "https://li.quest/v1";
      const registry = getRegistry();

      let fromChainId: number | undefined;
      let toChainId: number | undefined;
      try {
        fromChainId = registry.getChain(from_chain).chain_id;
      } catch { /* use name */ }
      try {
        toChainId = registry.getChain(to_chain).chain_id;
      } catch { /* use name */ }

      const params = new URLSearchParams({
        fromChain: fromChainId ? String(fromChainId) : from_chain,
        toChain: toChainId ? String(toChainId) : to_chain,
        fromToken: tokenSymbol,
        toToken: tokenSymbol,
        fromAmount: String(Math.round(parseFloat(amount) * 1e6)), // USDC decimals
        toAddress: recipientAddr,
      });

      const res = await fetch(`${LIFI_API}/quote?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LI.FI quote failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const estimate = data.estimate as Record<string, unknown> | undefined;

      const quote = {
        from_chain,
        to_chain,
        token: tokenSymbol,
        amount_in: amount,
        amount_out: estimate?.toAmount ? String(Number(estimate.toAmount as string) / 1e6) : "unknown",
        fee_costs: estimate?.feeCosts ?? [],
        gas_costs: estimate?.gasCosts ?? [],
        execution_duration_seconds: estimate?.executionDuration ?? "unknown",
        tool: (data.tool as string) ?? "unknown",
        raw: data,
      };

      return { content: [{ type: "text", text: ok(quote, { from_chain, to_chain, token: tokenSymbol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { from_chain, to_chain }) }], isError: true };
    }
  },
);

// ============================================================
// defi_vault_info — vault information
// ============================================================

server.tool(
  "defi_vault_info",
  "Get vault information: TVL, APY, total shares, and underlying asset details",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug for the vault"),
  },
  async ({ chain, protocol }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createVault(protocolConfig, chainConfig.effectiveRpcUrl());
      const info = await adapter.getVaultInfo();
      return { content: [{ type: "text", text: ok(info, { chain: chainName, protocol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  },
);

// ============================================================
// defi_staking_info — staking information
// ============================================================

server.tool(
  "defi_staking_info",
  "Get liquid staking protocol info: exchange rate, APY, total staked",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug for the staking protocol"),
  },
  async ({ chain, protocol }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLiquidStaking(protocolConfig, chainConfig.effectiveRpcUrl());
      const info = await adapter.getInfo();
      return { content: [{ type: "text", text: ok(info, { chain: chainName, protocol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  },
);

// ============================================================
// defi_price — asset price query
// ============================================================

server.tool(
  "defi_price",
  "Query asset price from on-chain oracles (Aave V3) and/or DEX spot prices",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    asset: z.string().describe("Token symbol (e.g. WBTC) or address (0x...)"),
    source: z.enum(["oracle", "dex", "all"]).optional().describe("Price source: oracle, dex, or all (default: all)"),
  },
  async ({ chain, asset, source }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const srcMode = source ?? "all";

      let assetAddr: Address;
      let assetSymbol: string;
      try {
        if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
          assetAddr = asset as Address;
          assetSymbol = asset;
        } else {
          const token = registry.resolveToken(chainName, asset);
          assetAddr = token.address as Address;
          assetSymbol = token.symbol;
        }
      } catch (e) {
        return { content: [{ type: "text", text: err(`Could not resolve asset: ${asset}`) }], isError: true };
      }

      const { ProtocolCategory } = await import("@hypurrquant/defi-core");
      const { createOracleFromLending } = await import("@hypurrquant/defi-protocols");

      const prices: Array<{ source: string; source_type: string; price: number }> = [];

      if (srcMode === "all" || srcMode === "oracle") {
        const lendingProtos = registry.getProtocolsForChain(chainName)
          .filter(p => p.category === ProtocolCategory.Lending);
        await Promise.all(lendingProtos.map(async (p) => {
          try {
            const oracle = createOracleFromLending(p, rpcUrl);
            const price = await oracle.getPrice(assetAddr);
            if (price.price_f64 > 0) prices.push({ source: p.slug, source_type: "oracle", price: price.price_f64 });
          } catch { /* skip */ }
        }));
      }

      if (srcMode === "all" || srcMode === "dex") {
        const { DexSpotPrice } = await import("@hypurrquant/defi-protocols");
        const USDC_SYMBOL = "USDC";
        let usdcAddr: Address | undefined;
        let usdcDecimals = 6;
        try {
          const usdcToken = registry.resolveToken(chainName, USDC_SYMBOL);
          usdcAddr = usdcToken.address as Address;
          usdcDecimals = usdcToken.decimals;
        } catch { /* no USDC on chain */ }

        // Determine asset decimals from registry if resolved by symbol, else default 18
        let assetDecimals = 18;
        if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) {
          try { assetDecimals = registry.resolveToken(chainName, asset).decimals; } catch { /* default 18 */ }
        }

        if (usdcAddr && assetAddr.toLowerCase() !== usdcAddr.toLowerCase()) {
          const dexProtos = registry.getProtocolsForChain(chainName)
            .filter(p => p.category === ProtocolCategory.Dex);
          await Promise.all(dexProtos.map(async (p) => {
            try {
              const dex = createDex(p, rpcUrl);
              const priceData = await DexSpotPrice.getPrice(dex, assetAddr, assetDecimals, usdcAddr!, usdcDecimals);
              if (priceData.price_f64 > 0) prices.push({ source: p.slug, source_type: "dex", price: priceData.price_f64 });
            } catch { /* skip */ }
          }));
        }
      }

      if (prices.length === 0) {
        return { content: [{ type: "text", text: err(`No price data found for ${assetSymbol} on ${chainName}`) }], isError: true };
      }

      const priceValues = prices.map(p => p.price);
      const avg = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
      const min = Math.min(...priceValues);
      const max = Math.max(...priceValues);
      const spread = max > 0 ? ((max - min) / max) * 100 : 0;

      const report = {
        asset: assetSymbol,
        asset_address: assetAddr,
        prices,
        average_price: Math.round(avg * 100) / 100,
        max_spread_pct: Math.round(spread * 100) / 100,
      };

      return { content: [{ type: "text", text: ok(report, { chain: chainName, asset: assetSymbol, source: srcMode }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { asset }) }], isError: true };
    }
  },
);

// ============================================================
// defi_scan — exploit / price manipulation detection
// ============================================================

server.tool(
  "defi_scan",
  "Scan for potential price manipulation or exploit opportunities by comparing oracle prices vs DEX spot prices across lending protocols",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    min_spread_pct: z.number().optional().describe("Minimum oracle-vs-dex spread % to flag (default: 5)"),
  },
  async ({ chain, min_spread_pct }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();
      const minSpread = min_spread_pct ?? 5;
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();

      const { ProtocolCategory } = await import("@hypurrquant/defi-core");
      const { createOracleFromLending, DexSpotPrice } = await import("@hypurrquant/defi-protocols");

      const tokens = registry.tokens.get(chainName) ?? [];
      const lendingProtos = registry.getProtocolsForChain(chainName)
        .filter(p => p.category === ProtocolCategory.Lending);
      const dexProtos = registry.getProtocolsForChain(chainName)
        .filter(p => p.category === ProtocolCategory.Dex);

      let usdcAddr: Address | undefined;
      try {
        usdcAddr = registry.resolveToken(chainName, "USDC").address as Address;
      } catch { /* no USDC */ }

      const findings: Array<{
        token: string;
        address: string;
        oracle_price: number;
        dex_price: number;
        spread_pct: number;
        verdict: string;
      }> = [];

      for (const token of tokens.slice(0, 20)) {
        const addr = token.address as Address;
        if (!usdcAddr || addr.toLowerCase() === usdcAddr.toLowerCase()) continue;

        let oraclePrice = 0;
        let dexPrice = 0;

        for (const p of lendingProtos) {
          try {
            const oracle = createOracleFromLending(p, rpcUrl);
            const priceData = await oracle.getPrice(addr);
            if (priceData.price_f64 > 0) { oraclePrice = priceData.price_f64; break; }
          } catch { /* skip */ }
        }

        for (const p of dexProtos) {
          try {
            const dex = createDex(p, rpcUrl);
            const priceData = await DexSpotPrice.getPrice(dex, addr, token.decimals, usdcAddr!, 6);
            if (priceData.price_f64 > 0) { dexPrice = priceData.price_f64; break; }
          } catch { /* skip */ }
        }

        if (oraclePrice > 0 && dexPrice > 0) {
          const spread = Math.abs(oraclePrice - dexPrice) / Math.max(oraclePrice, dexPrice) * 100;
          if (spread >= minSpread) {
            findings.push({
              token: token.symbol,
              address: addr,
              oracle_price: Math.round(oraclePrice * 10000) / 10000,
              dex_price: Math.round(dexPrice * 10000) / 10000,
              spread_pct: Math.round(spread * 100) / 100,
              verdict: spread >= 20 ? "HIGH_RISK" : spread >= 10 ? "MEDIUM_RISK" : "LOW_RISK",
            });
          }
        }
      }

      findings.sort((a, b) => b.spread_pct - a.spread_pct);

      return {
        content: [{
          type: "text",
          text: ok(
            { chain: chainName, findings, scanned_tokens: Math.min(tokens.length, 20), min_spread_pct: minSpread },
            { finding_count: findings.length },
          ),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e)) }], isError: true };
    }
  },
);

// ============================================================
// defi_portfolio — portfolio overview
// ============================================================

server.tool(
  "defi_portfolio",
  "Get a portfolio overview for a wallet address: lending positions, token balances, and health factors across all protocols on a chain",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    address: z.string().describe("Wallet address to query (0x...)"),
  },
  async ({ chain, address }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();

      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return { content: [{ type: "text", text: err(`Invalid address: ${address}`) }], isError: true };
      }

      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const user = address as Address;

      const { ProtocolCategory, multicallRead } = await import("@hypurrquant/defi-core");
      const { createLending: _createLending } = await import("@hypurrquant/defi-protocols");
      const { encodeFunctionData, parseAbi } = await import("viem");

      const POOL_ABI = parseAbi([
        "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
      ]);

      const lendingProtos = registry.getProtocolsForChain(chainName)
        .filter(p => p.category === ProtocolCategory.Lending);

      const lendingPositions: Array<{
        protocol: string;
        total_collateral_usd: number;
        total_debt_usd: number;
        available_borrows_usd: number;
        health_factor: number;
        ltv: number;
      }> = [];

      for (const p of lendingProtos) {
        const poolAddr = (p.contracts as Record<string, string> | undefined)?.pool;
        if (!poolAddr) continue;
        try {
          const callData = encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [user] });
          const results = await multicallRead(rpcUrl, [[poolAddr as Address, callData as `0x${string}`]]);
          const raw = results[0];
          if (!raw || raw.length < 2 + 6 * 64) continue;
          const hex = raw.slice(2);
          const decodeU256 = (offset: number) => BigInt("0x" + hex.slice(offset * 64, offset * 64 + 64));
          const totalCollateral = Number(decodeU256(0)) / 1e8;
          const totalDebt = Number(decodeU256(1)) / 1e8;
          const availableBorrows = Number(decodeU256(2)) / 1e8;
          const ltv = Number(decodeU256(4)) / 100;
          const hfRaw = decodeU256(5);
          const healthFactor = hfRaw >= BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") / 2n
            ? 999999
            : Math.round(Number(hfRaw) / 1e16) / 100;

          if (totalCollateral > 0 || totalDebt > 0) {
            lendingPositions.push({
              protocol: p.slug,
              total_collateral_usd: Math.round(totalCollateral * 100) / 100,
              total_debt_usd: Math.round(totalDebt * 100) / 100,
              available_borrows_usd: Math.round(availableBorrows * 100) / 100,
              health_factor: healthFactor,
              ltv,
            });
          }
        } catch { /* skip */ }
      }

      const totalCollateralUsd = lendingPositions.reduce((s, p) => s + p.total_collateral_usd, 0);
      const totalDebtUsd = lendingPositions.reduce((s, p) => s + p.total_debt_usd, 0);

      const portfolio = {
        address,
        chain: chainName,
        lending_positions: lendingPositions,
        summary: {
          total_collateral_usd: Math.round(totalCollateralUsd * 100) / 100,
          total_debt_usd: Math.round(totalDebtUsd * 100) / 100,
          net_position_usd: Math.round((totalCollateralUsd - totalDebtUsd) * 100) / 100,
          active_protocols: lendingPositions.length,
        },
      };

      return { content: [{ type: "text", text: ok(portfolio, { chain: chainName, address }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { address }) }], isError: true };
    }
  },
);

// ── Start server ──

const transport = new StdioServerTransport();
await server.connect(transport);
