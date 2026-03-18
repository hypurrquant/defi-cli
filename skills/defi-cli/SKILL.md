---
name: defi-cli
description: DeFi protocol interaction across 11 EVM chains. Scan exploits, swap tokens, bridge assets, track whales, check lending rates, and manage positions. Use when user asks about DeFi prices, yields, whale wallets, cross-chain bridging, token swaps, lending rates, or exploit detection. Supports Ethereum, Mantle, Arbitrum, Base, BNB, Polygon, Avalanche, Optimism, Scroll, Linea, HyperEVM.
license: MIT
compatibility: Requires Rust toolchain and internet access for on-chain RPC queries. Works with Claude Code, Claude.ai, and API.
metadata:
  author: HypurrQuant
  version: 0.2.0
  mcp-server: defi-mcp
---

# DeFi CLI

Multi-chain DeFi toolkit for AI agents. Query on-chain data, scan for exploits, get swap quotes, bridge assets, and track whale positions across 11 EVM chains with 108 protocols.

## Setup

### Option 1: MCP Server (Recommended)

The MCP server gives you direct tool access. Install and configure:

```bash
# Build from source
git clone https://github.com/hypurrquant/defi-cli.git
cd defi-cli
cargo build --release --bin defi-mcp
```

Add to your MCP config (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "defi": {
      "command": "/path/to/defi-mcp",
      "args": []
    }
  }
}
```

This exposes 18 tools: `defi_status`, `defi_scan`, `defi_scan_all`, `defi_swap_quote`, `defi_bridge_quote`, `defi_whales`, `defi_positions`, `defi_yield_compare`, `defi_lending_rates`, `defi_lending_position`, `defi_price`, `defi_dex_swap`, `defi_lending_supply`, `defi_lending_borrow`, `defi_token_approve`, `defi_staking_info`, `defi_portfolio`, `defi_list_protocols`.

### Option 2: CLI Binary

```bash
cargo build --release --bin defi
# Use via Bash tool
```

## Available Tools (MCP)

### Read-Only (Safe, No Confirmation Needed)

**defi_status** — Get chain info, protocols, and tokens
```
Input: { "chain": "mantle" }
Output: { chain, chain_id, protocols[], tokens[], summary }
```

**defi_scan** — Detect oracle divergence, stablecoin depeg, exchange rate anomalies on one chain
```
Input: { "chain": "mantle", "oracle_threshold": 5.0 }
Output: { alerts[], scan_duration_ms, data: { oracle_prices, dex_prices, stablecoin_pegs } }
```

**defi_scan_all** — Scan ALL 11 chains in parallel (~1 second)
```
Input: { "patterns": "oracle,stable" }
Output: { total_alerts, chains_scanned, chains: [{ chain, alerts[] }] }
```

**defi_swap_quote** — Best-price swap quote via ODOS aggregator (routes through all DEXes)
```
Input: { "chain": "mantle", "from": "USDC", "to": "WMNT", "amount": 1000 }
Output: { amount_out, effective_price, price_impact_pct, aggregator }
```

**defi_bridge_quote** — Cross-chain bridge quote via LI.FI
```
Input: { "from_chain": "mantle", "to_chain": "ethereum", "token": "USDC", "amount": 1000 }
Output: { amount_out, fee_usd, gas_usd, total_cost_usd, bridge, estimated_time_sec }
```

**defi_whales** — Find top token holders on a chain (free API for ETH, AVAX, OP, Mantle)
```
Input: { "chain": "mantle", "token": "WETH", "top": 10 }
Output: { holders: [{ rank, address, balance }] }
```

**defi_positions** — Scan wallet positions across all chains in parallel (~1.5s for 11 chains)
```
Input: { "address": "0x...", "chains": "mantle,ethereum" }
Output: { total_value_usd, chains: [{ chain, token_balances[], lending_positions[] }] }
```

**defi_yield_compare** — Compare lending yields across protocols on a chain
```
Input: { "chain": "mantle", "asset": "USDC" }
Output: { rates: [{ protocol, supply_apy, borrow_variable_apy }], best_supply }
```

**defi_lending_rates** — Get rates for a specific protocol and asset
```
Input: { "chain": "mantle", "protocol": "aave-v3-mantle", "asset": "USDC" }
Output: { supply_apy, borrow_variable_apy, utilization }
```

**defi_price** — Query asset price from oracles
```
Input: { "chain": "mantle", "asset": "WETH" }
Output: { sources: [{ source, price }] }
```

**defi_list_protocols** — List all protocols, filter by chain and category
```
Input: { "chain": "mantle", "category": "lending" }
Output: { protocols[], count }
```

### Transaction Building (Dry-Run by Default)

**defi_dex_swap** — Build a DEX swap transaction
```
Input: { "chain": "hyperevm", "protocol": "hyperswap-v3", "token_in": "WHYPE", "token_out": "USDC", "amount": "100" }
```

**defi_lending_supply** — Build a lending supply transaction
```
Input: { "chain": "mantle", "protocol": "aave-v3-mantle", "asset": "USDC", "amount": "1000" }
```

**defi_lending_borrow** — Build a lending borrow transaction
```
Input: { "chain": "mantle", "protocol": "aave-v3-mantle", "asset": "USDC", "amount": "500" }
```

**defi_token_approve** — Build a token approval transaction
```
Input: { "chain": "mantle", "token": "USDC", "spender": "0x...", "amount": "max" }
```

## Supported Chains

All tools accept a `chain` parameter. Default: `hyperevm`.

| Chain | ID | Protocols | Key DEX | Key Lending |
|-------|-----|-----------|---------|-------------|
| hyperevm | 999 | 22 | HyperSwap | HyperLend |
| mantle | 5000 | 8 | Merchant Moe, Agni | Aave V3, Lendle |
| ethereum | 1 | 8 | Uniswap V2/V3 | Aave V3, Compound, Spark |
| arbitrum | 42161 | 10 | Camelot, Uniswap | Aave V3 |
| base | 8453 | 11 | Aerodrome, Uniswap | Aave V3 |
| bnb | 56 | 16 | PancakeSwap | Aave V3, Venus |
| polygon | 137 | 8 | QuickSwap, Uniswap | Aave V3 |
| avalanche | 43114 | 6 | TraderJoe, Pangolin | Aave V3, Benqi |
| optimism | 10 | 6 | Velodrome, Uniswap | Aave V3 |
| scroll | 534352 | 5 | SushiSwap | Aave V3 |
| linea | 59144 | 8 | Lynex, Nile | Aave V3, Mendi |

## Common Workflows

### Find best yield for USDC

1. Call `defi_yield_compare` for each chain with `asset: "USDC"`
2. Compare `supply_apy` across results
3. Recommend the highest yield with chain and protocol name

### Track a whale

1. Call `defi_whales` with token and chain to find top holders
2. Call `defi_positions` with the whale's address to see their full portfolio
3. Report holdings and lending positions

### Detect exploits

1. Call `defi_scan_all` to scan all 11 chains simultaneously
2. Review alerts for oracle divergence (price mismatch between oracle and DEX)
3. Report any alerts with severity and recommended action

### Get swap quote

1. Call `defi_swap_quote` with chain, from/to tokens, and amount
2. Report the output amount, price impact, and aggregator used
3. For execution: build TX via `defi_dex_swap` with specific protocol

### Bridge assets

1. Call `defi_bridge_quote` with source/destination chains and amount
2. Report the received amount, total cost, estimated time, and bridge used

## Error Handling

If a tool returns an error:

- **"Chain not found"**: Check chain name spelling. Use lowercase: `mantle`, `ethereum`, `bnb`
- **"Token not found"**: Check token symbol. Use uppercase: `USDC`, `WETH`, `WMNT`
- **"Protocol not found"**: Use the slug from `defi_list_protocols`
- **"RPC error"**: Chain RPC may be temporarily down. Retry or try a different chain
- **"Explorer API error"**: Whale tracking uses routescan (free for ETH, AVAX, OP, Mantle). Other chains need `ETHERSCAN_API_KEY`

## Limitations

- Swap quotes via ODOS: 9/11 chains (not Scroll)
- Bridge quotes via LI.FI: 10/11 chains
- Whale tracking (free): 4/11 chains (ETH, AVAX, OP, Mantle). Others need API key
- Transaction execution requires `DEFI_PRIVATE_KEY` and `--broadcast` flag
- Exchange rate monitoring only on Compound V2 forks (Venus, Sonne)
