# DeFi CLI

```
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  40 chains · 344 protocols · 23 commands
```

Multi-chain DeFi toolkit. Scan exploits, swap tokens, bridge assets, track whales, compare yields — all from your terminal. Built for humans and AI agents.

## Install

```bash
git clone https://github.com/hypurrquant/defi-cli.git
cd defi-cli/ts
pnpm install
pnpm build

# Run CLI
node packages/defi-cli/dist/main.js
# or link globally
pnpm -C packages/defi-cli link --global
```

Requires Node.js >= 18 and pnpm.

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
| `scan --all-chains` | Scan all 40 chains in parallel |
| `alert` | Single-asset oracle vs DEX price deviation monitor |
| `monitor` | Health factor monitoring with alerts |
| **Trading** | |
| `swap` | Best-price swap via ODOS aggregator |
| `bridge` | Cross-chain transfer via LI.FI |
| `dex` | Direct DEX swap, quote, compare |
| `token` | Approve, allowance, transfer |
| **Lending** | |
| `lending` | Supply, borrow, repay, withdraw, rates, position |
| `yield compare` | Compare rates across protocols on one chain |
| `yield scan` | Compare rates across ALL chains with arb detection |
| **Research** | |
| `whales` | Top token holders + lending positions |
| `positions` | Cross-chain wallet scanner |
| `portfolio` | Single-chain portfolio overview |
| `price` | Oracle price queries |
| `status` | Chain and protocol info |
| **DeFi Ops** | |
| `cdp` | CDP open, adjust, close, info |
| `staking` | Liquid staking: stake, unstake, info |
| `vault` | ERC-4626 vault deposit, withdraw, info |
| `gauge` | ve(3,3) gauge deposit, withdraw, claim, lock, vote |
| `nft` | NFT operations |
| **Agent** | |
| `schema` | JSON schema for any command |

## Architecture

```
defi-cli/
├── ts/                         # TypeScript monorepo (pnpm)
│   ├── packages/
│   │   ├── defi-core/          # Registry, multicall, types, traits
│   │   ├── defi-protocols/     # Protocol adapters (Aave, Uniswap, Compound, etc.)
│   │   └── defi-cli/           # Multi-chain CLI (23 commands)
│   ├── test/                   # E2E and snapshot tests
│   └── vitest.config.ts
├── config/
│   ├── chains.toml             # 40 chain configs
│   ├── tokens/                 # Per-chain token registries (40 chains)
│   └── protocols/              # 344 protocol configs (TOML)
│       ├── dex/                # DEX protocols
│       ├── lending/            # Lending protocols
│       ├── vault/              # Vault/yield protocols
│       ├── bridge/             # Bridge protocols
│       ├── cdp/                # CDP protocols
│       └── nft/                # NFT protocols
├── skills/
│   └── defi-cli/               # Claude Code skill
├── npm/                        # npm wrapper package
└── docs/                       # DeFi category taxonomy
```

**Key design decisions:**
- **Single multicall per scan** — all oracle + DEX + stablecoin queries in one RPC call (~200ms)
- **Parallel chain scanning** — 40 chains in parallel via Promise.all
- **Config-driven** — all protocol/chain/token data in TOML
- **Agent-first** — every command supports `--json`, designed for AI agent integration
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
| `ETHERSCAN_API_KEY` | For whale tracking |

## License

MIT
