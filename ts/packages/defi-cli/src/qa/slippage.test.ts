// Slippage protection guard (SSOT Section 7.3).
//
// **Active findings (2026-05-05)**: 4 DEX adapters ship swap and LP
// builders with hard-coded `amountOutMinimum: 0n` / `amount{0,1}Min: 0n`
// — i.e. effectively unlimited slippage and zero MEV protection. These
// are tracked in KNOWN_INFINITE_SLIPPAGE below as a snapshot of the
// pre-fix baseline. Removing entries from the set is the goal; adding
// new entries is what this test blocks.
//
// Why a snapshot rather than a hard ban: fixing all 15 sites requires
// threading a `slippageBps` (or `amount{Out,0,1}Min`) parameter through
// the IDex / lp-builder traits, which is a breaking change for the
// public adapter surface. That refactor is intentionally separated from
// this baseline pass and is tracked in the QA report's follow-up list.
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
// Snapshot taken: 2026-05-05 baseline (qa/2026-05-05-v1-0-12-baseline).
const KNOWN_INFINITE_SLIPPAGE = new Set<string>([
  "dex/algebra_v3.ts:86",   // const amountOutMinimum = 0n  (buildSwap)
  "dex/algebra_v3.ts:273",  // amount0Min: 0n, amount1Min: 0n  (buildAddLiquidity)
  "dex/algebra_v3.ts:278",  // amount0Min: 0n, amount1Min: 0n  (alt mint args)
  "dex/algebra_v3.ts:304",  // amount0Min: 0n, amount1Min: 0n  (buildRemoveLiquidity)
  "dex/balancer_v3.ts:37",  // const minAmountOut = 0n  (buildSwap)
  "dex/thena_cl.ts:78",     // amountOutMinimum: 0n  (buildSwap)
  "dex/thena_cl.ts:165",    // amount0Min: 0n, amount1Min: 0n  (buildAddLiquidity)
  "dex/thena_cl.ts:190",    // amount0Min: 0n, amount1Min: 0n  (buildRemoveLiquidity)
  "dex/uniswap_v3.ts:90",   // const amountOutMinimum = 0n  (buildSwap)
  "dex/uniswap_v3.ts:242",  // amountOutMinimum: 0n  (multi-hop swap)
  "dex/uniswap_v3.ts:343",  // amount0Min: 0n  (buildAddLiquidity)
  "dex/uniswap_v3.ts:344",  // amount1Min: 0n
  "dex/uniswap_v3.ts:363",  // amount0Min: 0n  (slipstream mint)
  "dex/uniswap_v3.ts:364",  // amount1Min: 0n
  "dex/uniswap_v3.ts:403",  // amount0Min: 0n, amount1Min: 0n  (buildRemoveLiquidity)
]);

const slippageKeyPattern =
  /\b(amountOutMinimum|amount0Min|amount1Min|amountAMin|amountBMin|minAmountOut|minSharesOut)\s*:\s*0n\b/;
const slippageDeclPattern =
  /^\s*(?:const|let)\s+(?:amountOutMinimum|minAmountOut|amount0Min|amount1Min|amountAMin|amountBMin)\s*=\s*0n\b/;

describe("slippage protection (SSOT 7.3)", () => {
  it("infinite-slippage call sites do not grow beyond the known snapshot", () => {
    const found = new Set<string>();
    for (const file of walk(ADAPTERS_DIR)) {
      const rel = relative(ADAPTERS_DIR, file);
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
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
