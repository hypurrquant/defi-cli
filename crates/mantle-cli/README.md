# Mantle DeFi CLI

> AI-powered DeFi toolkit for Mantle Chain — scan exploits, swap tokens, bridge assets, track whales, all from your terminal.

Built with [Claude Code](https://claude.ai/claude-code) for the [Mantle Squad Bounty](https://x.com/Mantle_Official).

## Features

| Command | Description |
|---------|-------------|
| `mantle status` | Mantle DeFi ecosystem overview (8 protocols, 12 tokens) |
| `mantle scan` | Multi-pattern exploit detection (oracle divergence, stablecoin depeg, exchange rate anomaly) |
| `mantle swap` | Best-price swap across all Mantle DEXes via ODOS aggregator |
| `mantle bridge` | Cross-chain asset transfer via LI.FI (10+ chains supported) |
| `mantle whales` | Find top token holders and their lending positions |
| `mantle positions` | Scan any wallet's token balances + lending positions |
| `mantle lending` | Query lending rates on Aave V3 / Lendle |
| `mantle yield` | Compare yields across all Mantle lending protocols |

## Quick Start

```bash
# Build
cargo build --release --bin mantle

# Or install
cargo install --path crates/mantle-cli

# Run
mantle status --json
mantle scan --once --json
mantle swap --from USDC --to WMNT --amount 100 --json
```

## Mantle Ecosystem Coverage

**8 protocols** covering ~90% of Mantle DeFi TVL ($748M):

| Protocol | Category | TVL | Interface |
|----------|----------|-----|-----------|
| Aave V3 | Lending | $499M | aave_v3 |
| Merchant Moe | DEX | $44M | uniswap_v2 |
| Agni Finance | DEX | $23M | uniswap_v3 |
| Compound V3 | Lending | $8.3M | compound_v3 |
| INIT Capital | Lending | $4.4M | init_capital |
| Lendle | Lending | $1.8M | aave_v2 |
| FusionX V2 | DEX | — | uniswap_v2 |
| FusionX V3 | DEX | — | uniswap_v3 |

**12 tokens**: MNT, WMNT, USDC, USDT, WETH, mETH, FBTC, cmETH, COOK, USDe, USDY, PUFF

## Usage Examples

### Exploit Detection Scanner

Scans oracle prices, DEX prices, and stablecoin pegs in a single multicall (~200ms):

```bash
mantle scan --once --json
```

```json
{
  "chain": "Mantle",
  "scan_duration_ms": 237,
  "alert_count": 2,
  "alerts": [
    {
      "pattern": "oracle_divergence",
      "severity": "medium",
      "asset": "USDe",
      "oracle_price": 1.0,
      "dex_price": 0.9028,
      "deviation_pct": 9.72,
      "action": "buy USDe on DEX, use as collateral on Aave V3 Mantle"
    }
  ],
  "data": {
    "oracle_prices": {
      "Aave V3 Mantle/FBTC": 75288.2,
      "Aave V3 Mantle/WETH": 2353.32,
      "Lendle/mETH": 2534.48,
      "Lendle/WMNT": 0.86
    },
    "dex_prices": { "WMNT": 0.83, "mETH": 183.67 },
    "stablecoin_pegs": { "USDC/USDT": 0.9857, "USDT/USDC": 0.9869 }
  }
}
```

### Best-Price Swap (ODOS Aggregator)

Routes through all Mantle DEXes for optimal execution:

```bash
mantle swap --from USDC --to WMNT --amount 1000 --json
# → 1000 USDC → 1195.37 WMNT (0.00% impact)

mantle swap --from WETH --to USDC --amount 1 --json
# → 1 WETH → 2320.83 USDC
```

### Cross-Chain Bridge (LI.FI)

Bridge assets to/from Mantle with automatic best-bridge selection:

```bash
# Mantle → Ethereum
mantle bridge --to ethereum --token USDC --amount 1000 --json
# → 997.40 USDC received, $2.69 fee, 5 seconds via Relay

# Ethereum → Mantle
mantle bridge --from ethereum --token USDC --amount 1000 --json

# Arbitrum → Mantle
mantle bridge --from arbitrum --token WETH --amount 1 --json
```

### Whale Tracking

Find top token holders on Mantle (free API, no key needed):

```bash
mantle whales --token WETH --top 5 --json
```

```json
{
  "holders": [
    { "rank": 1, "address": "0xd374...840b", "balance": 50000.01 },
    { "rank": 2, "address": "0x5980...ac1d", "balance": 32000.02 },
    { "rank": 3, "address": "0xeac3...6d2c", "balance": 10598.76 }
  ]
}
```

Scan a whale's full positions:

```bash
mantle whales --token WETH --top 5 --positions --json
# Shows each whale's lending collateral + debt + health factor

mantle positions --address 0xd374a62aa68d01cdb420e17b9840706e86bc840b --json
# → $152M total: 50,000 WETH + 15,000 mETH
```

### Lending Rates & Yield Comparison

```bash
mantle lending rates --asset USDC --json
# → Aave V3: supply 0.93%, borrow 2.14%

mantle yield compare --asset WETH --json
# → Best supply: Aave V3 @ 1.57%
```

## Architecture

```
defi-cli/
├── crates/
│   ├── defi-core/        # Shared: registry, multicall, types
│   ├── defi-protocols/   # Shared: protocol adapters
│   ├── defi-cli/         # Multi-chain CLI (11 chains)
│   └── mantle-cli/       # ← THIS: Mantle-only CLI
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           └── commands/
│               ├── mod.rs        # CLI definition, 8 commands
│               ├── scan.rs       # Exploit detection
│               ├── swap.rs       # ODOS aggregator
│               ├── bridge.rs     # LI.FI bridge
│               ├── whales.rs     # Token holder tracking
│               ├── positions.rs  # Wallet scanner
│               ├── lending.rs    # Lending rates
│               ├── yield_cmd.rs  # Yield comparison
│               └── status.rs     # Ecosystem overview
└── config/
    ├── chains.toml               # Chain configs (Mantle = chain_id 5000)
    ├── tokens/mantle.toml        # 12 Mantle tokens
    └── protocols/
        ├── dex/*.toml            # 4 Mantle DEXes
        └── lending/*.toml        # 4 Mantle lending protocols
```

**Key design decisions:**
- **Single multicall per scan**: All oracle + DEX + stablecoin + exchange rate queries in one RPC call (~200ms)
- **No API keys needed**: ODOS (swap), LI.FI (bridge), routescan (whales) all work without keys on Mantle
- **Hardcoded Mantle**: No `--chain` flag — every command targets Mantle directly
- **JSON-first**: Every command supports `--json` for AI agent consumption

## Built With AI

This entire CLI was built in a single Claude Code session:
1. **Deep Interview** — Socratic requirements gathering (4 rounds, 19.5% ambiguity)
2. **Autopilot** — Autonomous implementation of 8 commands
3. **Live Testing** — All commands verified against Mantle mainnet

The parent project (`defi-cli`) covers 11 EVM chains with 108 protocols, 103 tokens, and 22 commands.

## Global Options

| Flag | Description |
|------|-------------|
| `--json` | JSON output (agent-friendly) |
| `--ndjson` | Newline-delimited JSON (streaming) |
| `--fields` | Select specific output fields |
| `--broadcast` | Actually send transactions (default: dry-run simulation) |

## License

MIT
