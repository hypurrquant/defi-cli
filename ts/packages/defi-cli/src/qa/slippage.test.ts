// Slippage protection guard (SSOT Section 7.3).
//
// PR #3 (feat/slippage-protection) closed 14 of the 15 sites the
// 2026-05-05 baseline catalogued. The single remaining `0n` minimum
// in adapter code is an intentional carve-out inside an `eth_call`
// simulation path that never broadcasts a transaction — see
// KNOWN_INFINITE_SLIPPAGE below. Adding any *new* entry to that set
// (i.e. a new place where 0n leaks into a real broadcast) is what
// this test blocks.
//
// Implementation note: line numbers in the snapshot are fragile when
// adapter files get refactored. The 2026-05-05 baseline broke when
// PR #4 shifted line numbers in uniswap_v3.ts; the snapshot below was
// re-grounded against the current tree (post-PR #6 main).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "../..");
const TS_ROOT = resolve(PKG_ROOT, "../..");
const ADAPTERS_DIR = resolve(TS_ROOT, "packages/defi-protocols/src");
const SWAP_CMD_PATH = resolve(PKG_ROOT, "src/commands/swap.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// Each entry is "<path-relative-to-defi-protocols/src>:<line>" of a
// hard-coded zero minimum. Keep this set in lock-step with reality:
//   - Removing a line = adapter has been hardened (good).
//   - Adding a line = regression — this test will fail.
//
// Re-grounded: 2026-05-06 against post-PR #6 main. PR #3 closed all
// 14 broadcast-path sites the original 2026-05-05 baseline tracked.
const KNOWN_INFINITE_SLIPPAGE = new Set<string>([
  // Read-only `eth_call` simulation inside UniswapV3Adapter.quote()
  // fallback — never broadcasts a tx, so the floor is irrelevant.
  // Refactoring the simulation to use a sentinel is tracked but is
  // not a slippage exposure.
  "dex/uniswap_v3.ts:272",
]);

const slippageKeyPattern =
  /\b(amountOutMinimum|amount0Min|amount1Min|amountAMin|amountBMin|minAmountOut|minSharesOut)\s*:\s*0n\b/;
const slippageDeclPattern =
  /^\s*(?:const|let)\s+(?:amountOutMinimum|minAmountOut|amount0Min|amount1Min|amountAMin|amountBMin)\s*=\s*0n\b/;
// A line whose first non-whitespace character is `//` is a single-line
// comment — the documentation comment in uniswap_v3.ts that warns
// against `amountOutMinimum: 0n` would otherwise self-trigger this
// guard. Block-comment lines starting with `*` are also skipped.
const commentLinePattern = /^\s*(?:\/\/|\*)/;

describe("slippage protection (SSOT 7.3)", () => {
  it("infinite-slippage call sites do not grow beyond the known snapshot", () => {
    const found = new Set<string>();
    for (const file of walk(ADAPTERS_DIR)) {
      const rel = relative(ADAPTERS_DIR, file);
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (commentLinePattern.test(lines[i])) continue;
        if (slippageKeyPattern.test(lines[i]) || slippageDeclPattern.test(lines[i])) {
          found.add(`${rel}:${i + 1}`);
        }
      }
    }
    const novel = [...found].filter((loc) => !KNOWN_INFINITE_SLIPPAGE.has(loc));
    expect(
      novel,
      "New unprotected swap/LP min-amount = 0n introduced. Either gate it on a slippageBps " +
        "parameter or, if intentional and reviewed, append to KNOWN_INFINITE_SLIPPAGE with a " +
        "TODO and link to the tracking issue. New site(s): " +
        novel.join(", "),
    ).toEqual([]);
  });

  it("KNOWN_INFINITE_SLIPPAGE entries still exist (no stale references)", () => {
    const found = new Set<string>();
    for (const file of walk(ADAPTERS_DIR)) {
      const rel = relative(ADAPTERS_DIR, file);
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (commentLinePattern.test(lines[i])) continue;
        if (slippageKeyPattern.test(lines[i]) || slippageDeclPattern.test(lines[i])) {
          found.add(`${rel}:${i + 1}`);
        }
      }
    }
    const stale = [...KNOWN_INFINITE_SLIPPAGE].filter((loc) => !found.has(loc));
    // Stale = a known violation has either been fixed (good — please remove
    // it from the set in the same commit) or the file/line moved (line-based
    // snapshot drift). Either way the set must be trimmed so it doesn't
    // mask new regressions elsewhere.
    expect(
      stale,
      "KNOWN_INFINITE_SLIPPAGE has stale entries. Remove them in the same " +
        "commit that fixes the underlying call site: " +
        stale.join(", "),
    ).toEqual([]);
  });

  it("aggregator-driven swap command consumes a quoted minAmountOut", () => {
    // commands/swap.ts threads the aggregator's quote.minAmountOut (or the
    // equivalent field) into the executor. If a future refactor drops the
    // `quote` reference entirely, the user is at the mercy of the
    // aggregator's default slippage — this catches that drift.
    const src = readFileSync(SWAP_CMD_PATH, "utf8");
    expect(
      src,
      `${SWAP_CMD_PATH} must consume aggregator quote output for slippage protection`,
    ).toMatch(/quote|amountOutMin|minAmountOut/i);
  });

  it("user-facing slippage knobs default to <= 100 bps (1%)", () => {
    // Adapters that already accept opts.slippageBps (e.g. uniswap_v3
    // buildCompound) must default conservatively. Hard upper bound:
    // 100 bps = 1% is the SSOT 7.3 ceiling for "safe default".
    const offending: string[] = [];
    for (const file of walk(ADAPTERS_DIR)) {
      const rel = relative(ADAPTERS_DIR, file);
      const content = readFileSync(file, "utf8");
      const re = /slippageBps\s*\?\?\s*(\d+)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const bps = Number(m[1]);
        if (bps > 100) offending.push(`${rel}: default ${bps} bps (> 1%)`);
      }
    }
    expect(
      offending,
      "Default slippage must be <= 100 bps (1%):\n" + offending.join("\n"),
    ).toEqual([]);
  });
});
