# DeFi CLI

Rust CLI for interacting with 60+ DeFi protocols on HyperEVM. Agent-first design with JSON output, schema introspection, and MCP server.

## Install

```bash
# From source
cargo install --path crates/defi-cli

# Or build
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

# Build a swap transaction (dry-run by default)
defi dex swap --protocol hyperswap-v3 --token-in WHYPE --token-out USDC --amount 1.0 --json

# Supply to lending pool (dry-run)
defi lending supply --protocol hyperlend --asset USDC --amount 100.0 --json

# Stake HYPE for kHYPE (dry-run)
defi staking stake --protocol kinetiq --amount 10.0 --json

# Actually broadcast (requires DEFI_PRIVATE_KEY)
export DEFI_PRIVATE_KEY=0x...
defi lending supply --protocol hyperlend --asset USDC --amount 100.0 --broadcast --json
```

## Commands

| Command | Description |
|---------|-------------|
| `status` | Chain info and protocol list (`--verify` for on-chain check) |
| `schema` | JSON Schema for any action (agent-friendly) |
| `dex` | `swap`, `quote`, `compare` |
| `lending` | `supply`, `borrow`, `repay`, `withdraw`, `rates`, `position` |
| `cdp` | `open`, `adjust`, `close`, `info` |
| `bridge` | `send`, `quote` |
| `staking` | `stake`, `unstake`, `info` |
| `vault` | `deposit`, `withdraw`, `info` |
| `yield` | `compare`, `optimize` |
| `wallet` | `balance` |
| `token` | `balance`, `approve`, `allowance`, `transfer` |
| `agent` | JSON stdin batch mode for AI agents |

## Output Modes

```bash
--json         # JSON output
--ndjson       # Newline-delimited JSON
--fields a,b   # Filter output fields
```

## Safety

- All mutation operations default to `--dry-run`
- Use `--broadcast` to actually send transactions
- Requires `DEFI_PRIVATE_KEY` environment variable for broadcast

## Agent Mode

Send JSON commands via stdin:

```bash
echo '{"action":"dex.swap","params":{"protocol":"hyperswap-v3","token_in":"WHYPE","token_out":"USDC","amount":"1.0"}}' | defi agent
```

Available actions: `status`, `list_protocols`, `schema`, `dex.swap`, `dex.quote`, `lending.supply`, `lending.borrow`, `lending.repay`, `lending.withdraw`, `staking.stake`, `staking.unstake`, `vault.deposit`, `vault.withdraw`, `cdp.open`

## MCP Server

Run as an MCP server for AI agent integration:

```bash
defi-mcp
```

Exposes 7 tools: `defi_status`, `defi_list_protocols`, `defi_dex_swap`, `defi_lending_supply`, `defi_lending_rates`, `defi_staking_stake`, `defi_vault_deposit`

## Supported Protocols (60)

| Category | Count | Protocols |
|----------|-------|-----------|
| DEX | 15 | HyperSwap V3/V2, Project X, KittenSwap, NEST, Curve, Balancer V3, Ring Few, Ramses CL/HL, WOOFi, Valantis, Wombat, Hybra, Hyperliquid Spot |
| Lending | 8 | HyperLend, Morpho, Euler V2, HypurrFi, TermMax, Hyperdrive, HypurrFi Isolated, Teller |
| Liquid Staking | 4 | Kinetiq (kHYPE), stHYPE, Hyperbeat LST, Kintsu |
| CDP | 2 | Felix, Parallel |
| Bridge | 4 | Hyperliquid Bridge, Hyperlane, SoDEX, Symbiosis |
| Yield Source | 10 | Pendle, Spectra, Penpie, Felix USDhl, Equilibria, Looped Hype, GrowiHF, Harmonix, HyperWave, Wrapped HLP |
| Yield Aggregator | 4 | Beefy, Hyperbeat Earn, Kinetiq Earn, Lazy Summer |
| Vault | 4 | Veda, Upshift, Felix Vaults, D2 Finance |
| Derivatives | 3 | Hyperliquid HLP, Derive V2, Kinetiq Markets |
| Options | 2 | Rysk V12, Hypersurface |
| Other | 4 | Steer, Liminal, Altura, Rumpel |

## Architecture

```
defi-cli/
  Cargo.toml              # Workspace root
  config/                  # TOML protocol registry (compiled in)
  crates/
    defi-core/             # Traits, types, registry, provider
    defi-protocols/        # Protocol adapters (23 implementations)
    defi-cli/              # CLI binary
    defi-mcp/              # MCP server binary
  SKILL.md                 # AI agent usage guide
```

## Tech Stack

| Role | Choice |
|------|--------|
| Language | Rust |
| EVM | alloy (`sol!` macro for compile-time ABI) |
| CLI | clap (derive) |
| Async | tokio |
| Serialization | serde + serde_json |
| Config | TOML (embedded at compile time) |
| Error | thiserror |

## Development

```bash
# Build
cargo build

# Check
cargo check

# Lint
cargo clippy

# Test on fork
anvil --fork-url https://rpc.hyperliquid.xyz/evm --port 8546
# Then update config/chains.toml rpc_url to http://localhost:8546
```

## License

MIT
