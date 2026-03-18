# DeFi CLI

```
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  11 chains · 108 protocols · 22 commands
```

Multi-chain DeFi toolkit. Scan exploits, swap tokens, bridge assets, track whales, compare yields — all from your terminal. Built for humans and AI agents.

## Install

```bash
git clone https://github.com/hypurrquant/defi-cli.git
cd defi-cli
cargo build --release

# Binaries
./target/release/defi        # Multi-chain DeFi CLI
./target/release/mantle      # Mantle-only CLI
./target/release/defi-mcp    # MCP server for AI agents
```

## What Can It Do?

### Scan All Chains for Exploits (1 second)

```
$ defi scan --all-chains --once

  All-chain scan: 11 chains, 8 alerts, 1150ms

┌───────────┬────────┬────────┬──────────────────┐
│ Chain     ┆ Alerts ┆ Time   ┆ Details          │
├───────────┼────────┼────────┼──────────────────┤
│ BNB       ┆ 2      ┆ 174ms  ┆ BTCB, BTCB       │
│ Mantle    ┆ 2      ┆ 122ms  ┆ USDe, USDe       │
│ Arbitrum  ┆ 1      ┆ 670ms  ┆ WETH             │
│ HyperEVM  ┆ 0      ┆ 161ms  ┆ clean            │
│ Ethereum  ┆ 0      ┆ 1149ms ┆ clean            │
└───────────┴────────┴────────┴──────────────────┘
```

### Find Best Yield Across All Chains (1.4 seconds)

```
$ defi yield scan --asset USDC

  USDC Yield Scan (1383ms) — Best: HypurrFi Pooled on HyperEVM

┌───────────┬────────────────────┬────────────┬────────────┐
│ Chain     ┆ Protocol           ┆ Supply APY ┆ Borrow APY │
├───────────┼────────────────────┼────────────┼────────────┤
│ HyperEVM  ┆ HypurrFi Pooled    ┆ 4.66%      ┆ 7.21%      │
│ Ethereum  ┆ SparkLend          ┆ 4.14%      ┆ 4.66%      │
│ Base      ┆ Aave V3 Base       ┆ 2.50%      ┆ 3.72%      │
│ Mantle    ┆ Aave V3 Mantle     ┆ 0.90%      ┆ 2.10%      │
└───────────┴────────────────────┴────────────┴────────────┘

  Arb Opportunities
┌────────┬───────────────────────────────┬────────────────────────┬─────────────┐
│ Spread ┆ Supply @                      ┆ Borrow @               ┆ Type        │
├────────┼───────────────────────────────┼────────────────────────┼─────────────┤
│ +2.56% ┆ HypurrFi Pooled (HyperEVM)    ┆ Aave V3 Mantle         ┆ cross-chain │
│ +2.39% ┆ HypurrFi Pooled (HyperEVM)    ┆ Aave V3 BNB            ┆ cross-chain │
└────────┴───────────────────────────────┴────────────────────────┴─────────────┘
```

### Swap at Best Price (ODOS Aggregator)

```
$ defi swap --chain mantle --from USDC --to WMNT --amount 1000

  Swap on Mantle via ODOS

  1000 USDC -> 1188.82 WMNT
  Price impact: 0.0548%
```

### Bridge Across Chains (LI.FI)

```
$ defi bridge --from-chain mantle --to-chain ethereum --token USDC --amount 1000

  Bridge Mantle -> Ethereum via Relay

  1000 USDC -> 987.37 USDC
  Cost: $12.60 | Time: 7s
```

### Track Whales

```
$ defi whales --chain mantle --token WETH --top 5

  Mantle WETH Top Holders

┌───┬─────────────────────┬──────────────┐
│ # ┆ Address             ┆ WETH Balance │
├───┼─────────────────────┼──────────────┤
│ 1 ┆ 0xd374a62a...bc840b ┆ 50000.01     │
│ 2 ┆ 0x59800fc6...3cac1d ┆ 32000.02     │
│ 3 ┆ 0xeac30ed8...426d2c ┆ 10573.23     │
└───┴─────────────────────┴──────────────┘
```

### Scan Any Wallet Across All Chains (1.5 seconds)

```
$ defi positions --address 0xd374a62aa68d01cdb420e17b9840706e86bc840b

  Positions for 0xd374a6...840B (1515ms, 11 chains)
  Total: $152,750,024

  Mantle ($152,750,024)
┌────────┬────────────────┬───────────────┐
│ Type   ┆ Asset/Protocol ┆ Value         │
├────────┼────────────────┼───────────────┤
│ wallet ┆ WETH           ┆ $117,500,024  │
│ wallet ┆ mETH           ┆ $35,250,000   │
└────────┴────────────────┴───────────────┘
```

## All Commands

| Command | Description |
|---------|-------------|
| **Monitoring** | |
| `scan` | Exploit detection: oracle divergence, depeg, exchange rate anomalies |
| `scan --all-chains` | Scan all 11 chains in parallel (~1s) |
| `alert` | Single-asset oracle vs DEX price deviation monitor |
| `monitor` | Health factor monitoring with alerts |
| **Trading** | |
| `swap` | Best-price swap via ODOS aggregator (9 chains) |
| `bridge` | Cross-chain transfer via LI.FI (10 chains) |
| `dex` | Direct DEX swap, quote, compare |
| `token` | Approve, allowance, transfer |
| **Lending** | |
| `lending` | Supply, borrow, repay, withdraw, rates, position |
| `yield compare` | Compare rates across protocols on one chain |
| `yield scan` | Compare rates across ALL chains with arb detection |
| **Research** | |
| `whales` | Top token holders + lending positions |
| `positions` | Cross-chain wallet scanner (11 chains, 1.5s) |
| `portfolio` | Single-chain portfolio overview |
| `price` | Oracle price queries |
| `status` | Chain and protocol info |
| **DeFi Ops** | |
| `cdp` | CDP open, adjust, close, info |
| `staking` | Liquid staking: stake, unstake, info |
| `vault` | ERC-4626 vault deposit, withdraw, info |
| `gauge` | ve(3,3) gauge deposit, withdraw, claim, lock, vote |
| **Agent** | |
| `agent` | JSON stdin batch mode for AI agents |
| `schema` | JSON schema for any command |

## Supported Chains

| Chain | Protocols | Key Lending | Key DEX |
|-------|-----------|-------------|---------|
| HyperEVM | 22 | HyperLend, HypurrFi, Euler V2 | HyperSwap, Curve, Balancer |
| BNB | 16 | Aave V3, Venus, Kinza | PancakeSwap, Thena |
| Base | 11 | Aave V3, Compound V3, Sonne | Aerodrome, Uniswap |
| Arbitrum | 10 | Aave V3, Compound V3 | Camelot, Uniswap, SushiSwap |
| Mantle | 8 | Aave V3, Lendle, Compound V3 | Merchant Moe, Agni, FusionX |
| Ethereum | 8 | Aave V3, Compound V2/V3, Spark, Morpho | Uniswap V2/V3, SushiSwap |
| Polygon | 8 | Aave V3, Compound V3 | QuickSwap, Uniswap, SushiSwap |
| Linea | 8 | Aave V3, Mendi, LayerBank | Lynex, Nile, SushiSwap |
| Avalanche | 6 | Aave V3, Benqi | TraderJoe, Pangolin |
| Optimism | 6 | Aave V3, Sonne, Compound V3 | Velodrome, Uniswap |
| Scroll | 5 | Aave V3, Compound V3, LayerBank | SushiSwap, Uniswap |

## MCP Server (AI Agent Integration)

18 tools for Claude Code, Cursor, and other AI agents:

```bash
# Start MCP server
./target/release/defi-mcp

# Add to Claude Code config (~/.claude/settings.json)
{
  "mcpServers": {
    "defi": {
      "command": "/path/to/defi-mcp",
      "args": []
    }
  }
}
```

Then ask Claude: *"Mantle WETH 고래 찾아줘"* or *"Scan all chains for exploits"*

## Mantle CLI

Standalone Mantle-only binary with 8 commands:

```bash
mantle status              # Ecosystem overview
mantle scan --once         # Exploit detection
mantle swap --from USDC --to WMNT --amount 100
mantle bridge --to ethereum --token USDC --amount 1000
mantle whales --token WETH --top 10
mantle positions --address 0x...
mantle lending rates --asset USDC
mantle yield compare --asset WETH
```

See [crates/mantle-cli/README.md](crates/mantle-cli/README.md) for details.

## Architecture

```
defi-cli/
├── crates/
│   ├── defi-core/        # Registry, multicall, types, traits
│   ├── defi-protocols/   # Protocol adapters (Aave, Uniswap, Compound, etc.)
│   ├── defi-cli/         # Multi-chain CLI (22 commands)
│   ├── mantle-cli/       # Mantle-only CLI (8 commands)
│   └── defi-mcp/         # MCP server (18 tools)
├── config/
│   ├── chains.toml       # 11 chain configs
│   ├── tokens/           # Per-chain token registries
│   └── protocols/        # 108 protocol configs (TOML)
├── skills/
│   └── defi-cli/         # Claude Code skill
├── npm/                  # npm wrapper package
└── docs/                 # DeFi category taxonomy
```

**Key design decisions:**
- **Single multicall per scan** — all oracle + DEX + stablecoin queries in one RPC call (~200ms)
- **Parallel chain scanning** — 11 chains in ~1.5 seconds via tokio::JoinSet
- **Config-driven** — all protocol/chain/token data in TOML, compiled into binary
- **Agent-first** — every command supports `--json`, MCP server with 18 tools
- **Dry-run by default** — all transactions simulated unless `--broadcast` is set

## Global Options

| Flag | Description |
|------|-------------|
| `--chain <name>` | Target chain (default: hyperevm) |
| `--json` | JSON output |
| `--ndjson` | Newline-delimited JSON (streaming) |
| `--fields` | Select specific output fields |
| `--broadcast` | Actually send transactions (default: dry-run) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `{CHAIN}_RPC_URL` | Override RPC URL (e.g., `MANTLE_RPC_URL`) |
| `DEFI_PRIVATE_KEY` | Private key for `--broadcast` mode |
| `DEFI_WALLET_ADDRESS` | Default wallet address |
| `ETHERSCAN_API_KEY` | For whale tracking on BNB, Arbitrum, Base, Polygon, Scroll, Linea |

## License

MIT
