# defi-cli Command Reference

All commands support `--json` for structured output. Always use `--json` when calling from an agent.
All amounts are in **wei** unless noted. USDC/USDT use 6 decimals; native tokens and most ERC-20s use 18.

## Dashboard (read-only, safe)

```bash
defi --json                                         # multicall balance dashboard
defi --json --chain mantle                          # Mantle dashboard
```

## Status & Discovery (read-only, safe)

```bash
defi --json status                                  # list all protocols for current chain
defi --json --chain mantle status                   # list Mantle protocols
defi --json schema                                  # full CLI schema as JSON
```

## Yield (read-only, safe)

```bash
defi --json yield                                   # lending APY comparison (default: USDC, HyperEVM)
defi --json yield --asset USDT                      # compare for a different asset
defi --json --chain mantle yield --asset USDC        # Mantle lending rates
```

## Price (read-only, safe)

```bash
defi --json price --asset WHYPE                     # oracle + DEX prices for an asset
defi --json price --asset USDC --source oracle      # oracle prices only
defi --json price --asset WHYPE --source dex        # DEX spot prices only
defi --json --chain mantle price --asset WMNT        # price on Mantle
```

## Lending (read-only queries, then mutating)

```bash
# Read-only
defi --json lending rates --protocol <slug> --asset <token>
defi --json lending position --protocol <slug>

# Mutating (dry-run first, then --broadcast)
defi --json lending supply --protocol <slug> --asset <token> --amount <wei>
defi --json lending supply --protocol <slug> --asset <token> --amount <wei> --on-behalf-of <addr>
defi --json lending withdraw --protocol <slug> --asset <token> --amount <wei> [--to <addr>]
```

Auto-approve: if token allowance is insufficient, the CLI checks, approves the exact amount, then supplies — all in one `--broadcast` call.

## Swap (DEX aggregator — KyberSwap, OpenOcean, LiquidSwap)

```bash
defi --json swap --token-in <token> --token-out <token> --amount <wei> [--slippage <bps>]
defi --json swap --token-in WHYPE --token-out USDC --amount 1000000000000000000 --slippage 50
```

Note: `swap` aggregates multiple DEX APIs for best route. Use `--broadcast` to execute.

## LP Operations

### Discover Pools

```bash
defi --json lp discover                             # all 134 emission pools
defi --json lp discover --protocol kittenswap       # filter by protocol
defi --json lp discover --min-apr 10                # filter by minimum APR
```

### Add Liquidity

```bash
defi --json lp add --protocol <slug> --pool-address <addr> --amount-a <wei> --amount-b <wei>
```

### Farm (Add + Auto-stake)

```bash
# Add liquidity and stake into gauge/farming for emissions
defi --json lp farm --protocol <slug> --pool-address <addr> --amount-a <wei> --amount-b <wei>
```

### Claim Rewards

```bash
defi --json lp claim --protocol <slug> --pool-address <addr>
```

### Remove Liquidity

```bash
# Auto-unstake (if staked) then remove liquidity
defi --json lp remove --protocol <slug> --pool-address <addr>
```

### LP Positions

```bash
defi --json lp positions                            # all LP positions across protocols
```

### LP Autopilot

Reads `~/.defi/pools.toml` for whitelisted pools and allocates budget automatically.

```bash
defi --json lp autopilot --budget <wei>             # dry-run (default)
defi --json lp autopilot --budget 1000000000 --broadcast  # execute
```

**pools.toml format:**
```toml
[[pools]]
protocol = "kittenswap"
pool_address = "0x..."
weight = 50

[[pools]]
protocol = "nest-v1"
pool_address = "0x..."
weight = 50
```

## Portfolio

```bash
defi --json portfolio                               # aggregate positions across all protocols
```

## Token

```bash
# Read-only
defi --json token balance --token <token> [--owner <addr>]
defi --json token allowance --token <token> --spender <addr> [--owner <addr>]

# Mutating
defi --json token approve --token <token> --spender <addr> [--amount max|<wei>]
defi --json token transfer --token <token> --to <addr> --amount <wei>
```

## Wallet

```bash
defi --json wallet address                          # show configured wallet address
defi --json wallet balance [--address <addr>]       # native token balance
```

## Bridge (cross-chain)

```bash
# LI.FI (default, supports most token/chain combos)
defi --json bridge --token USDC --amount 100000000 --to-chain mantle

# deBridge DLN
defi --json bridge --token USDC --amount 100000000 --to-chain arbitrum --provider debridge

# Circle CCTP V2 (native USDC only: ethereum, avalanche, optimism, arbitrum, base, polygon)
defi --json bridge --token USDC --amount 100000000 --to-chain arbitrum --provider cctp
```
