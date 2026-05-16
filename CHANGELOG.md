# Changelog

All notable changes to `defi-cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work landed on `main` after `v1.0.13` (commit `e3a3510`). When this rolls into
the next release, move these entries under a versioned heading.

### Added

- **CLI: `--asset` alias on `token` and `bridge` commands** (R1). Both flags
  resolve to the same handler argument; `--asset` makes the surface consistent
  with `price` / `lending` / `yield`. `--token` is kept as the long-standing
  primary so every existing script continues to work. Missing both flags now
  emits the explicit guard error
  `"--token (or --asset) is required"`. ([#R1])
- **CLI: `--aggregator` alias on `swap --provider`** (R3). The flag value
  matches the prose in `swap --help` and project docs (KyberSwap / OpenOcean /
  LiquidSwap / LI.FI / Relay are "aggregators"). When both `--provider` and
  `--aggregator` are passed, `--aggregator` wins (last-flag-wins, the common
  commander convention). ([#R3])
- **Test coverage** across every package — see *Tests* below.
- **CLI command-based QA report**
  (`docs/qa-reports/2026-05-16-cli-command-qa.md`) covering 40 commands across
  5 chains (status / price / lending / yield / swap / bridge / token / lp /
  portfolio / wallet) — read-only RPC + external aggregator APIs + dry-run
  builders verified end-to-end.

### Changed

- **CLI: `swap` / `bridge` help text now spells out dry-run semantics** (R2).
  Both commands intentionally stay single-command (no `quote` / `simulate`
  subcommand) because dry-run is the default and already returns the quote +
  calldata; the `.description()` text now explains this:
  *"Dry-run by default returns the quote + calldata; pass --broadcast to send
  the tx."* No behaviour change — `--help` prose only.
- **CLI: `yield --min-spread` help text** clarified that the flag is a decimal
  (e.g. `0.05` = 5%), not a percent. The numeric default (`"1.0"` ≈ 100%, which
  effectively disables plan_only) is left as-is to avoid breaking scripts; a
  follow-up PR is needed for a sane default change. (F2)
- **`main.ts`**: factored the subcommand-detection logic into an exported pure
  function `decideEntryPoint(rawArgs)` plus a `KNOWN_SUBCOMMANDS` set so the
  routing branches are unit-testable. The bottom of `main.ts` now runs `main()`
  only when the file is the bin entrypoint (see *Fixed* for the symlink
  resolution).
- **`mcp-server.ts`**: exported `ok` / `err` / `getRegistry` / `resolveToken` /
  `makeExecutor` / `server` so the JSON envelope helpers and registry factories
  are testable in isolation. The MCP stdio transport is now opened only when
  the file is invoked as the bin entrypoint, so importing `mcp-server.ts` from
  a test (or another module) no longer blocks on stdin.

### Fixed

- **CI: bin entrypoint guards now resolve symlinks before comparing**. Regression
  introduced when `main.ts` and `mcp-server.ts` got import guards in the
  previous two commits. The original guard compared
  `fileURLToPath(import.meta.url)` against `process.argv[1]` — which works for
  `node dist/main.js` but breaks for `npx defi` (and any npm bin invocation)
  because `process.argv[1]` is the symlink (`node_modules/.bin/defi`) and
  `import.meta.url` is the symlink target. The smoke test caught it with
  *"Banner missing dynamic chain/protocol count"*. Both guards now run their
  paths through `realpathSync` before comparing. ([commit `4ad8f7f`])
- **`price.ts`**: removed unreachable CDP oracle fan-out. The `if (isWhype)`
  branch asked the registry for CDP-category protocols, but no protocol in the
  current registry registers under the `cdp` category (felix is registered as
  `lending` via `felix_morpho`). The branch entered, iterated an empty array,
  and continued — dead code. Removed the import + the guard + the dead
  Promise.all loop. (F1)

### Tests

Total monorepo tests went from **201** (session baseline) to **431** (+230,
+114.4%):

| Package           | Tests (baseline → current) |
|-------------------|----------------------------|
| `defi-core`       | 32 → 49 (+17)              |
| `defi-protocols`  | 63 → 147 (+84)             |
| `defi-cli`        | 106 → 235 (+129)           |

Notable per-file coverage jumps:

- **`commands/{price,setup,ows,portfolio,yield,price}.ts`**, `portfolio-tracker.ts`,
  `cli.ts`, `landing.ts`, `main.ts`, `signer/index.ts`, `mcp-server.ts`
  (helpers) — 0% → ~100% line coverage via mock-based unit tests with no real
  RPC.
- **`defi-core/erc20.ts`, `multicall.ts`, `provider.ts`** — 0% → ~100%; covers
  ERC20 builders, multicall encode/decode + RPC mock, provider cache identity
  and SSOT 7.4 chain-anchor keying.
- **`defi-protocols/factory.ts`** — branches **14.28% → 98.48%**. Walks every
  dispatch branch across the 14 factory functions plus the
  `inferRewardStrategy` 5-branch fallback chain and the
  `createKittenSwapFarming` missing-contract guards.
- **`defi-protocols/dex/algebra_v3.ts`** — branches **18.18% → 58.82%**;
  V2/Integral dispatch + quote() decode paths via stubbed viem.
- **`defi-protocols/dex/uniswap_v3.ts`** — branches **47.36% → 75%**; Ramses +
  Slipstream CL-style mint dispatch.
- **`defi-protocols/dex/thena_cl.ts`** — branches **42.85% → ~100%**;
  constructor guard + remove_liquidity guards + reverse sort.
- **`defi-protocols/lending/compound_v2.ts`** — branches **45.45% → 69.56%**;
  constructor `defaultVtoken` fallback chain.

### Refactor

- **`commands/yield.ts`**: `--min-spread` flag carries an inline comment
  explaining the decimal semantics + default-as-disable behaviour. No behaviour
  change. (F2)
- **`commands/price.ts`**: removed `createOracleFromCdp` import +
  `WHYPE_ADDRESS` constant after the CDP fan-out removal. (F1)

### Internal

- Per-handler test files now follow a consistent mock pattern:
  `vi.mock("@hypurrquant/defi-protocols")` for adapter factories,
  `vi.mock("viem", importOriginal)` for selective `createPublicClient` stubs,
  `vi.spyOn(process, "exit")` for error-path tests. Documented inline in each
  test header.

[#R1]: docs/qa-reports/2026-05-16-cli-command-qa.md
[#R3]: docs/qa-reports/2026-05-16-cli-command-qa.md
[commit `4ad8f7f`]: https://github.com/hypurrquant/defi-cli/commit/4ad8f7f

---

## [1.0.13] — 2026-05-08

Released by maintainer. See PR #32 for the full content.

- Bridge feature complete (CCTP V2 `--auto-receive`, LI.FI, Relay, deBridge).
- Production-grade verification across 4 chains × 35+ protocols.
- Adapter fixes from the ULTRAQA sandbox cycle.
- Per-package coverage baseline added via `@vitest/coverage-v8`.

[Unreleased]: https://github.com/hypurrquant/defi-cli/compare/v1.0.13...HEAD
[1.0.13]: https://github.com/hypurrquant/defi-cli/releases/tag/v1.0.13
