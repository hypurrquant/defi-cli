# defi-cli Command Reference

All commands support `--json` for structured output. Always use `--json` when calling from an agent.
All amounts are in **wei** unless noted. USDC/USDT/USDT0 use 6 decimals; native tokens, WETH/WMNT/WBNB/WMON/WHYPE/AERO/MOE use 18; WBTC uses 8.

`--chain <chain>` selects the network: `hyperevm`, `mantle`, `base`, `bnb`, `monad`. Query commands (`yield scan`, `status`) scan all chains by default; transaction commands require an explicit `--chain`.

## Status & Discovery (read-only, safe)

```bash
defi --json status                                  # current chain protocols
defi --json --chain mantle status                   # Mantle protocols + addresses
defi --json schema                                  # full CLI schema as JSON
defi --json schema lending.supply                   # one action's params + cli example
defi --json schema lending-supply                   # hyphenated form also works (post-v1.0.11)
```

## Yield (read-only, safe)

```bash
defi --json yield scan --asset USDC                 # all chains, all lending protocols, ranked by supply APY
defi --json --chain mantle yield compare --asset USDT
defi --json yield optimize --asset USDC --amount 100000000   # diversification plan
```

**Failure shape (post-v1.0.11)**: when every RPC probe fails, the command no longer pretends "no opportunities found" — it returns:
```json
{ "error": "...", "failed_probes": [{ "protocol": "aave-v3-mantle", "type": "lending", "reason": "..." }], "hint": "Set MANTLE_RPC_URL=..." }
```

## Price (read-only, safe)

```bash
defi --json --chain hyperevm price --asset WHYPE          # oracle + DEX
defi --json --chain hyperevm price --asset USDC --source oracle
defi --json --chain mantle price --asset WMNT --source dex
```

## Lending

```bash
# Read-only
defi --json --chain <chain> lending rates --protocol <slug> --asset <token>
defi --json --chain <chain> lending position --protocol <slug>

# Mutating (dry-run by default — add --broadcast to execute)
defi --json --chain <chain> lending supply  --protocol <slug> --asset <token> --amount <wei>
defi --json --chain <chain> lending withdraw --protocol <slug> --asset <token> --amount <wei>
defi --json --chain <chain> lending borrow   --protocol <slug> --asset <token> --amount <wei>
defi --json --chain <chain> lending repay    --protocol <slug> --asset <token> --amount <wei>
```

Auto-approve: if token allowance is insufficient, the CLI checks, approves, then supplies — all in one `--broadcast` call.

## Swap (DEX aggregator — 5 providers)

```bash
defi --json --chain <chain> swap --provider <p> --from <token> --to <token> --amount <wei> [--slippage <bps>]
```

Providers: `kyber` (KyberSwap), `openocean`, `liquid` (LiquidSwap, HyperEVM-only), `lifi` (LI.FI, all chains + cross-chain), `relay` (multi-step routes, auto-skips approve step).

```bash
defi --json --chain hyperevm swap --provider kyber    --from WHYPE --to USDC --amount 1000000000000000000
defi --json --chain mantle   swap --provider lifi     --from MOE   --to WMNT --amount 1000000000000000000
defi --json --chain base     swap --provider openocean --from WETH --to USDC --amount 100000000000000000
```

## LP Operations

### Discover Pools

```bash
defi --json --chain <chain> lp discover                            # all fee + emission pools
defi --json --chain hyperevm lp discover --protocol kittenswap     # filter by protocol
defi --json --chain mantle  lp discover --protocol merchantmoe-mantle --emission-only
defi --json --chain base    lp discover --protocol aerodrome-cl --emission-only   # APR-sorted
```

### Add Liquidity

```bash
defi --json --chain <chain> lp add --protocol <slug> \
  --token-a <token> --token-b <token> --amount-a <wei> --amount-b <wei> \
  --pool <address>                                  # required for LB / specific pool
  [--num-bins 3]                                    # Liquidity Book (Merchant Moe / TraderJoe)
  [--range 5]                                       # ±N% concentrated range (V3 / Slipstream)
  [--tick-lower N --tick-upper N]                   # explicit ticks
```

### Farm (Add + Auto-stake)

```bash
defi --json --chain <chain> lp farm --protocol <slug> \
  --token-a <token> --token-b <token> --amount-a <wei> --amount-b <wei> \
  --pool <address> [--gauge <addr>] [--range 5]
```

Two-step flow: mint LP → deposit into gauge (Solidly/Hybra), enterFarming (KittenSwap/Algebra eternal), or no-op (Merchant Moe LB hooks).

### Claim Rewards

```bash
# V3 fee collect
defi --json --chain <chain> lp claim --protocol <slug> --token-id <id>

# Solidly / Aerodrome V2 / Ramses HL gauge (account-based)
defi --json --chain <chain> lp claim --protocol <slug> --gauge <addr>

# Aerodrome Slipstream / Hybra V4 / Ramses CL (NFT gauge)
defi --json --chain <chain> lp claim --protocol <slug> --gauge <addr> --token-id <id>
defi --json --chain hyperevm lp claim --protocol hybra --gauge <addr> --token-id <id> --redeem-type 0   # instant exit (penalty)

# KittenSwap eternal farming
defi --json --chain hyperevm lp claim --protocol kittenswap --pool <addr> --token-id <id>

# Merchant Moe LB (auto-detects user's actual bins)
defi --json --chain mantle lp claim --protocol merchantmoe-mantle --pool <addr>

# Off-chain Nest ticket
defi --json --chain hyperevm lp claim --protocol nest --address <wallet>
```

### Compound (V3 fee auto-compound)

```bash
defi --json --chain <chain> lp compound --protocol <slug> --token-id <id> [--slippage 50]
```

Collects accrued fees and re-adds them as liquidity in one tx. V3 fee-only protocols (Uniswap V3, HyperSwap, Project X).

### Remove Liquidity

```bash
# V3 / Slipstream / Algebra / Hybra (NFT-based) — only --token-id required
# Liquidity is read live from NPM.positions(tokenId); --liquidity overrides if passed
defi --json --chain <chain> lp remove --protocol <slug> --token-id <id> [--gauge <addr>]

# Solidly V2 (LP-token-based)
defi --json --chain <chain> lp remove --protocol <slug> \
  --token-a <token> --token-b <token> --liquidity <wei> --gauge <addr>

# Liquidity Book (Merchant Moe / TraderJoe) — pair flags + bins required
defi --json --chain <chain> lp remove --protocol <slug> \
  --token-a <token> --token-b <token> --pool <addr> --bins <bin1>,<bin2>,...
```

If a V3/CL `--token-id` resolves to zero on-chain liquidity, the command surfaces `tokenId X has zero liquidity (already removed?)` instead of producing a no-op `decreaseLiquidity(0) + collect`.

### LP Positions

```bash
defi --json --chain <chain> lp positions                          # scan all protocols
defi --json --chain <chain> lp positions --protocol <slug>
defi --json --chain mantle lp positions --protocol merchantmoe-mantle --pool <addr>
```

Auto-detects Merchant Moe LB user bins via on-chain balance scan, plus pending MOE rewards. Walks NPM tokenIds for V3/Algebra/Hybra positions.

### LP Autopilot

Reads `~/.defi/pools.toml` for whitelisted pools and allocates budget automatically.

```bash
defi --json --chain <chain> lp autopilot --budget 1000   # USD; dry-run (default)
defi --json --chain <chain> lp autopilot --budget 1000 --broadcast
```

**pools.toml format:**
```toml
[[pools]]
protocol = "kittenswap"
pool_address = "0x..."
weight = 50
chain = "hyperevm"

[[pools]]
protocol = "aerodrome-cl"
pool_address = "0x..."
weight = 50
chain = "base"
```

## Portfolio

```bash
defi --json --chain <chain> portfolio show [--address <addr>]
defi --json --chain <chain> portfolio snapshot [--address <addr>]
defi --json --chain <chain> portfolio pnl [--address <addr>]
```

**Pricing (post-v1.0.11)**: each ERC20 is priced via its own oracle (no longer the native asset's price). Native gas-token balance is fetched via `eth_getBalance` and included as `native_balance` / `native_value_usd` in the total. Tokens whose oracle returns 0 are omitted from the total instead of being mispriced. `snapshot` matches `show` to the cent.

## Token

```bash
# Read-only
defi --json --chain <chain> token balance   --token <token> [--owner <addr>]
defi --json --chain <chain> token allowance --token <token> --spender <addr> [--owner <addr>]

# Mutating
defi --json --chain <chain> token approve   --token <token> --spender <addr> [--amount max|<wei>]
defi --json --chain <chain> token transfer  --token <token> --to <addr> --amount <wei>
```

## Wallet

```bash
defi --json wallet address                                       # { "address": "0x…", "source": "ows|private_key|env|none" }
defi --json --chain <chain> wallet balance [--address <addr>]    # native balance via eth_getBalance
```

`wallet address` returns `{ "address": null, "source": "none" }` when no wallet is configured (the legacy `"(not set)"` string sentinel is gone). Resolution precedence: `--address` flag → OWS vault (`DEFI_WALLET_ADDRESS=ows:<name>`) → `DEFI_PRIVATE_KEY` derived → plain `DEFI_WALLET_ADDRESS`.

### Wallet placeholder warning

For dry-run paths (`swap`, `bridge`, `lending supply`, etc.), if no wallet is configured the CLI emits a one-shot stderr warning and substitutes the placeholder `0x000…001` so calldata can still be previewed. **Never pass `--broadcast` when the placeholder is in use** — the warning will tell you so explicitly.

## Setup (interactive wizard)

```bash
defi setup                                          # prompts for chain RPCs + wallet
```

Stored in `~/.defi/config.toml`. The wizard:
- Suppresses keypress echo when prompting for a private key.
- Accepts only `http://` and `https://` RPC URLs (rejects `ws://`, `wss://`, plain hosts).
- Masks the URL path when displaying current configuration (`https://eth.example.com/***`) so embedded API keys do not leak in transcripts.

## Bridge (cross-chain)

Source chain (`--chain`) must be a supported chain: `hyperevm`, `mantle`, `base`, `bnb`, `monad`. Destination (`--to-chain`) can be any chain LI.FI/deBridge route to, plus all CCTP V2 chains.

```bash
# LI.FI (default, broadest coverage)
defi --json --chain base bridge --token USDC --amount 100000000 --to-chain ethereum --provider lifi

# deBridge DLN
defi --json --chain base bridge --token USDC --amount 100000000 --to-chain arbitrum --provider debridge

# Circle CCTP V2 destinations: ethereum, avalanche, optimism, arbitrum, base, polygon
defi --json --chain base bridge --token USDC --amount 100000000 --to-chain arbitrum --provider cctp
```

**CCTP min-fee guard (post-v1.0.7)**: when the burn amount cannot cover the protocol fee, the command short-circuits with a structured envelope (no broadcast attempt):
```json
{ "error": "amount_below_min_fee", "minimum_amount_wei": "...", "minimum_amount_usdc": "..." }
```
