---
name: defi-cli
description: "Multi-chain DeFi operations CLI for HyperEVM (Hyperliquid) and Mantle. Use when user asks to: supply/withdraw from lending, swap tokens, add/remove LP, bridge assets, manage LP autopilot, claim rewards, compare APYs, check prices, track portfolio, or mentions defi-cli, HyperEVM, Hyperliquid EVM, Mantle, HypurrFi, HyperLend, Felix, KittenSwap, NEST, Ramses, Merchant Moe, KyberSwap, OpenOcean, LiquidSwap."
allowed-tools: "Bash(defi:*), Bash(npx defi-cli:*), Bash(npx -y defi-cli:*)"
license: MIT
metadata:
  author: hypurrquant
  version: "0.4.0"
---

# defi-cli Agent Guide

Multi-chain DeFi CLI — lending, DEX swaps, LP management, bridging, yield comparison — all from your terminal.

2 chains: **HyperEVM** (Hyperliquid EVM, chain ID 999) and **Mantle** (chain ID 5000).
21 protocols across lending, DEX, vault, CDP.

## Rules

1. **Always use `--json`** on every command.
2. **Always use `--dry-run`** (default) before any mutating transaction. Only add `--broadcast` after user confirms.
3. **Always use `--chain`** for transaction commands (`lending supply`, `swap`, `lp`, `token`, `price`, `wallet`, `bridge`). Query commands (`yield`, `status`) scan all chains by default.
4. **NEVER broadcast without user confirmation.**
5. **NEVER read private key files or `~/.` config files.**
6. **Amounts are in wei** (18 decimals for most tokens, 6 for USDC/USDT). Use `BigInt(humanAmount * 10**decimals)` to convert.

## Install

```bash
defi --version 2>/dev/null           # check if installed
npm install -g @hypurrquant/defi-cli@latest 2>/dev/null || npx -y @hypurrquant/defi-cli@latest --json status
```

Use `defi` if global install works, otherwise `npx -y @hypurrquant/defi-cli@latest` as prefix.

## Global Flags

`--json` (required) | `--chain <chain>` (hyperevm or mantle, required for tx commands) | `--dry-run` (default, safe) | `--broadcast` (executes tx) | `--fields <f1,f2>` | `--ndjson`

**Wallet**: set `DEFI_WALLET_ADDRESS` env for read queries. Set `DEFI_PRIVATE_KEY` for tx signing.

## Environment

```bash
export DEFI_WALLET_ADDRESS=0xYourAddress
export DEFI_PRIVATE_KEY=0xYourPrivateKey   # only needed for broadcasting
```

## Chains

| Alias | Full Name | Chain ID |
|-------|-----------|----------|
| `hyperevm` | HyperEVM (Hyperliquid) | 999 |
| `mantle` | Mantle | 5000 |

## Protocol Slugs

### HyperEVM Lending
| Slug | Protocol | Interface |
|------|----------|-----------|
| `hyperlend` | HyperLend | aave_v3 |
| `hypurrfi` | HypurrFi | aave_v3 |
| `felix-morpho` | Felix Morpho | morpho_blue |

### HyperEVM DEX
| Slug | Protocol | Interface |
|------|----------|-----------|
| `kittenswap` | KittenSwap | algebra_v3 |
| `nest-v1` | NEST V1 | algebra_v3 |
| `ramses-cl` | Ramses CL | uniswap_v3 |
| `ramses-hl` | Ramses HL | solidly_v2 |
| `hybra` | Hybra | solidly_v2 |
| `project-x` | Project X | uniswap_v2 |

### HyperEVM Vaults / CDP
| Slug | Protocol | Interface |
|------|----------|-----------|
| `felix` | Felix CDP | liquity_v2 |
| `felix-vaults` | Felix Vaults | erc4626 |
| `hyperbeat` | Hyperbeat | erc4626 |
| `looping` | Looping | erc4626 |
| `upshift` | Upshift | erc4626 |
| `lazy-summer` | Lazy Summer | erc4626 |

### Mantle Protocols
| Slug | Protocol | Interface |
|------|----------|-----------|
| `aave-v3-mantle` | Aave V3 Mantle | aave_v3 |
| `lendle-mantle` | Lendle | aave_v3 |
| `uniswap-v3-mantle` | Uniswap V3 | uniswap_v3 |
| `merchantmoe-mantle` | Merchant Moe | uniswap_v2 + lb |

## Core Workflow: Lending

```
1. defi --json yield --asset USDC                                              # compare APYs (all chains)
2. defi --json --chain hyperevm lending position --protocol hyperlend           # check position
3. defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000  # dry-run
4. [show result to user, get confirmation]
5. defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000 --broadcast
6. defi --json --chain hyperevm lending position --protocol hyperlend           # verify
```

## Core Workflow: Swap (DEX Aggregator)

Aggregates KyberSwap, OpenOcean, LiquidSwap for best price automatically.

```
1. defi --json --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000   # dry-run
2. [confirm with user]
3. defi --json --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000 --broadcast
```

## Core Workflow: LP Autopilot

```
1. defi --json --chain hyperevm lp discover                                    # find pools with APR/TVL
2. [user reviews, edits ~/.defi/pools.toml with chosen pools]
3. defi --json --chain hyperevm lp autopilot --budget 1000000000               # dry-run allocation
4. [confirm with user]
5. defi --json --chain hyperevm lp autopilot --budget 1000000000 --broadcast   # execute
```

## Core Workflow: Yield Comparison

```
1. defi --json yield                                                  # all chains USDC rates
2. defi --json --chain mantle yield --asset USDC                     # Mantle only
```

## Error Handling

| Error | Action |
|-------|--------|
| `Chain not found: X` | use `hyperevm` or `mantle` |
| `Protocol not found: X` | run `defi --json status` to list valid slugs |
| `No route found` | swap aggregator has no route — try smaller amount or different pair |
| `No prices fetched` | asset not listed in registry — use token address directly |
| `Multicall failed` | RPC issue — retry or check `status` |
| `DEFI_WALLET_ADDRESS not set` | set env var or pass `--address` |

## Examples

**"What are the best USDC lending rates?"**
```bash
defi --json yield --asset USDC
```

**"Supply 1000 USDC to HyperLend"**
```bash
defi --json yield --asset USDC
defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000
# after user confirms:
defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000 --broadcast
```

**"Swap 1 WHYPE to USDC"**
```bash
defi --json --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000
defi --json --chain hyperevm swap --from WHYPE --to USDC --amount 1000000000000000000 --broadcast
```

**"Find Mantle LP pools with rewards"**
```bash
defi --json --chain mantle lp discover
```

**"Bridge 100 USDC from HyperEVM to Mantle"**
```bash
defi --json --chain hyperevm bridge --token USDC --amount 100000000 --to-chain mantle
```

**"Check my portfolio on HyperEVM"**
```bash
defi --json --chain hyperevm portfolio show --address 0xYourAddress
```

**"Claim LP rewards from KittenSwap"**
```bash
defi --json --chain hyperevm lp claim --protocol kittenswap --pool 0xYourPool --broadcast
```
