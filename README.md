# DeFi CLI

```
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  7 chains · 48 protocols · 5 aggregators
```

Multi-chain DeFi toolkit with verified mainnet broadcast paths. Lending, LP farming, DEX swap, cross-chain bridge, yield comparison — all from your terminal. Built for humans and AI agents.

## Install

```bash
git clone https://github.com/hypurrquant/defi-cli.git
cd defi-cli/ts
pnpm install
pnpm build

# Run CLI
node packages/defi-cli/dist/main.js

# Or link globally
pnpm -C packages/defi-cli link --global
```

Requires Node.js >= 20 and pnpm.

## Supported Chains

| Chain | ID | Status | Protocols | Native | Notes |
|---|---|---|---|---|---|
| **HyperEVM** | 999 | 🟢 production | 11 | HYPE | All protocols mainnet-verified incl. emission token receipt |
| **Mantle** | 5000 | 🟢 production | 3 | MNT | Aave V3 + Uniswap V3 + Merchant Moe LB (MOE emission verified) |
| **Base** | 8453 | 🟢 production | 5 | ETH | Aerodrome V2/CL (AERO emission) + Uniswap V3 + Aave V3 + Compound V3 |
| **BNB** | 56 | 🟡 staged | 16 | BNB | Read-only verified, broadcast pending |
| **Monad** | 143 | 🟡 staged | 4 | MON | TraderJoe LB pools active, broadcast pending |
| **Arbitrum** | 42161 | 🟡 staged | 3 | ETH | Read-only + aggregator quotes verified |
| **Ethereum** | 1 | 🟡 staged | 6 | ETH | Read-only + aggregator quotes verified |

🟢 = full lifecycle broadcast (mint/supply → claim emission → withdraw/remove)
🟡 = configs + read-only paths verified, awaiting funded broadcast

## Supported Protocols

### HyperEVM (11)

| Slug | Category | Interface | Notes |
|---|---|---|---|
| `hyperlend` | Lending | aave_v3 | Aave V3 fork |
| `hypurrfi` | Lending | aave_v3 | Aave V3 fork |
| `felix-morpho` | Lending | morpho_blue | MetaMorpho ERC-4626 vault routing |
| `project-x` | DEX | uniswap_v3 | V3 fee-only |
| `hyperswap` | DEX | uniswap_v3 | V3 fee-only |
| `curve-hyperevm` | DEX | curve_stableswap | StableswapNG |
| `ramses-cl` | DEX | uniswap_v3 + cl_style="ramses" | x(3,3) auto-stake, NPM.getPeriodReward |
| `ramses-hl` | DEX | solidly_v2 | ve(3,3) gauge, RAM emission |
| `kittenswap` | DEX | algebra_v3 + farming_center | Eternal farming, KITTEN/WHYPE rewards |
| `hybra` | DEX | hybra (V4 CL) | GaugeManager + 2-year veHYBR lock (default) |
| `nest` | DEX | algebra_v3 | Off-chain ticket-based NEST claim |

### Mantle (3)

| Slug | Category | Interface | Notes |
|---|---|---|---|
| `aave-v3-mantle` | Lending | aave_v3 | |
| `uniswap-v3-mantle` | DEX | uniswap_v3 | |
| `merchantmoe-mantle` | DEX | uniswap_v2 + lb_factory + masterchef | LB hooks + MOE emission via veMOE-weighted MasterChef |

### Base (5)

| Slug | Category | Interface | Notes |
|---|---|---|---|
| `aave-v3-base` | Lending | aave_v3 | |
| `compound-v3-base` | Lending | compound_v3 | Comet |
| `uniswap-v3-base` | DEX | uniswap_v3 | V3 fee-only |
| `aerodrome-base` | DEX | solidly_v2 | ve(3,3) gauge, AERO emission |
| `aerodrome-cl` | DEX | uniswap_v3 + cl_style="slipstream" | Slipstream CL with NFT gauge, AERO emission |

### BNB (16)

| Category | Slugs |
|---|---|
| Lending | `aave-v3-bnb`, `kinza-bnb`, `venus-bnb`, `venus-flux-bnb` |
| DEX | `pancakeswap-v3-bnb` (+ MasterChef CAKE), `pancakeswap-v2-bnb`, `uniswap-v3-bnb`, `thena-v1` (Solidly), `thena-fusion` (Algebra), `biswap-bnb`, `apeswap-bnb`, `bakeryswap-bnb`, `bscswap-bnb`, `babydogeswap-bnb`, `fstswap-bnb` |
| Vault | `beefy-bnb` |

### Monad (4)

| Slug | Category | Interface |
|---|---|---|
| `uniswap-v2-monad` | DEX | uniswap_v2 |
| `uniswap-v3-monad` | DEX | uniswap_v3 |
| `traderjoe-monad` | DEX | uniswap_v2 + lb_factory |
| `morpho-blue-monad` | Lending | morpho_blue |

### Ethereum (6)

| Slug | Category | Interface |
|---|---|---|
| `aave-v2-ethereum` | Lending | aave_v2 |
| `aave-v3-ethereum` | Lending | aave_v3 |
| `compound-v3-ethereum` | Lending | compound_v3 |
| `morpho-blue-ethereum` | Lending | morpho_blue |
| `uniswap-v2-ethereum` | DEX | uniswap_v2 |
| `uniswap-v3-ethereum` | DEX | uniswap_v3 |

### Arbitrum (3)

| Slug | Category | Interface |
|---|---|---|
| `aave-v3-arbitrum` | Lending | aave_v3 |
| `compound-v3-arbitrum` | Lending | compound_v3 |
| `uniswap-v3-arbitrum` | DEX | uniswap_v3 |

## DEX Aggregators (Live-verified)

| Aggregator | HyperEVM | Mantle | Base | BNB | Ethereum | Arbitrum |
|---|---|---|---|---|---|---|
| KyberSwap | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| OpenOcean | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LiquidSwap | ✅ | — | — | — | — | — |
| LI.FI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relay | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Slug mapping per chain lives in `chains.toml` `[chain.X.aggregators]`. LI.FI/Relay route by numeric `chain_id` (slug `"auto"`).

## What Can It Do?

### Yield comparison across chains

```bash
$ defi yield scan --asset USDC

 USDC Yield Scan — Best: HypurrFi Pooled on HyperEVM
┌──────────┬───────────────────┬────────────┬────────────┐
│ Chain    │ Protocol          │ Supply APY │ Borrow APY │
├──────────┼───────────────────┼────────────┼────────────┤
│ HyperEVM │ HypurrFi Pooled   │ 4.66%      │ 7.21%      │
│ Base     │ Aave V3 Base      │ 2.50%      │ 3.72%      │
│ Mantle   │ Aave V3 Mantle    │ 0.90%      │ 2.10%      │
└──────────┴───────────────────┴────────────┴────────────┘
```

### Discover emission pools (sorted by APR)

```bash
$ defi --chain mantle lp discover --protocol merchantmoe-mantle --emission-only

# returns Merchant Moe LB pools where moePerDay > 0, sorted by APR descending
# top: COOK/WMNT 3433% · WMNT/WETH 1534% · WETH/USDT0 767% · WMNT/USDT0 294% · …
```

### LB liquidity + auto-claim MOE

```bash
# Add LB liquidity centred ±3 bins around active
defi --chain mantle lp add --protocol merchantmoe-mantle \
  --token-a WMNT --token-b USDT0 --amount-a 1000000000000000000 --amount-b 600000 \
  --pool 0x03BeafC0d25BB553fCa274301832419C05269987 --num-bins 3 --broadcast

# Auto-scan all my LB positions + show pending MOE per bin
defi --chain mantle lp positions --protocol merchantmoe-mantle

# Claim — auto-detects user's actual bins (active±50 scan), not just rewarder.getRewardedRange
defi --chain mantle lp claim --protocol merchantmoe-mantle \
  --pool 0x03BeafC0d25BB553fCa274301832419C05269987 --broadcast
```

### Aerodrome Slipstream CL with AERO emission

```bash
# Mint + auto-stake into CL gauge in one command
defi --chain base lp farm --protocol aerodrome-cl \
  --token-a WETH --token-b USDC --amount-a 50000000000000 --amount-b 110000 \
  --range 5 --pool 0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59 --broadcast

# Claim AERO; gauge.withdraw(tokenId) auto-claims pending on unstake too
defi --chain base lp claim --protocol aerodrome-cl \
  --gauge 0xF33a96b5932D9E9B9A0eDA447AbD8C9d48d2e0c8 --token-id <id> --broadcast
```

### DEX aggregator swap (5 providers)

```bash
# Provider auto-detect via chains.toml aggregator slugs
defi --chain mantle swap --provider lifi --from MOE --to WMNT --amount <wei> --broadcast
defi --chain base swap --provider kyber --from WETH --to USDC --amount <wei> --broadcast
defi --chain ethereum swap --provider relay --from WETH --to USDC --amount <wei> --broadcast
```

### Cross-chain bridge

```bash
defi --chain ethereum bridge --token USDC --amount 100000000 --to-chain base --provider lifi --broadcast
```

## Command Reference

| Command | Description |
|---|---|
| `lp discover` | Scan emission pools (gauge / LB hooks / MasterChef / Curve factory). `--emission-only` filters to active pools, sorted by APR desc. |
| `lp add` | Add liquidity. Routes to V3 NPM, Slipstream CL, or LB router based on protocol interface |
| `lp farm` | Add liquidity + auto-stake into gauge / LB hooks |
| `lp claim` | Claim emission/fees. Auto-detects user's actual bins for LB |
| `lp remove` | Auto-unstake (if staked) + remove liquidity. LB supports `--bins`/`--amounts` |
| `lp compound` | Auto-compound for V3 fee-only positions (collect → increaseLiquidity multicall) |
| `lp positions` | Show all active LP positions across protocols + pending rewards |
| `lp pipeline` | Print mint→stake→claim CLI sequence for a protocol's reward_strategy |
| `lp autopilot` | Whitelist-based budget allocation (`~/.defi/pools.toml`) |
| `lending` | rates / position / supply / borrow / repay / withdraw |
| `yield` | compare / scan (cross-chain) / optimize / execute |
| `swap` | DEX aggregator swap (kyber, openocean, liquid, lifi, relay) |
| `bridge` | Cross-chain transfer (lifi, debridge, cctp) |
| `portfolio` | show / snapshot / pnl / history |
| `price` | Oracle + DEX prices |
| `wallet` | Address management |
| `token` | balance / approve / allowance / transfer |
| `ows` | Encrypted vault wallet (multi-chain HD derivation) |
| `setup` | Interactive RPC + wallet wizard |
| `status` | Chain + protocol overview |
| `schema` | JSON schema for agent introspection |

## Architecture

```
defi-cli/
├── ts/                              # TypeScript pnpm monorepo
│   ├── packages/
│   │   ├── defi-core/               # Registry, multicall, traits (13 trait interfaces)
│   │   ├── defi-protocols/          # Protocol adapters (Aave, Uniswap, Solidly, LB, …)
│   │   └── defi-cli/                # CLI commands (~20)
│   └── test/
└── ts/config/
    ├── chains.toml                  # 7 chain configs + per-chain aggregator slug map
    ├── tokens/<chain>.toml          # Per-chain token registries
    └── protocols/<category>/*.toml  # 48 protocol configs
```

### Adapter abstraction (4-layer)

```
CLI (defi-cli)  →  Factory (createDex/createLending/createGauge/…)
  →  Trait interface (IDex / ILending / IGauge / IGaugeSystem / IVault / …)
  →  Adapter implementation (UniswapV3Adapter, AaveV3Adapter, SolidlyGaugeAdapter, …)
  ←  Registry (loads TOML configs at startup, dispatches by entry.interface)
```

**Key design decisions:**
- **Config-driven** — adding a new chain = `chains.toml` row + `tokens/<chain>.toml`. Adding a new protocol = TOML drop (no code if the interface is supported)
- **Adapter polymorphism** — `UniswapV3Adapter` handles standard V3 + Slipstream + Ramses CL via `cl_style` flag; `SolidlyGaugeAdapter` handles V2 + CL gauges via `clNftMode`
- **Aggregator chain mapping** — `chains.toml [chain.X.aggregators]` declares which aggregators support each chain (slug per provider). Add a chain → add an aggregator entry, no code change
- **Dry-run by default** — all transactions simulated unless `--broadcast` is set; auto-approve flow checks allowance and prepends approve tx
- **Agent-first** — every command has `--json` / `--ndjson` / `--fields`, schema introspection via `defi schema`

## Global Options

| Flag | Description |
|---|---|
| `--chain <name>` | Target chain (hyperevm, mantle, base, bnb, monad, arbitrum, ethereum) |
| `--json` | Structured JSON output |
| `--ndjson` | Newline-delimited JSON (streaming) |
| `--fields <a,b>` | Filter output to selected fields |
| `--dry-run` | Default — simulate only |
| `--broadcast` | Actually send the transaction |

## Environment Variables

| Variable | Description |
|---|---|
| `{CHAIN}_RPC_URL` | Override RPC URL (e.g., `MANTLE_RPC_URL`, `BASE_RPC_URL`) |
| `DEFI_PRIVATE_KEY` | Private key for `--broadcast` |
| `DEFI_WALLET_ADDRESS` | Default wallet address (also accepts `ows:<name>` for OWS vault wallets) |

## License

MIT
