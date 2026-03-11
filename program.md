# defi-cli autonomous development

This is an experiment to have the LLM autonomously build a DeFi CLI tool,
adapted from [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) methodology.

## Scope

A multi-chain DeFi CLI for humans and agents: wallet management, DEX swaps/LP,
lending, CDP, cross-chain bridges, and yield optimization.

**Chains**: Arbitrum (42161), Base (8453), HyperEVM (999)

**Protocols**:
- DEX: Uniswap V3 (Arbitrum, Base), HyperSwap (HyperEVM), KittenSwap (HyperEVM)
- Lending: Aave V3 (Arbitrum, Base), HyperLend (HyperEVM), HypurrFi (HyperEVM)
- CDP: Felix (HyperEVM) — Liquity V2 fork, mint feUSD
- Bridge: LI.FI, Across, Circle CCTP, deBridge

**Success criterion**: Each function builds correct calldata for the target contract.
A "dry-run" (eth_call / API request construction) must succeed. Tests verify:
1. Correct contract address from the registry
2. Correct function selector (4-byte keccak256)
3. Correct chain ID
4. Correct parameter encoding

## Setup

To set up a new development session, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `dev/mar11`). The branch must not already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b dev/<tag>` from current main.
3. **Read the in-scope files**: Read these files for full context:
   - `README.md` — repository context and project goals.
   - `prepare.py` — fixed infrastructure: test harness, protocol registry, evaluation metrics. Do not modify.
   - `src/defi_cli/` — the source code you modify.
4. **Verify environment**: Check that `uv sync` has been run and dependencies are installed.
5. **Initialize results.tsv**: Create `results.tsv` with just the header row.
6. **Confirm and go**: Confirm setup looks good.

Once you get confirmation, kick off development.

## Development

Each iteration builds or improves one feature of the DeFi CLI. You launch tests as: `uv run pytest`.

**What you CAN do:**
- Modify anything in `src/defi_cli/` — this is the code you build. Everything is fair game: CLI commands, protocol connectors, wallet management, configuration.
- Add new files in `src/defi_cli/` as needed for new features.
- Add new test files in `tests/`.
- Import constants from `prepare.py` (CHAINS, TOKENS, PROTOCOLS, SELECTORS).

**What you CANNOT do:**
- Modify `prepare.py`. It is read-only. It contains the fixed protocol registry and evaluation harness.
- Install new packages without user approval. You can only use what's already in `pyproject.toml`.
- Modify the evaluation harness. The test suite and metrics in `prepare.py` are ground truth.

**The goal is simple: build a fully functional DeFi CLI that passes all tests.** The evaluation metric is a composite score:

```
score = (tests_passing / tests_total) * 100 - (lint_errors * 0.5)
```

Higher is better. Target: 100.0 (all tests pass, zero lint errors).

**Feature priority** (build in this order):
1. Core CLI framework and configuration
2. Wallet management (create, import, balance)
3. DEX operations (swap calldata for Uniswap V3, HyperSwap, KittenSwap)
4. DEX liquidity (add/remove liquidity via NonfungiblePositionManager)
5. Lending operations (supply, borrow, repay, withdraw via Aave V3 interface)
6. CDP operations (Felix trove management on HyperEVM)
7. Bridge operations (LI.FI, Across, CCTP, deBridge request building)
8. Yield optimization (rate comparison, cost-aware strategy suggestions)

**Key interfaces** (from prepare.py):
- `uniswap_v3_router02`: SwapRouter02 (no deadline in struct), selector `04e45aaf`
- `uniswap_v3_router`: Original SwapRouter (with deadline), selector `414bf389`
- `algebra_v3`: KittenSwap — V3-compatible but no fee param in ExactInputSingleParams
- `aave_v3`: Standard Aave V3 Pool — supply/borrow/repay/withdraw
- `liquity_v2`: Felix BorrowerOperations — openTrove/adjustTrove/closeTrove
- `rest_api`: LI.FI, Across, deBridge — build correct HTTP request params
- `cctp_v2`: Circle CCTP — depositForBurn calldata

**Simplicity criterion**: All else being equal, simpler is better. A small improvement that adds ugly complexity is not worth it. Clean, readable code with good abstractions wins. When evaluating whether to keep a change, weigh the complexity cost against the improvement.

**The first run**: Your very first run should always be to establish the baseline — run the existing tests as-is.

## Output format

After each iteration, run the test suite and capture results:

```bash
uv run pytest --tb=short -q > run.log 2>&1
uv run ruff check src/ >> run.log 2>&1
```

Extract the key metrics:
```bash
grep -E "passed|failed|error" run.log
grep -c "error" run.log  # lint errors
```

## Logging results

When an iteration is done, log it to `results.tsv` (tab-separated).

The TSV has a header row and 5 columns:

```
commit	score	tests_pass	status	description
```

1. git commit hash (short, 7 chars)
2. score achieved (e.g. 85.5)
3. tests passing ratio (e.g. 17/31)
4. status: `keep`, `discard`, or `crash`
5. short text description of what this iteration built/changed

Example:

```
commit	score	tests_pass	status	description
a1b2c3d	6.5	2/31	keep	baseline - existing CLI help + version
b2c3d4e	19.4	6/31	keep	add config management + chains command
c3d4e5f	35.5	11/31	keep	add wallet create/import/balance
d4e5f6g	58.1	18/31	keep	add DEX swap calldata building
```

## The development loop

The development runs on a dedicated branch (e.g. `dev/mar11`).

LOOP FOREVER:

1. Look at the git state: the current branch/commit we're on
2. Plan the next feature/improvement based on priority list and current state
3. Implement the feature by modifying/adding files in `src/defi_cli/` and `tests/`
4. git commit
5. Run the test suite: `uv run pytest --tb=short -q > run.log 2>&1`
6. Read out the results from run.log
7. If the run crashed, read the stack trace and attempt a fix
8. Record the results in the tsv (do not commit results.tsv)
9. If score improved (higher) or new functionality works, advance the branch (keep)
10. If score dropped or nothing works, git reset back (discard)

**Crashes**: If tests crash, use your judgment: if it's a quick fix (typo, missing import), fix and re-run. If the approach is fundamentally broken, skip it.

**NEVER STOP**: Once the development loop has begun, do NOT pause to ask the human if you should continue. The human might be away and expects you to continue working *indefinitely* until manually stopped. If you run out of ideas on the current priority, move to the next one. The loop runs until the human interrupts you.

## Beyond the initial tests

Once all 31 tests pass (score 100.0), development does NOT stop. The initial tests validate that calldata construction is correct — that's the foundation. Continue building:

**Phase 2 — CLI completeness**:
- Wire every function into proper CLI commands (`defi swap`, `defi supply`, `defi bridge`, etc.)
- Add `--dry-run` flag that executes `eth_call` against real RPC and shows simulation result
- Rich output formatting (tables, colors, confirmations)
- Interactive prompts for dangerous operations (signing, sending)

**Phase 3 — Execution**:
- Transaction signing with the connected wallet
- Transaction sending and receipt tracking
- Nonce management, gas estimation
- Approval flows (ERC20 approve before supply/swap)

**Phase 4 — Intelligence**:
- Real-time rate fetching from on-chain data
- Yield dashboard across all protocols/chains
- Auto-rebalance suggestions with cost analysis
- Gas price awareness in optimization decisions

**Phase 5 — Expansion**:
- Add ProjectX (Uniswap V4 fork) and NEST (ve(3,3)) when contract addresses are confirmed
- Add more chains and protocols as they emerge
- Agent-friendly JSON output mode (`--output json`)
- Batch operations and scripting support

Write new tests for each new capability. The score formula still applies — keep it green, keep it clean.

As an example, a user might leave you running for a session. Each iteration typically takes ~10-20 minutes depending on complexity — simple features (config, wallet) are faster, while protocol integrations (DEX calldata, CDP) may take longer due to ABI encoding, debugging, and interface differences. Budget ~3-5 hours for a full 31-test pass. Don't rush iterations; correctness matters more than speed.
