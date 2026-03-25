---
name: defi-cli
description: "Multi-chain DeFi operations CLI for HyperEVM (Hyperliquid) and Mantle. Use when user asks to: supply/borrow/repay/withdraw from lending, swap tokens, add/remove LP, bridge assets, manage vaults, stake HYPE, scan for exploits, scan yield opportunities, compare APYs, check prices, open CDP positions, farm LP rewards, track portfolio, detect arb, or mentions defi-cli, HyperEVM, Hyperliquid EVM, Mantle, HypurrFi, HyperLend, HyperYield, PurrLend, Felix, Kinetiq, stHYPE, HyperSwap, KittenSwap, NestSwap, Upshift, Hyperbeat."
allowed-tools: "Bash(defi:*), Bash(npx defi-cli:*), Bash(npx -y defi-cli:*)"
license: MIT
metadata:
  author: hypurrquant
  version: "0.2.0"
---

# defi-cli Agent Guide

Multi-chain DeFi CLI — lending, DEX swaps, LP management, bridging, vaults, staking, yield scanning, exploit detection — all from your terminal.

2 chains: **HyperEVM** (Hyperliquid EVM, chain ID 999) and **Mantle** (chain ID 5000).
32 protocols across lending, DEX, vault, staking, CDP, gauge, farm, NFT.

## Rules

1. **Always use `--json`** on every command.
2. **Always use `--dry-run`** (default) before any mutating transaction. Only add `--broadcast` after user confirms.
3. **Always use `--chain`** to specify the target chain when not defaulting to HyperEVM.
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

`--json` (required) | `--chain <chain>` (hyperevm or mantle) | `--dry-run` (default, safe) | `--broadcast` (executes tx) | `--fields <f1,f2>` | `--ndjson`

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
| `hyperyield-hyperevm` | HyperYield | aave_v3 |
| `hypurrfi` | HypurrFi | aave_v3 |
| `purrlend-hyperevm` | PurrLend | aave_v3 |
| `primefi-hyperevm` | PrimeFi | aave_v2 |
| `felix-morpho` | Felix Morpho | morpho_blue |
| `euler-v2` | Euler V2 | euler_v2 |

### HyperEVM DEX
| Slug | Protocol | Interface |
|------|----------|-----------|
| `hyperswap-v3` | HyperSwap V3 | uniswap_v3 |
| `hyperswap-v2` | HyperSwap V2 | uniswap_v2 |
| `kittenswap` | KittenSwap | algebra_v3 |
| `nest-v1` | NestSwap | algebra_v3 |
| `ramses-cl` | Ramses CL | uniswap_v3 |
| `ramses-hl` | Ramses HL | solidly_v2 |
| `balancer-v3` | Balancer V3 | balancer_v3 |
| `curve` | Curve | curve_stableswap |
| `ring-few` | Ring/FEW | uniswap_v2 |
| `woofi` | WooFi | woofi |
| `project-x` | Project X | uniswap_v4 |

### HyperEVM Vaults / Staking / CDP
| Slug | Protocol | Interface |
|------|----------|-----------|
| `felix` | Felix CDP | liquity_v2 |
| `felix-vaults` | Felix Vaults | erc4626 |
| `hyperbeat` | Hyperbeat | erc4626 |
| `upshift` | Upshift | erc4626 |
| `looping-collective` | Looping Collective | erc4626 |
| `lazy-summer` | Lazy Summer | erc4626 |
| `kinetiq` | Kinetiq | kinetiq_staking |
| `sthype` | stHYPE | sthype_staking |

### Mantle Protocols
| Slug | Protocol | Interface |
|------|----------|-----------|
| `aave-v3-mantle` | Aave V3 Mantle | aave_v3 |
| `lendle-mantle` | Lendle | aave_v2 |
| `uniswap-v3-mantle` | Uniswap V3 | uniswap_v3 |
| `merchantmoe-mantle` | MerchantMoe | uniswap_v2 |

## Core Workflow: Lending

```
1. defi --json lending rates --protocol hyperlend --asset USDC      # check rates
2. defi --json portfolio show --address 0xABC...                     # check position
3. defi --json --dry-run lending supply --protocol hyperlend --asset USDC --amount 1000000000 # dry-run
4. [show result to user, get confirmation]
5. defi --json --broadcast lending supply --protocol hyperlend --asset USDC --amount 1000000000
6. defi --json portfolio show --address 0xABC...                     # verify
```

## Core Workflow: Swap

```
1. defi --json dex quote --protocol hyperswap-v3 --token-in WHYPE --token-out USDC --amount 1000000000000000000
2. defi --json dex compare --token-in WHYPE --token-out USDC --amount 1000000000000000000  # find best DEX
3. defi --json --dry-run swap --token-in WHYPE --token-out USDC --amount 1000000000000000000  # ODOS aggregator
4. [confirm with user]
5. defi --json --broadcast swap --token-in WHYPE --token-out USDC --amount 1000000000000000000
```

## Core Workflow: Yield Optimization

```
1. defi --json yield compare --asset USDC                            # current chain rates
2. defi --json yield scan --asset USDC                               # all chains scan
3. defi --json yield optimize --asset USDC --strategy auto           # best allocation
4. defi --json --dry-run yield execute --asset USDC --amount 1000    # auto-selects best protocol
5. [confirm with user]
6. defi --json --broadcast yield execute --asset USDC --amount 1000
```

## Error Handling

Response format: raw JSON object, no envelope wrapper.

| Error | Action |
|-------|--------|
| `Chain not found: X` | use `hyperevm` or `mantle` |
| `Protocol not found: X` | run `defi --json status` to list valid slugs |
| `No ODOS route found` | try `dex swap` with a specific `--protocol` instead |
| `No prices fetched` | asset not listed in registry — use token address directly |
| `Multicall failed` | RPC issue — retry or check `status` |
| `DEFI_WALLET_ADDRESS not set` | set env var or pass `--address` / `--on-behalf-of` |

## Examples

**"What are the best USDC lending rates on HyperEVM?"**
```bash
defi --json yield compare --asset USDC
```

**"Supply 1000 USDC to HyperLend"**
```bash
# Step 1: check rates
defi --json lending rates --protocol hyperlend --asset USDC
# Step 2: dry-run (amounts in wei, USDC=6 decimals → 1000 USDC = 1000000000)
defi --json --dry-run lending supply --protocol hyperlend --asset USDC --amount 1000000000
# Step 3: after user confirms
defi --json --broadcast lending supply --protocol hyperlend --asset USDC --amount 1000000000
```

**"Swap 1 WHYPE to USDC"**
```bash
# Find best route
defi --json dex compare --token-in WHYPE --token-out USDC --amount 1000000000000000000
# Dry-run via ODOS aggregator
defi --json --dry-run swap --token-in WHYPE --token-out USDC --amount 1000000000000000000
# After confirmation
defi --json --broadcast swap --token-in WHYPE --token-out USDC --amount 1000000000000000000
```

**"Scan for DeFi exploits on HyperEVM"**
```bash
defi --json scan --once
```

**"Bridge 100 USDC from HyperEVM to Mantle"**
```bash
defi --json --chain hyperevm bridge --token USDC --amount 100000000 --to-chain mantle --provider lifi
```

**"Check my portfolio on HyperEVM"**
```bash
defi --json portfolio show --address 0xYourAddress
```

**"Stake HYPE via Kinetiq"**
```bash
defi --json staking info --protocol kinetiq
defi --json --dry-run staking stake --protocol kinetiq --amount 1000000000000000000
# after confirmation
defi --json --broadcast staking stake --protocol kinetiq --amount 1000000000000000000
```
