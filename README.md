# defi-cli

Multi-DEX DeFi CLI for perpetual trading, arbitrage, and position management.

Built using [autoresearch](https://github.com/karpathy/autoresearch) methodology — autonomous AI-driven iterative development.

## Supported DEXes

- **Hyperliquid** — Perp DEX on Arbitrum
- **Pacifica** — Perp DEX on World Chain
- **Lighter** — Orderbook DEX

## Quick Start

```bash
# Install uv if you haven't
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run the CLI
uv run defi --help

# Run tests
uv run pytest
```

## Development (Autoresearch Method)

This project uses an adapted autoresearch methodology for autonomous development:

1. **`prepare.py`** — Fixed evaluation harness (do not modify)
2. **`src/defi_cli/`** — Source code the agent modifies
3. **`program.md`** — Agent instructions

### Running Autonomous Development

Point your AI agent at `program.md` and let it iterate:

```bash
# The agent will:
# 1. Create a dev branch
# 2. Build features iteratively
# 3. Run tests after each change
# 4. Keep improvements, discard regressions
# 5. Log results to results.tsv
```

## Project Structure

```
defi-cli/
├── prepare.py          # Fixed: evaluation harness, constants (read-only)
├── program.md          # Agent instructions (human edits)
├── pyproject.toml      # Project config and dependencies
├── src/defi_cli/       # Source code (agent edits)
│   ├── __init__.py
│   ├── cli.py          # CLI entry point
│   └── ...             # Features built by agent
├── tests/              # Test suite
│   └── test_cli.py
└── results.tsv         # Experiment log (untracked)
```

## License

MIT
