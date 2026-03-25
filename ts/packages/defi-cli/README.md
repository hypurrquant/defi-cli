# defi-cli

[![npm version](https://img.shields.io/npm/v/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![npm downloads](https://img.shields.io/npm/dw/@hypurrquant/defi-cli.svg)](https://www.npmjs.com/package/@hypurrquant/defi-cli)
[![license](https://img.shields.io/npm/l/@hypurrquant/defi-cli.svg)](https://github.com/hypurrquant/defi-cli/blob/main/LICENSE)

Multi-chain DeFi CLI — **HyperEVM** and **Mantle** with 32 protocols for lending, DEX, LP, bridge, vault, staking, gauge, and farm operations.

```bash
npm install -g @hypurrquant/defi-cli    # global install
defi --json status

# Or without global install (restricted environments)
npx -y @hypurrquant/defi-cli --json status
```

## Features

- **2 Chains** — HyperEVM (chain 999) and Mantle (chain 5000)
- **32 Protocols** — 14 DEX (Uniswap, Algebra, Balancer, Curve, Solidly, etc.), 9 lending (Aave, Compound, Euler, Morpho, etc.), vaults, liquid staking, CDP, yield aggregators
- **Lending** — rates, positions, supply, borrow, repay, withdraw across all lending protocols
- **DEX** — quote, swap, LP add/remove, compare prices across DEXes
- **LP Management** — add/remove liquidity, manage concentrated positions
- **Bridge** — cross-chain token transfer via Lifi and deBridge
- **Vault** — deposit, withdraw, yield tracking
- **Staking** — stake, unstake, claim rewards
- **Gauge** — deposit, withdraw, lock, vote, claim rewards
- **Farm** — deposit, withdraw, claim yields
- **Portfolio** — unified balance and position overview
- **Agent-First Design** — `--json`, `--fields`, `--ndjson`, `--dry-run`, runtime schema introspection
- **Safety** — pre-flight checks, dry-run validation, schema introspection

## Setup

```bash
# Set wallet credentials
export DEFI_PRIVATE_KEY="0x..."           # Private key for transactions
export DEFI_WALLET_ADDRESS="0x..."        # Wallet address for queries

# Optional: override RPC endpoints (defaults provided)
export HYPEREVM_RPC_URL="https://..."
export MANTLE_RPC_URL="https://..."

# Verify setup
defi --json status
```

## Command Groups

| Group | Subcommands | Description |
|-------|------------|-------------|
| `status` | — | Unified dashboard: balances, positions, rates |
| `schema` | — | Runtime schema introspection for agents |
| `dex` | quote, swap, lp-add, lp-remove, compare | DEX operations: prices, trades, liquidity |
| `lending` | rates, position, supply, borrow, repay, withdraw | Lending protocol operations |
| `gauge` | deposit, withdraw, lock, vote, claim | Gauge voting and reward claims |
| `farm` | deposit, withdraw, claim, info | Yield farming operations |
| `cdp` | open, adjust, close, info | Collateralized debt position management |
| `staking` | stake, unstake, info | Staking and reward management |
| `vault` | deposit, withdraw, info | Vault deposits and yield tracking |
| `bridge` | — | Cross-chain token bridge (LI.FI, deBridge, CCTP) |
| `yield` | compare, scan, execute, optimize | Yield aggregator and strategy tracking |
| `portfolio` | — | Cross-protocol unified portfolio view |
| `positions` | — | Summary of all open positions |
| `price` | token, dex | Token prices and DEX aggregation |
| `token` | balance, allowance, approve, transfer | ERC20 token operations |
| `wallet` | balance, nonce, gas | Wallet info and on-chain data |
| `whales` | watch, track, alerts | Large holder tracking |
| `scan` | exploits, arbitrage, opportunities | Protocol scanning and opportunity detection |
| `compare` | yields, rates, costs | Cross-protocol comparison |
| `swap` | aggregator | Aggregated DEX swap finder |
| `arb` | scan, execute, monitor | Arbitrage opportunities |
| `monitor` | positions, yields, risks | Live monitoring and alerts |
| `alert` | setup, add, test, list, start, stop | Telegram price and yield alerts |
| `nft` | collections, balances | NFT portfolio tracking |

## Supported Protocols

### DEX (14 protocols)

| Chain | Protocol | Type |
|-------|----------|------|
| HyperEVM | HyperSwap V3 | Uniswap V3 AMM |
| HyperEVM | HyperSwap V2 | Uniswap V2 AMM |
| HyperEVM | KittenSwap | Solidly V2 AMM |
| HyperEVM | Ramses CL | Algebra V3 AMM |
| HyperEVM | Ramses HL | Solidly CL AMM |
| HyperEVM | Project X | Uniswap V2 AMM |
| HyperEVM | Nest | Solidly V2 AMM |
| HyperEVM | Ring Few | Solidly CL AMM |
| HyperEVM | WooFi | Spot Trading |
| Mantle | Uniswap V3 | Uniswap V3 AMM |
| Mantle | Merchant Joe | Solidly V2 AMM |
| Both | Balancer V3 | Weighted Pool AMM |
| Both | Curve | Stablecoin Swap |
| Both | DEX Price Feed | Oracle |

### Lending (9 protocols)

| Chain | Protocol | Type |
|-------|----------|------|
| HyperEVM | HyperLend | Aave V3 Fork |
| HyperEVM | HyperYield | Supply Market |
| HyperEVM | PurrlendV2 | Lendable Market |
| HyperEVM | PrimeFi | Lending |
| Mantle | Aave V3 | Lending |
| Mantle | Lendle | Aave V3 Fork |
| Both | Euler V2 | Lending |
| Both | Morpho Blue | Lending |
| Both | Felix Morpho | CDP + Lending |

### Other Protocols

| Category | Chain | Protocol |
|----------|-------|----------|
| **Liquid Staking** | HyperEVM | stHYPE (Generic LST) |
| — | HyperEVM | Kinetiq (Mantle LST) |
| **Vaults** | HyperEVM | Hyperbeat (ERC4626) |
| — | HyperEVM | Hypersurface (ERC4626) |
| — | HyperEVM | Looping (ERC4626) |
| — | Mantle | Upshift (ERC4626) |
| — | Both | Felix Vaults (ERC4626) |
| **CDP** | Both | Felix (MorphoBlue) |
| **Yield Aggregator** | HyperEVM | Lazy Summer |
| **NFT** | HyperEVM | Seaport |

## Core Commands

### Status & Portfolio

```bash
# Unified dashboard: balances + positions + yields
defi --json status

# Cross-protocol portfolio view
defi --json portfolio

# Open positions across all protocols
defi --json positions
```

### DEX Operations

```bash
# Get swap quote (no execution)
defi --json dex quote --protocol hyperswap --token-in HYPE --token-out USDC --amount 1000000000000000000

# Execute swap
defi --json dex swap --protocol hyperswap --token-in HYPE --token-out USDC --amount 1000000000000000000 --broadcast

# Add liquidity
defi --json dex lp-add --protocol hyperswap --token-a HYPE --token-b USDC --amount-a 1000000000000000000 --amount-b 5000000000 --broadcast

# Remove liquidity
defi --json dex lp-remove --protocol hyperswap --lp-token <ADDRESS> --amount <AMOUNT> --broadcast

# Compare prices across DEXes
defi --json dex compare --token-in HYPE --token-out USDC --amount 1000000000000000000
```

### Lending Operations

```bash
# Get lending rates across all protocols
defi --json lending rates

# Check user position in a protocol
defi --json lending position --protocol hyperlend

# Supply collateral
defi --json lending supply --protocol hyperlend --token USDC --amount 1000000000 --broadcast

# Borrow assets
defi --json lending borrow --protocol hyperlend --token HYPE --amount 1000000000000000000 --broadcast

# Repay debt
defi --json lending repay --protocol hyperlend --token HYPE --amount 500000000000000000 --broadcast

# Withdraw collateral
defi --json lending withdraw --protocol hyperlend --token USDC --amount 500000000 --broadcast
```

### Staking

```bash
# Stake tokens
defi --json staking stake --protocol kinetiq --amount 1000000000000000000 --broadcast

# Unstake tokens
defi --json staking unstake --protocol kinetiq --amount 500000000000000000 --broadcast

# Check staking info
defi --json staking info --protocol kinetiq
```

### Gauge & Voting

```bash
# Deposit into gauge
defi --json gauge deposit --protocol kinetiq --amount 1000000000000000000 --broadcast

# Lock tokens for voting power
defi --json gauge lock --protocol kinetiq --amount 1000000000000000000 --weeks 52 --broadcast

# Vote on proposals
defi --json gauge vote --protocol kinetiq --gauge <ADDRESS> --weight 100 --broadcast

# Claim gauge rewards
defi --json gauge claim --protocol kinetiq --broadcast
```

### Vaults

```bash
# Deposit into vault
defi --json vault deposit --protocol hyperbeat --amount 1000000000000000000 --broadcast

# Withdraw from vault
defi --json vault withdraw --protocol hyperbeat --shares 1000000000000000000 --broadcast

# Check vault info and yield
defi --json vault info --protocol hyperbeat
```

### Bridge

```bash
# Bridge tokens (LI.FI, deBridge, or CCTP)
defi --json bridge --token USDC --amount 1000000000 --to-chain mantle --provider lifi

# Bridge via deBridge
defi --json bridge --token USDC --amount 1000000000 --to-chain mantle --provider debridge --broadcast

# Cross-chain transfer via CCTP
defi --json bridge --token USDC --amount 1000000000 --to-chain mantle --provider cctp --broadcast
```

### Yield & Farming

```bash
# Get yield comparison across protocols
defi --json yield compare

# Scan yield opportunities
defi --json yield scan

# Execute yield strategy
defi --json yield execute --strategy lazy-summer --amount 1000000000000000000 --broadcast

# Farm deposit via MasterChef
defi --json farm deposit --protocol lazy-summer --amount 1000000000000000000 --broadcast

# Farm withdraw
defi --json farm withdraw --protocol lazy-summer --amount 500000000000000000 --broadcast

# Farm claim rewards
defi --json farm claim --protocol lazy-summer --broadcast
```

### Scanning & Arbitrage

```bash
# Scan for exploits and opportunities
defi --json scan exploits

# Scan arbitrage opportunities
defi --json arb scan --min 0.5

# Execute arbitrage
defi --json arb execute --symbol token --buy-exchange exchange1 --sell-exchange exchange2 --amount 1000000000000000000 --broadcast
```

### Token & Wallet Operations

```bash
# Check token balance
defi --json token balance --address 0x... --token USDC

# Approve token spending
defi --json token approve --token USDC --spender 0x... --amount 1000000000 --broadcast

# Check wallet balance
defi --json wallet balance --address 0x...

# Get wallet nonce
defi --json wallet nonce --address 0x...
```

### Price & Market Data

```bash
# Get token price from oracles and DEXes
defi --json price --asset HYPE

# Get price from DEX sources only
defi --json price --asset HYPE --source dex

# Get price from oracle sources only
defi --json price --asset HYPE --source oracle
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
defi --json --ndjson dex quote --protocol hyperswap --token-in HYPE --token-out USDC --amount 1000000000000000000

# Pre-validate before executing
defi --json --dry-run dex swap --protocol hyperswap --token-in HYPE --token-out USDC --amount 1000000000000000000

# Safe by default: --dry-run is on, use --broadcast to execute
defi --json dex swap --protocol hyperswap --token-in HYPE --token-out USDC --amount 1000000000000000000 --broadcast
```

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

## MCP Server (Coming Soon)

MCP server support for Claude Desktop, Cursor, and other MCP clients is in development. Full tool integrations for lending, DEX, staking, and portfolio tracking will be available soon.

## License

MIT
