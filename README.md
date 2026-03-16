# DeFi CLI

Rust CLI for interacting with DeFi protocols on HyperEVM. Agent-first design with JSON output, schema introspection, and MCP server.

## Install

```bash
cargo build --release
./target/release/defi --help
```

## Quick Start

```bash
# Check supported protocols
defi status --json

# Get lending rates (live on-chain data)
defi lending rates --protocol hyperlend --asset USDC --json

# Compare yields across protocols
defi yield compare --asset USDC --json

# Query asset prices from oracles
defi price --asset WHYPE --json

# Check health factor / lending position
defi lending position --protocol hyperlend --address 0x... --json

# Felix CDP trove info
defi cdp info --protocol felix --position <trove_id> --json

# Staking info (exchange rate, TVL)
defi staking info --protocol kinetiq --json

# Build a swap transaction (dry-run by default)
defi dex swap --protocol hyperswap-v2 --token-in WHYPE --token-out USDC --amount 1.0 --json

# Actually broadcast (requires DEFI_PRIVATE_KEY)
export DEFI_PRIVATE_KEY=0x...
defi lending supply --protocol hyperlend --asset USDC --amount 100.0 --broadcast --json
```

## Commands

| Command | Description |
|---------|-------------|
| `status` | Chain info and protocol list |
| `schema` | JSON Schema for any action (agent-friendly) |
| `dex` | `swap`, `quote`, `compare` |
| `lending` | `supply`, `borrow`, `repay`, `withdraw`, `rates`, `position` |
| `cdp` | `open`, `adjust`, `close`, `info` |
| `staking` | `stake`, `unstake`, `info` |
| `vault` | `deposit`, `withdraw`, `info` |
| `gauge` | `deposit`, `withdraw`, `claim`, `lock`, `vote` (ve(3,3)) |
| `yield` | `compare`, `optimize` |
| `price` | Oracle and DEX price queries |
| `token` | `balance`, `approve`, `allowance`, `transfer` |
| `wallet` | `balance` |
| `agent` | JSON stdin batch mode for AI agents |

## Supported Protocols (32)

### DEX (15) — all LIVE

| Protocol | Interface | App | Contracts |
|----------|-----------|-----|-----------|
| HyperSwap V3 | uniswap_v3 | — | router: `0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D` |
| HyperSwap V2 | uniswap_v2 | — | router: `0xb4a9C4e6Ea8E2191d2FA5B380452a634Fb21240A` |
| KittenSwap Algebra | algebra_v3 | [kittenswap.finance](https://kittenswap.finance) | router: `0x4e73E421480a7E0C24fB3c11019254edE194f736` |
| NEST V1 | algebra_v3 | [app.nest.exchange](https://app.nest.exchange) | router: `0xaA26B8e5Cadd04430c32787eCC3AA325e99681e9` |
| Project X | uniswap_v3 | — | router: `0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B` |
| Ramses CL | solidly_cl | [app.ramses.exchange](https://app.ramses.exchange) | router: `0x76D91074B46fF76E04FE59a90526a40009943fd2` |
| Ramses HL | solidly_v2 | [app.ramses.exchange](https://app.ramses.exchange) | router: `0xdcC44285fBc236457A5cd91C2f77AD8421B0D8ED` |
| Ring Few | solidly_v2 | — | router: `0x701D1d675415efA2d2429fB122ccC6dD4FCcA959` |
| Curve DEX | curve_stableswap | [curve.fi](https://curve.fi) | factory: `0x5eeE3091f747E60a045a2E715a4c71e600e31F6E` |
| Balancer V3 | balancer_v3 | [balancer.fi](https://balancer.fi) | vault: `0xbA1333333333a1BA1108E8412f11850A5C319bA9` |
| WOOFi Swap | woofi | [fi.woo.org](https://fi.woo.org) | router: `0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7` |
| Valantis STEX | valantis | — | router: `0x5Abe35DDb420703bA6Dd7226ACDCb24be71192e5` |
| Wombat Exchange | wombat | — | router: `0x7Afa6bEecBdfA7b8c9d0E1F2a3B4C5D6E7F8a9b0` |
| Hybra V4 | hybra | — | router: `0xCAfDa2b3E5c2B5E30f6d67FEFa5AfFD3f6a93b0a` |
| Hyperliquid Spot | orderbook_api | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) | — |

### Lending (5)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| HyperLend | aave_v3 | [app.hyperlend.finance](https://app.hyperlend.finance) | pool: `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b` |
| HypurrFi Pooled | aave_v3 | [app.hypurr.fi](https://app.hypurr.fi) | pool: `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b` |
| HypurrFi Isolated | aave_v3 | [app.hypurr.fi/markets/isolated](https://app.hypurr.fi/markets/isolated) | pool: `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b` (Fraxlend fork) |
| Felix Morpho | morpho_blue | [usefelix.xyz/lend](https://www.usefelix.xyz/lend) | morpho: `0x68e37dE8d93d3496ae143F2E900490f6280C57cD` |
| Euler V2 | euler_v2 | [app.euler.finance](https://app.euler.finance) | evc: `0xceAA7cdCD7dDBee8601127a9Abb17A974d613db4`, factory: `0xcF5552580fD364cdBBFcB5Ae345f75674c59273A` |

### Liquid Staking (4) — all LIVE

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Kinetiq | kinetiq_staking | [kinetiq.xyz](https://kinetiq.xyz) | staking: `0x393D0B87Ed38fc779FD9611144aE649BA6082109`, kHYPE: `0xfD739d4e423301CE9385c1fb8850539D657C296D` |
| stHYPE | sthype_staking | — | staking: `0xB96f07367e69e86d6e9C3F29215885104813eeAE`, stHYPE: `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1` |
| Hyperbeat LST | hyperbeat_lst | — | staking: `0xCeaD893b162D38e714D82d06a7fe0b0dc3c38E0b`, beHYPE: `0xd8FC8F0b03eBA61F64D08B0bef69d80916E5DdA9` |
| Kintsu | kintsu | — | staking: `0xDDC126c12F9F8DF5a6fC273f6D43C1E21b4d2945`, sHYPE: `0xBeF0142A0955a7d5dcCe5C2A13Fb84E332669D2d` |

### CDP (1)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Felix | liquity_v2 | [usefelix.xyz/borrow](https://www.usefelix.xyz/borrow) | borrower_ops: `0xadfba621...`, trove_mgr: `0x58446c58...`, feUSD: `0x02c6a2fA58cC01A18B8D9E00eA48d65E4dF26c70` |

### Vault (2)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Felix Vaults | erc4626 | [usefelix.xyz/lend](https://www.usefelix.xyz/lend) | feHYPE: `0x2900ABd7...`, feUSDC: `0x8A862fD6...`, feUSDT0: `0xFc512637...` |
| Upshift | erc4626 | [app.upshift.fi](https://app.upshift.fi) | hbHYPE: `0x96C6cBB6...`, hbUBTC: `0xc061d389...`, HLPe: `0x8fFDcd8A...` |

### Yield Source (2)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Pendle | pendle_v2 | [app.pendle.finance](https://app.pendle.finance) | router: `0x888888888889758F76e7103c6CbF23ABbF58F946` |
| Spectra V2 | spectra | [app.spectra.finance](https://app.spectra.finance) | 5 pools (dnHYPE, USDT0, wVLP, hbHYPE, WHYPE) |

### Yield Aggregator (2)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Beefy | beefy_vault | [app.beefy.com](https://app.beefy.com) | vault: `0x4ad02BF0...` (EOL) |
| Lazy Summer | erc4626 | [summer.fi](https://summer.fi) | USDC: `0x252e5aa4...`, USDT: `0x2cc190fb...` |

### Derivatives (1)

| Protocol | Interface | App | Key Contract |
|----------|-----------|-----|-------------|
| Kinetiq Markets | kinetiq_markets | [kinetiq.xyz](https://kinetiq.xyz) | kmHYPE: `0x360C140E5344A1A0593D44B4ea6Fc7C3DAf0C473` |

## Architecture

```
defi-cli/
  Cargo.toml              # Workspace root
  config/                  # TOML protocol registry (compiled in)
  crates/
    defi-core/             # Traits, types, registry, provider
    defi-protocols/        # Protocol adapters
    defi-cli/              # CLI binary
    defi-mcp/              # MCP server binary
```

## Gas Optimization

- EIP-1559 gas pricing (auto-fetches baseFee + priorityFee)
- 20% gas buffer on estimates to prevent out-of-gas
- Dynamic `eth_estimateGas` in both simulation and broadcast modes

## Safety

- All mutation operations default to `--dry-run`
- Use `--broadcast` to actually send transactions
- Requires `DEFI_PRIVATE_KEY` environment variable for broadcast
- Transaction simulation via `eth_call` before broadcast

## Agent Mode

```bash
echo '{"action":"dex.swap","params":{"protocol":"hyperswap-v2","token_in":"WHYPE","token_out":"USDC","amount":"1.0"}}' | defi agent
```

## MCP Server

```bash
defi-mcp
```

Exposes tools: `defi_status`, `defi_list_protocols`, `defi_dex_swap`, `defi_lending_supply`, `defi_lending_rates`, `defi_staking_stake`, `defi_vault_deposit`

## License

MIT
