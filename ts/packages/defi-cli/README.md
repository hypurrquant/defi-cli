# @hypurrquant/defi-cli

[![npm version](https://img.shields.io/npm/v/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![npm downloads](https://img.shields.io/npm/dw/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![license](https://img.shields.io/npm/l/@hypurrquant/defi-cli.svg)](https://github.com/hypurrquant/defi-cli/blob/main/LICENSE)

Multi-chain DeFi CLI — **7 chains · 48 protocols · 5 aggregators**. Lending, LP farming with emission claim, DEX swap via aggregator, cross-chain bridge.

```bash
npm install -g @hypurrquant/defi-cli
defi --json status

# Or one-shot
npx -y @hypurrquant/defi-cli --json status
```

## Supported Chains

| Chain | ID | Status | Protocols |
|---|---|---|---|
| HyperEVM | 999 | 🟢 production | 11 |
| Mantle | 5000 | 🟢 production | 3 |
| Base | 8453 | 🟢 production | 5 |
| BNB | 56 | 🟡 staged | 16 |
| Monad | 143 | 🟡 staged | 4 |
| Arbitrum | 42161 | 🟡 staged | 3 |
| Ethereum | 1 | 🟡 staged | 6 |

🟢 = full lifecycle broadcast verified (mint/supply → claim → withdraw)
🟡 = configs + read-only paths verified, awaiting funded broadcast

## Supported Protocols

### HyperEVM (11)
| Slug | Category | Notes |
|---|---|---|
| `hyperlend`, `hypurrfi` | Lending | Aave V3 forks |
| `felix-morpho` | Lending | Morpho Blue + MetaMorpho ERC-4626 routing |
| `project-x`, `hyperswap` | DEX | Uniswap V3 fee-only |
| `curve-hyperevm` | DEX | Curve StableswapNG |
| `ramses-cl` | DEX | Uniswap V3 + Ramses x(3,3) auto-stake |
| `ramses-hl` | DEX | Solidly V2 ve(3,3), RAM emission |
| `kittenswap` | DEX | Algebra V3 + Eternal Farming, KITTEN/WHYPE |
| `hybra` | DEX | Hybra V4 CL + GaugeManager (HYBR vesting) |
| `nest` | DEX | Algebra V3 + off-chain ticket NEST claim |

### Mantle (3)
| Slug | Category | Notes |
|---|---|---|
| `aave-v3-mantle` | Lending | |
| `uniswap-v3-mantle` | DEX | |
| `merchantmoe-mantle` | DEX | LB hooks + MasterChef MOE emission |

### Base (5)
| Slug | Category | Notes |
|---|---|---|
| `aave-v3-base` | Lending | |
| `compound-v3-base` | Lending | Comet |
| `uniswap-v3-base` | DEX | |
| `aerodrome-base` | DEX | Solidly V2, AERO emission |
| `aerodrome-cl` | DEX | Slipstream CL with NFT gauge, AERO emission |

### BNB (16)
- **Lending**: `aave-v3-bnb`, `kinza-bnb`, `venus-bnb`, `venus-flux-bnb`
- **DEX**: `pancakeswap-v3-bnb` (+ MasterChef CAKE), `pancakeswap-v2-bnb`, `uniswap-v3-bnb`, `thena-v1`, `thena-fusion`, `biswap-bnb`, `apeswap-bnb`, `bakeryswap-bnb`, `bscswap-bnb`, `babydogeswap-bnb`, `fstswap-bnb`
- **Vault**: `beefy-bnb`

### Monad (4)
`uniswap-v2-monad`, `uniswap-v3-monad`, `traderjoe-monad` (LB), `morpho-blue-monad`

### Ethereum (6)
`aave-v2-ethereum`, `aave-v3-ethereum`, `compound-v3-ethereum`, `morpho-blue-ethereum`, `uniswap-v2-ethereum`, `uniswap-v3-ethereum`

### Arbitrum (3)
`aave-v3-arbitrum`, `compound-v3-arbitrum`, `uniswap-v3-arbitrum`

## DEX Aggregators (Live-verified)

| Aggregator | HyperEVM | Mantle | Base | BNB | Ethereum | Arbitrum |
|---|---|---|---|---|---|---|
| KyberSwap | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| OpenOcean | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LiquidSwap | ✅ | — | — | — | — | — |
| LI.FI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relay | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Setup

```bash
# Wallet credentials
export DEFI_PRIVATE_KEY="0x..."
export DEFI_WALLET_ADDRESS="0x..."

# Optional: override RPC endpoints
export HYPEREVM_RPC_URL="https://..."
export MANTLE_RPC_URL="https://..."
export BASE_RPC_URL="https://..."

# Or use OWS encrypted vault wallets
defi ows create my-wallet
export DEFI_WALLET_ADDRESS="ows:my-wallet"

# Interactive setup wizard
defi setup
```

## Command Reference

| Command | Description |
|---------|-------------|
| `lp discover` | Scan emission pools (gauge/LB/MasterChef/Curve). `--emission-only` filters & sorts by APR |
| `lp add` | Add liquidity (V3 NPM, Slipstream CL, LB router auto-dispatch) |
| `lp farm` | Add + auto-stake into gauge or LB |
| `lp claim` | Claim emission/fees (auto-detects user's actual LB bins) |
| `lp remove` | Auto-unstake + remove (LB supports `--bins`, `--amounts`) |
| `lp compound` | V3 fee-only auto-compound (collect + increaseLiquidity multicall) |
| `lp positions` | Show all positions + pending rewards (LB auto-scans all rewarded pools) |
| `lp pipeline` | Print mint→stake→claim CLI sequence for a protocol |
| `lp autopilot` | Whitelist-based budget allocation (`~/.defi/pools.toml`) |
| `lending` | rates / position / supply / borrow / repay / withdraw |
| `yield` | compare / scan (cross-chain) / optimize / execute |
| `swap` | DEX aggregator (kyber, openocean, liquid, lifi, relay) |
| `bridge` | Cross-chain (lifi, debridge, cctp) |
| `portfolio` | show / snapshot / pnl / history |
| `price` | Oracle + DEX prices |
| `wallet` | Address management |
| `token` | balance / approve / allowance / transfer |
| `ows` | Encrypted vault wallet (multi-chain HD) |
| `setup` | Interactive wizard |
| `status` | Protocol overview |
| `schema` | JSON schema for agent introspection |

## Examples

### Cross-chain yield comparison
```bash
defi --json yield scan --asset USDC
```

### LB liquidity + auto-claim MOE on Mantle
```bash
# Add LB liquidity centred ±3 bins around active
defi --chain mantle lp add --protocol merchantmoe-mantle \
  --token-a WMNT --token-b USDT0 --amount-a 1000000000000000000 --amount-b 600000 \
  --pool 0x03BeafC0d25BB553fCa274301832419C05269987 --num-bins 3 --broadcast

# See pending MOE across all my LB positions (auto-scans all pools)
defi --chain mantle lp positions --protocol merchantmoe-mantle

# Claim — auto-detects user's actual bins (active±50 scan)
defi --chain mantle lp claim --protocol merchantmoe-mantle \
  --pool 0x03BeafC0d25BB553fCa274301832419C05269987 --broadcast
```

### Aerodrome Slipstream CL on Base
```bash
# Mint + auto-stake CL position with ±5% range
defi --chain base lp farm --protocol aerodrome-cl \
  --token-a WETH --token-b USDC --amount-a 50000000000000 --amount-b 110000 \
  --range 5 --pool 0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59 --broadcast

# Claim AERO; gauge.withdraw also auto-claims pending on unstake
defi --chain base lp claim --protocol aerodrome-cl \
  --gauge 0xF33a96b5932D9E9B9A0eDA447AbD8C9d48d2e0c8 --token-id <id> --broadcast
```

### DEX aggregator swap
```bash
# Pick the cheapest provider per chain
defi --chain mantle swap --provider lifi --from MOE --to WMNT --amount <wei> --broadcast
defi --chain base swap --provider kyber --from WETH --to USDC --amount <wei> --broadcast
defi --chain ethereum swap --provider relay --from WETH --to USDC --amount <wei> --broadcast
```

## Agent-First Design

```bash
# Every command returns JSON envelope
defi --json status
# → { "ok": true, "data": {...}, "meta": { "timestamp": "..." } }

# Schema introspection
defi --json schema

# Filter output (saves tokens)
defi --json --fields balance,positions status

# Stream large lists
defi --json --ndjson lp discover

# Dry-run by default — explicit --broadcast required
defi --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000           # simulated
defi --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000 --broadcast  # executed
```

Auto-approve flow: simulation returns `needs_approval` with `pending_approvals` list → executor prepends the approve tx automatically.

## MCP Server

```json
{
  "mcpServers": {
    "defi-cli": {
      "command": "npx",
      "args": ["-y", "@hypurrquant/defi-cli", "mcp"]
    }
  }
}
```

Tools include: `defi_status`, `defi_yield_scan`, `defi_lending_*`, `defi_lp_*`, `defi_swap`, `defi_bridge`, `defi_price`, `defi_token_*`, `defi_portfolio`, `defi_schema`. See `mcp-config.example.json`.

## Claude Code Skill

```bash
npx -y @hypurrquant/defi-cli skill install
```

Or copy `skills/defi-cli/` into your Claude Code skills directory.

## Environment Variables

| Variable | Description |
|---|---|
| `{CHAIN}_RPC_URL` | Per-chain RPC override (e.g., `MANTLE_RPC_URL`, `BASE_RPC_URL`) |
| `DEFI_PRIVATE_KEY` | Private key for `--broadcast` |
| `DEFI_WALLET_ADDRESS` | Default wallet (accepts `ows:<name>` for OWS vault) |

## Global Flags

```bash
--chain <name>      # hyperevm | mantle | base | bnb | monad | arbitrum | ethereum
--json              # JSON output
--ndjson            # NDJSON streaming
--fields <a,b>      # Output field filter
--dry-run           # Default — simulate only
--broadcast         # Send tx on-chain
```

## License

MIT
