# defi-cli

[![npm version](https://img.shields.io/npm/v/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![npm downloads](https://img.shields.io/npm/dw/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![license](https://img.shields.io/npm/l/@hypurrquant/defi-cli.svg)](https://github.com/hypurrquant/defi-cli/blob/main/LICENSE)

Multi-chain DeFi CLI — **HyperEVM** (17 protocols) and **Mantle** (4 protocols) for lending, DEX, LP, bridge, and portfolio operations.

```bash
npm install -g @hypurrquant/defi-cli    # global install
defi --json status

# Or without global install (restricted environments)
npx -y @hypurrquant/defi-cli --json status
```

## Features

- **2 Chains** — HyperEVM (chain 999) and Mantle (chain 5000)
- **21 Protocols** — lending (Aave V3 forks, Morpho, HypurrFi), DEX (KittenSwap, Ramses, Uniswap V3, Merchant Moe LB), vaults, CDP
- **Lending** — rates, positions, supply, withdraw across all lending protocols
- **DEX** — add/remove liquidity with multicall optimization
- **LP Management** — discover 134 emission pools, add, farm, claim, remove, autopilot
- **DEX Aggregator** — best-price swap via KyberSwap, OpenOcean, LiquidSwap
- **Bridge** — cross-chain token transfer via LI.FI, deBridge, CCTP
- **Portfolio** — aggregate positions across lending and LP
- **Auto-Approve** — checks allowance, exact-approves, then executes in one flow
- **Agent-First Design** — `--json`, `--fields`, `--ndjson`, `--dry-run`, runtime schema introspection
- **MCP Server** — 14 tools for Claude Desktop, Cursor, and other MCP clients
- **Claude Code Skill** — installable skill for AI-assisted DeFi operations

## Setup

```bash
# Set wallet credentials
export DEFI_PRIVATE_KEY="0x..."           # Private key for transactions
export DEFI_WALLET_ADDRESS="0x..."        # Wallet address for queries

# Optional: override RPC endpoints (defaults provided)
export HYPEREVM_RPC_URL="https://..."
export MANTLE_RPC_URL="https://..."

# Interactive setup wizard
defi setup

# Verify setup
defi --json status
```

## Command Reference

| Command | Description |
|---------|-------------|
| `defi` | Dashboard — multicall balances across all protocols |
| `defi yield` | Cross-chain lending APY comparison (default: USDC) |
| `defi swap` | DEX aggregator swap (KyberSwap, OpenOcean, LiquidSwap) |
| `defi lp discover` | Scan 134 emission pools (gauge/farming/lb_hooks) |
| `defi lp add` | Add liquidity to a pool |
| `defi lp farm` | Add liquidity and auto-stake for emissions |
| `defi lp claim` | Claim fee and emission rewards |
| `defi lp remove` | Auto-unstake and remove liquidity |
| `defi lp autopilot` | Whitelist-based auto-allocation across pools |
| `defi lending` | Supply, withdraw, rates, position |
| `defi portfolio` | Aggregate positions across all protocols |
| `defi price` | Oracle and DEX prices |
| `defi token` | Approve, allowance, transfer, balance |
| `defi wallet` | Address management |
| `defi bridge` | Cross-chain transfer (LI.FI, deBridge, CCTP) |
| `defi status` | Protocol overview |
| `defi schema` | JSON schema for agent introspection |
| `defi setup` | Interactive wallet/RPC config wizard |

## Supported Protocols

### HyperEVM (17 protocols)

| Protocol | Category | Interface |
|----------|----------|-----------|
| KittenSwap | DEX | Algebra V3 (CL) |
| NEST V1 | DEX | Algebra V3 (CL) |
| Ramses HL | DEX | Solidly V2 (ve(3,3)) |
| Ramses CL | DEX | Uniswap V3 (CL) |
| Project X | DEX | Uniswap V2 |
| Hybra | DEX | Solidly V2 |
| HyperLend | Lending | Aave V3 |
| HypurrFi | Lending | Aave V3 |
| Felix Morpho | Lending | Morpho Blue |
| Felix Vaults | Vault | ERC-4626 |
| Felix CDP | CDP | Liquity V2 |
| Hyperbeat | Vault | ERC-4626 |
| Looping | Vault | ERC-4626 |
| Upshift | Vault | ERC-4626 |
| Lazy Summer | Yield Aggregator | ERC-4626 |
| Hypersurface | Options | — |
| Seaport | NFT | — |

### Mantle (4 protocols)

| Protocol | Category | Interface |
|----------|----------|-----------|
| Aave V3 | Lending | Aave V3 |
| Lendle | Lending | Aave V3 Fork |
| Uniswap V3 | DEX | Uniswap V3 (CL) |
| Merchant Moe | DEX | Uniswap V2 + Liquidity Book |

## Core Commands

### Dashboard

```bash
# Multicall balance dashboard
defi --json

# Protocol overview for current chain
defi --json status

# Mantle protocols
defi --json --chain mantle status
```

### Lending

```bash
# Cross-chain lending APY comparison (default: USDC)
defi --json yield
defi --json --chain mantle yield --asset USDT

# Check user position
defi --json lending position --protocol hyperlend

# Supply collateral (auto-approve included)
defi --json lending supply --protocol hyperlend --asset USDC --amount 1000000000 --broadcast

# Withdraw collateral
defi --json lending withdraw --protocol hyperlend --asset USDC --amount 500000000 --broadcast
```

### DEX Aggregator Swap

Uses KyberSwap, OpenOcean, and LiquidSwap to find the best route automatically.

```bash
# Dry-run (default — no transaction)
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000

# Execute swap
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000 --broadcast

# With slippage (basis points)
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000 --slippage 100 --broadcast
```

### LP Operations

#### Discover Pools

```bash
# List all 134 emission pools across HyperEVM
defi --json lp discover

# Filter by protocol
defi --json lp discover --protocol kittenswap

# Show only pools with APR above threshold
defi --json lp discover --min-apr 10
```

#### Add Liquidity

```bash
defi --json lp add --protocol kittenswap --pool-address 0x... --amount-a 1000000000000000000 --amount-b 5000000000 --broadcast
```

#### Farm (Add + Auto-stake)

```bash
# Add liquidity and stake into gauge/farming in one step
defi --json lp farm --protocol kittenswap --pool-address 0x... --amount-a 1000000000000000000 --amount-b 5000000000 --broadcast
```

#### Claim Rewards

```bash
# Claim fee and emission rewards from a pool
defi --json lp claim --protocol kittenswap --pool-address 0x... --broadcast
```

#### Remove Liquidity

```bash
# Auto-unstake (if staked) and remove liquidity
defi --json lp remove --protocol kittenswap --pool-address 0x... --broadcast
```

#### LP Autopilot

Reads `~/.defi/pools.toml` for whitelisted pools and allocates budget automatically.

```bash
# Dry-run autopilot allocation
defi --json lp autopilot --budget 1000000000   # 1000 USDC

# Execute
defi --json lp autopilot --budget 1000000000 --broadcast
```

**pools.toml example:**

```toml
[[pools]]
protocol = "kittenswap"
pool_address = "0xYourPoolAddress"
weight = 50   # 50% of budget

[[pools]]
protocol = "nest-v1"
pool_address = "0xAnotherPool"
weight = 50
```

Default location: `~/.defi/pools.toml`

### Bridge

```bash
# Bridge via LI.FI (default)
defi --json bridge --token USDC --amount 100000000 --to-chain mantle

# Bridge via deBridge DLN
defi --json bridge --token USDC --amount 100000000 --to-chain arbitrum --provider debridge --broadcast

# Native USDC via Circle CCTP V2
defi --json bridge --token USDC --amount 100000000 --to-chain arbitrum --provider cctp --broadcast
```

### Portfolio

```bash
# Aggregate positions across all protocols
defi --json portfolio
```

### Token & Wallet

```bash
# Token operations
defi --json token balance --token USDC
defi --json token allowance --token USDC --spender 0x...
defi --json token approve --token USDC --spender 0x... --amount max --broadcast
defi --json token transfer --token USDC --to 0x... --amount 1000000 --broadcast

# Wallet management
defi --json wallet address
defi --json wallet balance
```

### Price & Market Data

```bash
# Oracle + DEX prices
defi --json price --asset WHYPE

# DEX prices only
defi --json price --asset WHYPE --source dex

# Oracle prices only
defi --json price --asset USDC --source oracle
```

## Agent-First Design

Built for AI agents and automation with structured output, schema introspection, and validation:

```bash
# Every command returns JSON envelope
defi --json status
# → { "ok": true, "data": {...}, "meta": { "timestamp": "..." } }

# Runtime schema introspection (query available commands)
defi --json schema

# Filter output to specific fields (saves tokens)
defi --json --fields balance,positions status

# Stream large lists as NDJSON (one JSON per line)
defi --json --ndjson lp discover

# Pre-validate before executing
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000

# Safe by default: --dry-run is on, use --broadcast to execute
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000 --broadcast
```

Responses include `needs_approval` simulation status. Auto-approve flow: check allowance → exact approve → execute tx.

All responses are auto-sanitized (control chars stripped, prompt injection patterns blocked).
Errors include `retryable` flag — only retry when `true`.

## Global Flags

```bash
--json              # Output as JSON (structured for agents)
--ndjson            # Output as newline-delimited JSON
--fields <f>        # Select output fields (comma-separated)
--chain <chain>     # Target chain: hyperevm (default) or mantle
--dry-run           # Dry-run mode (default, no broadcast)
--broadcast         # Execute transaction on-chain
```

## Environment Variables

```bash
DEFI_PRIVATE_KEY         # Private key for signing transactions
DEFI_WALLET_ADDRESS      # Wallet address for queries and execution
HYPEREVM_RPC_URL         # Override HyperEVM RPC endpoint
MANTLE_RPC_URL           # Override Mantle RPC endpoint
```

## MCP Server

14 MCP tools for Claude Desktop, Cursor, and other MCP clients.

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

**Available tools:** `defi_status`, `defi_lending_rates`, `defi_lending_supply`, `defi_lending_withdraw`, `defi_dex_quote`, `defi_dex_swap`, `defi_dex_lp_add`, `defi_dex_lp_remove`, `defi_bridge`, `defi_vault_info`, `defi_staking_info`, `defi_price`, `defi_scan`, `defi_portfolio`

See `mcp-config.example.json` for full configuration.

## Claude Code Skill

Install the skill for AI-assisted DeFi operations:

```bash
# Install from npm package
npx -y @hypurrquant/defi-cli skill install
```

Or copy `skills/defi-cli/` into your Claude Code skills directory.

## License

MIT
