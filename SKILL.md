# DeFi CLI — AI Agent Usage Guide

## Overview

`defi` is a CLI tool for interacting with 60+ DeFi protocols on HyperEVM.
All mutation operations default to `--dry-run` (safe). Use `--broadcast` to execute.

## Agent Mode

Send JSON commands via stdin for programmatic access:

```bash
echo '{"action":"status","params":{}}' | defi agent
echo '{"action":"dex.swap","params":{"protocol":"hyperswap-v3","token_in":"WHYPE","token_out":"USDC","amount":"1.0"}}' | defi agent
```

## Available Actions

### Read Operations
- `status` — Chain and protocol info
- `list_protocols` — List protocols (optional: `{"category":"dex"}`)
- `schema` — Get JSON schema for any action (`{"action":"dex.swap"}`)

### DEX
- `dex.swap` — Build swap transaction
  - params: `protocol`, `token_in`, `token_out`, `amount`, `slippage_bps` (optional, default 50), `recipient` (optional)
- `dex.quote` — Get swap quote (requires RPC)

### Lending
- `lending.supply` — Supply asset to lending pool
- `lending.borrow` — Borrow asset from lending pool
- `lending.repay` — Repay borrowed asset
- `lending.withdraw` — Withdraw supplied asset
  - params: `protocol`, `asset`, `amount`

### Liquid Staking
- `staking.stake` — Stake native token
- `staking.unstake` — Request unstake
  - params: `protocol`, `amount`

### Vault (ERC-4626)
- `vault.deposit` — Deposit into vault
- `vault.withdraw` — Withdraw from vault
  - params: `protocol`, `amount`

### CDP
- `cdp.open` — Open CDP position
  - params: `protocol`, `collateral`, `collateral_amount`, `debt_amount`

## CLI Mode

```bash
# DEX swap (dry-run by default)
defi dex swap --protocol hyperswap-v3 --token-in WHYPE --token-out USDC --amount 1.0 --json

# Lending supply
defi lending supply --protocol hyperlend --asset USDC --amount 100.0 --json

# Staking
defi staking stake --protocol kinetiq --amount 10.0 --json

# Vault deposit
defi vault deposit --protocol veda --amount 100.0 --json

# Get schema
defi schema dex.swap --json

# Status
defi status --json
```

## Output Modes

- `--json` — JSON output
- `--ndjson` — Newline-delimited JSON
- `--fields field1,field2` — Filter output fields

## Safety

- All mutation operations default to `--dry-run`
- Use `--broadcast` to actually send transactions
- Dry-run returns the encoded calldata without sending

## Supported Protocols (60)

### DEX (15)
HyperSwap V3, HyperSwap V2, Project X, KittenSwap, NEST, Curve, Balancer V3, Ring Few, Ramses CL, Ramses HL, WOOFi, Valantis, Wombat, Hybra, Hyperliquid Spot

### Lending (8)
HyperLend, Morpho, Euler V2, HypurrFi, TermMax, Hyperdrive, HypurrFi Isolated, Teller

### Liquid Staking (4)
Kinetiq (kHYPE), stHYPE, Hyperbeat LST, Kintsu

### CDP (2)
Felix, Parallel

### Bridge (4)
Hyperliquid Bridge, Hyperlane, SoDEX, Symbiosis

### Yield Source (10)
Pendle, Spectra, Penpie, Felix USDhl, Equilibria, Looped Hype, GrowiHF, Harmonix, HyperWave, Wrapped HLP

### Yield Aggregator (4)
Beefy, Hyperbeat Earn, Kinetiq Earn, Lazy Summer

### Vault (4)
Veda, Upshift, Felix Vaults, D2 Finance

### Derivatives (3)
Hyperliquid HLP, Derive V2, Kinetiq Markets

### Options (2)
Rysk V12, Hypersurface
