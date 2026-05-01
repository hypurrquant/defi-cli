---
name: defi-cli
description: "Multi-chain DeFi operations CLI for HyperEVM, Mantle, Base, BNB, Monad. Use when user asks to: supply/withdraw from lending, swap tokens via aggregator, add/remove/claim LP, bridge assets, manage LP autopilot, claim emission rewards, compound positions, compare APYs, check prices, track portfolio, or mentions defi-cli, HyperEVM, Mantle, Base, Aerodrome, Merchant Moe, KittenSwap, Ramses, Uniswap, Aave, Compound, Morpho, KyberSwap, OpenOcean, LiquidSwap, LI.FI, Relay."
allowed-tools: "Bash(defi:*), Bash(npx defi-cli:*), Bash(npx -y defi-cli:*)"
license: MIT
metadata:
  author: hypurrquant
  version: "1.0.0"
---

# defi-cli Agent Guide

Multi-chain DeFi CLI — lending, DEX swaps, LP management, bridging, yield comparison.

**5 chains · 39 protocols · 5 DEX aggregators**

## Rules

1. **Always use `--json`** on every command.
2. **Always use `--dry-run`** (default) before any mutating transaction. Only add `--broadcast` after user confirms.
3. **Always use `--chain`** for transaction commands. Query commands (`yield scan`, `status`) scan all chains by default.
4. **NEVER broadcast without user confirmation.**
5. **NEVER read private key files or `~/.` config files.**
6. **Amounts are in wei** (18 decimals for native/WETH, 6 for USDC/USDT). Use `BigInt(humanAmount * 10**decimals)` to convert.

## Install

```bash
defi --version 2>/dev/null            # check if installed
npm install -g @hypurrquant/defi-cli@latest
# or
npx -y @hypurrquant/defi-cli@latest --json status
```

Use `defi` if global install works, otherwise `npx -y -p @hypurrquant/defi-cli@latest defi` as prefix.

## Global Flags

`--json` (required) | `--chain <chain>` (hyperevm, mantle, base, bnb, monad) | `--dry-run` (default, safe) | `--broadcast` (executes tx) | `--fields <f1,f2>` | `--ndjson`

**Wallet**: set `DEFI_WALLET_ADDRESS` env for read queries. Set `DEFI_PRIVATE_KEY` for tx signing. Or use `DEFI_WALLET_ADDRESS=ows:<name>` after `defi ows create <name>` for encrypted vault.

## Environment

```bash
export DEFI_WALLET_ADDRESS=0xYourAddress
export DEFI_PRIVATE_KEY=0xYourPrivateKey   # only needed for broadcasting
```

## Chains

| Alias | Chain | Chain ID | Status |
|-------|-------|----------|--------|
| `hyperevm` | HyperEVM | 999 | 🟢 production |
| `mantle` | Mantle | 5000 | 🟢 production |
| `base` | Base | 8453 | 🟢 production |
| `bnb` | BNB Chain | 56 | 🟡 staged |
| `monad` | Monad | 143 | 🟡 staged |

🟢 = mainnet broadcast verified | 🟡 = configs verified, awaiting funded broadcast

## Protocol Slugs by Chain

For full protocol list see `references/protocols.md`. High-level summary:

### HyperEVM (11)
**Lending**: `hyperlend`, `hypurrfi`, `felix-morpho` · **DEX**: `project-x`, `hyperswap`, `curve-hyperevm`, `ramses-cl`, `ramses-hl`, `kittenswap`, `hybra`, `nest`

### Mantle (3)
**Lending**: `aave-v3-mantle` · **DEX**: `uniswap-v3-mantle`, `merchantmoe-mantle` (LB + MOE emission)

### Base (5)
**Lending**: `aave-v3-base`, `compound-v3-base` · **DEX**: `uniswap-v3-base`, `aerodrome-base` (V2 + AERO), `aerodrome-cl` (Slipstream + AERO)

### BNB (16)
**Lending**: `aave-v3-bnb`, `kinza-bnb`, `venus-bnb`, `venus-flux-bnb` · **DEX**: `pancakeswap-v3-bnb` (+ MasterChef CAKE), `pancakeswap-v2-bnb`, `uniswap-v3-bnb`, `thena-v1`, `thena-fusion`, `biswap-bnb`, `apeswap-bnb`, `bakeryswap-bnb`, `bscswap-bnb`, `babydogeswap-bnb`, `fstswap-bnb` · **Vault**: `beefy-bnb`

### Monad (4)
`uniswap-v2-monad`, `uniswap-v3-monad`, `traderjoe-monad` (LB), `morpho-blue-monad`

## DEX Aggregator Providers

| Provider | Supported chains | Notes |
|----------|------------------|-------|
| KyberSwap | hyperevm, base, bnb | Default for HyperEVM |
| OpenOcean | hyperevm, mantle, base, bnb | Universal fallback |
| LiquidSwap | hyperevm | HyperEVM-native (LiquidLaunch) |
| LI.FI | all source chains via chainId | Cross-chain swaps too |
| Relay | all source chains via chainId | Multi-step routes (auto skip approve step) |

## Core Workflow: Lending

```
1. defi --json yield scan --asset USDC                                          # compare APYs across all chains
2. defi --json --chain hyperevm lending position --protocol hyperlend           # check position
3. defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000   # dry-run
4. [show result to user, get confirmation]
5. defi --json --chain hyperevm lending supply --protocol hyperlend --asset USDC --amount 1000000000 --broadcast
6. defi --json --chain hyperevm lending position --protocol hyperlend           # verify
```

## Core Workflow: DEX Aggregator Swap

```
1. defi --json --chain mantle swap --provider lifi --from MOE --to WMNT --amount <wei>   # dry-run via LI.FI
2. [confirm with user]
3. defi --json --chain mantle swap --provider lifi --from MOE --to WMNT --amount <wei> --broadcast
```

## Core Workflow: LP with Emission Claim (Merchant Moe LB)

```
1. defi --json --chain mantle lp discover --protocol merchantmoe-mantle --emission-only   # active emission pools sorted by APR
2. defi --json --chain mantle lp add --protocol merchantmoe-mantle --token-a WMNT --token-b USDT0 \
     --amount-a <wei> --amount-b <wei> --pool 0x... --num-bins 3 --broadcast
3. defi --json --chain mantle lp positions --protocol merchantmoe-mantle           # see active positions + pending MOE
4. defi --json --chain mantle lp claim --protocol merchantmoe-mantle --pool 0x... --broadcast   # auto-detects user's actual bins
5. defi --json --chain mantle lp remove --protocol merchantmoe-mantle --token-a WMNT --token-b USDT0 \
     --pool 0x... --bins <bin1>,<bin2> --broadcast
```

## Core Workflow: LP with NFT Gauge (Aerodrome Slipstream / Hybra V4)

```
1. defi --json --chain base lp farm --protocol aerodrome-cl --token-a WETH --token-b USDC \
     --amount-a <wei> --amount-b <wei> --range 5 --pool 0x... --broadcast      # mint + auto-stake
2. defi --json --chain base lp claim --protocol aerodrome-cl --gauge 0x... --token-id <id> --broadcast   # claim AERO
3. defi --json --chain base lp remove --protocol aerodrome-cl --token-a WETH --token-b USDC \
     --liquidity <amount> --token-id <id> --gauge 0x... --broadcast       # auto-unstake + remove
```

## Core Workflow: V3 Fee Auto-Compound

```
1. defi --json --chain base lp compound --protocol uniswap-v3-base --token-id <id> --slippage 50  # static-call detects fees
2. [if fees > 0, confirm and re-run with --broadcast]
3. defi --json --chain base lp compound --protocol uniswap-v3-base --token-id <id> --broadcast
```

## Core Workflow: Cross-chain Bridge

Bridge **source** must be a supported chain (hyperevm/mantle/base/bnb/monad). Bridge **destination** can be any chain LI.FI/deBridge route to, or any CCTP V2 chain (ethereum, arbitrum, optimism, polygon, avalanche, base).

```
1. defi --json --chain base bridge --token USDC --amount 100000000 --to-chain arbitrum --provider lifi   # dry-run
2. [confirm cost + ETA]
3. defi --json --chain base bridge --token USDC --amount 100000000 --to-chain arbitrum --provider lifi --broadcast
```

## Core Workflow: Yield Comparison

```
1. defi --json yield scan --asset USDC                                  # all chains, all protocols
2. defi --json --chain mantle yield compare --asset USDT                # one chain only
3. defi --json yield optimize --asset USDC --amount 100000000           # auto-strategy with diversification
```

## Error Handling

| Error | Action |
|-------|--------|
| `Chain not found: X` | use one of: hyperevm, mantle, base, bnb, monad |
| `Protocol not found: X` | run `defi --json status` to list valid slugs for the chain |
| `KyberSwap: unsupported chain` | use openocean, lifi, or relay |
| `AMOUNT_TOO_LOW` (Relay) | increase amount or switch provider |
| `No fees to compound` | V3 position has no accumulated fees yet — wait for swaps to cross range |
| `No pools found` | protocol may be inactive on this chain or discover branch missing config |
| `DEFI_WALLET_ADDRESS not set` | set env var or pass `--address` |

## Examples

**"What are the best USDC lending rates across all chains?"**
```bash
defi --json yield scan --asset USDC
```

**"Add LP to WMNT/USDT0 on Mantle and earn MOE"**
```bash
defi --json --chain mantle lp add --protocol merchantmoe-mantle --token-a WMNT --token-b USDT0 \
  --amount-a 1000000000000000000 --amount-b 600000 --pool 0x03BeafC0d25BB553fCa274301832419C05269987 --num-bins 3 --broadcast
```

**"Show all my LP positions and pending rewards on Mantle"**
```bash
defi --json --chain mantle lp positions --protocol merchantmoe-mantle
```

**"Claim AERO from my Aerodrome Slipstream NFT"**
```bash
defi --json --chain base lp claim --protocol aerodrome-cl --gauge 0xF33a96b5932D9E9B9A0eDA447AbD8C9d48d2e0c8 --token-id <id> --broadcast
```

**"Swap 1 ETH to USDC on Base via best route"**
```bash
defi --json --chain base swap --provider kyber --from WETH --to USDC --amount 1000000000000000000
```

**"Bridge 100 USDC from Base to Arbitrum via CCTP"**
```bash
defi --json --chain base bridge --token USDC --amount 100000000 --to-chain arbitrum --provider cctp --broadcast
```

**"Check my portfolio on Base"**
```bash
defi --json --chain base portfolio show --address 0xYourAddress
```

**"Find all Aerodrome Slipstream emission pools sorted by APR"**
```bash
defi --json --chain base lp discover --protocol aerodrome-cl --emission-only
```
