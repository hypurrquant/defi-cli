# defi-cli Command Reference

All commands support `--json` for structured output. Always use `--json` when calling from an agent.
All amounts are in **wei** unless noted. USDC/USDT use 6 decimals; native tokens and most ERC-20s use 18.

## Status & Discovery (read-only, safe)

```bash
defi --json status                                  # list all protocols for current chain
defi --json --chain mantle status                   # list Mantle protocols
defi --json status --verify                         # verify contract addresses on-chain
defi --json schema                                  # full CLI schema as JSON
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
defi --json lending position --protocol <slug> --address <wallet>

# Mutating (dry-run first, then --broadcast)
defi --json --dry-run lending supply --protocol <slug> --asset <token> --amount <wei>
defi --json --dry-run lending supply --protocol <slug> --asset <token> --amount <wei> --on-behalf-of <addr>
defi --json --dry-run lending borrow --protocol <slug> --asset <token> --amount <wei> [--rate-mode variable|stable]
defi --json --dry-run lending repay --protocol <slug> --asset <token> --amount <wei> [--rate-mode variable|stable]
defi --json --dry-run lending withdraw --protocol <slug> --asset <token> --amount <wei> [--to <addr>]
```

## DEX (read-only quotes, then mutating swaps)

```bash
# Read-only
defi --json dex quote --protocol <slug> --token-in <token> --token-out <token> --amount <wei>
defi --json dex compare --token-in <token> --token-out <token> --amount <wei>  # best price across all DEXes

# Mutating
defi --json --dry-run dex swap --protocol <slug> --token-in <token> --token-out <token> --amount <wei> [--slippage <bps>]
defi --json --dry-run dex lp-add --protocol <slug> --token-a <token> --token-b <token> --amount-a <wei> --amount-b <wei>
defi --json --dry-run dex lp-remove --protocol <slug> --token-a <token> --token-b <token> --liquidity <wei>
```

## Swap (ODOS aggregator — best price across all DEXes)

```bash
defi --json --dry-run swap --token-in <token> --token-out <token> --amount <wei> [--slippage <bps>]
defi --json --dry-run swap --token-in WHYPE --token-out USDC --amount 1000000000000000000 --slippage 50
```

Note: `swap` uses ODOS for optimal routing. `dex swap` targets a specific protocol directly.

## Vault (ERC-4626)

```bash
# Read-only
defi --json vault info --protocol <slug>            # TVL, APY, shares

# Mutating
defi --json --dry-run vault deposit --protocol <slug> --amount <wei> [--receiver <addr>]
defi --json --dry-run vault withdraw --protocol <slug> --amount <wei> [--receiver <addr>] [--owner <addr>]
```

## Staking (Liquid Staking)

```bash
# Read-only
defi --json staking info --protocol <slug>          # staking rate, TVL

# Mutating
defi --json --dry-run staking stake --protocol <slug> --amount <wei> [--recipient <addr>]
defi --json --dry-run staking unstake --protocol <slug> --amount <wei> [--recipient <addr>]
```

## CDP (Collateralized Debt Position — Felix)

```bash
# Read-only
defi --json cdp info --protocol felix               # protocol overview
defi --json cdp info --protocol felix --position <id>  # specific CDP

# Mutating
defi --json --dry-run cdp open --protocol felix --collateral <token> --amount <wei> --mint <wei>
defi --json --dry-run cdp adjust --protocol felix --position <id> [--add-collateral <wei>] [--withdraw-collateral <wei>] [--mint <wei>] [--repay <wei>]
defi --json --dry-run cdp close --protocol felix --position <id>
```

## Gauge (ve(3,3) — Ramses)

```bash
# Mutating
defi --json --dry-run gauge deposit --protocol ramses-hl --gauge <addr> --amount <wei> [--ve-nft <tokenId>]
defi --json --dry-run gauge withdraw --protocol ramses-hl --gauge <addr> --amount <wei>
defi --json --dry-run gauge claim --protocol ramses-hl --gauge <addr>
defi --json --dry-run gauge lock --protocol ramses-hl --amount <wei> [--days 365]
defi --json --dry-run gauge vote --protocol ramses-hl --ve-nft <tokenId> --pools <addr1,addr2> --weights <w1,w2>
```

## Farm (MasterChef LP Farms)

```bash
# Read-only
defi --json farm info --protocol <slug> [--pid <poolId>] --address <wallet>

# Mutating
defi --json --dry-run farm deposit --protocol <slug> --pid <poolId> --amount <wei>
defi --json --dry-run farm withdraw --protocol <slug> --pid <poolId> --amount <wei>
defi --json --dry-run farm claim --protocol <slug> --pid <poolId>
```

## Yield (cross-chain scan + optimize)

```bash
# Read-only
defi --json yield compare --asset <token>                            # rates for current chain
defi --json yield scan --asset <token>                               # scan all chains
defi --json yield optimize --asset <token> [--strategy auto|best-supply|leverage-loop] [--amount <human>]

# Execute (dry-run first)
defi --json --dry-run yield execute --asset <token> --amount <human> [--target-chain <chain>] [--target-protocol <slug>]
```

Note: `--amount` for `yield execute` is in **human-readable units** (e.g. `1000` for 1000 USDC), not wei.

## Compare (cross-product yield scanner)

```bash
defi --json compare                                  # perp funding + lending APY for USDC
defi --json compare --asset ETH                      # all yield sources for ETH
defi --json compare --no-perps                       # lending only
defi --json compare --min-apy 5.0                    # filter by minimum APY
```

Note: `compare` integrates with perp-cli if installed for funding rate data.

## Scan (exploit / anomaly detection)

```bash
defi --json scan --once                              # single scan, then exit
defi --json scan                                     # continuous (polls every 30s)
defi --json scan --once --patterns oracle,stable     # specific patterns only
defi --json scan --once --all-chains                 # all chains in parallel
defi --json scan --oracle-threshold 10 --once        # custom divergence threshold
```

Patterns: `oracle` (oracle vs DEX price divergence), `stable` (stablecoin depeg), `exchange_rate` (Compound V2 fork donation attacks)

## Arb (cross-DEX arbitrage detection)

```bash
defi --json arb                                      # scan WHYPE/USDC across all DEXes
defi --json arb --token-in WHYPE --token-out USDC --amount 1000000000000000000
defi --json arb --execute --min-profit 20            # auto-execute if >20bps profit
```

## Portfolio

```bash
# Read-only
defi --json portfolio show --address <wallet>        # all balances + lending positions
defi --json portfolio snapshot --address <wallet>    # take + save snapshot
defi --json portfolio pnl --address <wallet>         # PnL since last snapshot
defi --json portfolio pnl --address <wallet> --since 24  # vs snapshot 24h ago
defi --json portfolio history --address <wallet>     # list saved snapshots
```

## Token

```bash
# Read-only
defi --json token balance --token <token> --owner <addr>
defi --json token allowance --token <token> --owner <addr> --spender <addr>

# Mutating
defi --json --dry-run token approve --token <token> --spender <addr> [--amount max|<wei>]
defi --json --dry-run token transfer --token <token> --to <addr> --amount <wei>
```

## Wallet

```bash
defi --json wallet balance --address <addr>          # native token balance
defi --json wallet address                           # show DEFI_WALLET_ADDRESS env
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

## Monitor / Alert

```bash
defi --json monitor --address <wallet>               # monitor wallet activity
defi --json alert --protocol <slug>                  # set protocol alerts
```

## Positions

```bash
defi --json positions --address <wallet>             # all open DeFi positions
```

## Whales

```bash
defi --json whales                                   # track large wallet movements
```

## NFT

```bash
defi --json nft                                      # NFT operations (Seaport)
```
