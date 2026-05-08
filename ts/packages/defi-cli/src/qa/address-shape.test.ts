// Address / bytes32 shape guard.
//
// Every "0x..." literal in the bundled config (chains.toml, tokens/*.toml,
// protocols/**/*.toml) must be either:
//   - `0x` + 40 hex chars (20-byte address), OR
//   - `0x` + 64 hex chars (32-byte word, e.g. Morpho Blue marketId).
//
// On 2026-05-07 a sweep found five malformed entries that had been live
// for weeks:
//   - protocols/dex/hybra.toml: rewards_distributor (37 hex chars)
//   - protocols/dex/nest.toml: 4× pool gauge fields (39 hex chars each)
// `defi --chain hyperevm status --verify` flagged the hybra one as
// `NO_CODE` because it slipped past the 42-length check that gates
// `isPlaceholder()`. The four nest entries flew under the radar
// because nest is `is_active = false` and its protocol is filtered
// out by `getProtocolsForChain()` before status verifies anything.
//
// 2026-05-07 (US-B4): Morpho Blue per-protocol [[protocol.markets]]
// blocks introduced 32-byte marketId hex literals (66 chars) — these
// are explicitly allowed alongside 20-byte addresses. Anything else is
// still rejected.
//
// This test scans the raw TOML bytes directly so we catch shape
// regressions even on inactive entries.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "../..");
const TS_ROOT = resolve(PKG_ROOT, "../..");
const CONFIG_DIR = resolve(TS_ROOT, "config");

function walkToml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkToml(p));
    else if (p.endsWith(".toml")) out.push(p);
  }
  return out;
}

// Match `"0x<hex>"` literals. Capturing group 1 is the address.
const ADDR_RE = /"(0x[0-9a-fA-F]+)"/g;

interface Offender {
  file: string;
  line: number;
  address: string;
}

// 20-byte address = 42 chars (0x + 40 hex). 32-byte word = 66 chars
// (0x + 64 hex) — Morpho Blue marketIds and similar bytes32 keys.
const ALLOWED_LENGTHS = new Set([42, 66]);

function findMalformedAddresses(): Offender[] {
  const tomls = walkToml(CONFIG_DIR);
  const out: Offender[] = [];
  for (const file of tomls) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      ADDR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ADDR_RE.exec(lines[i]))) {
        const addr = m[1];
        if (!ALLOWED_LENGTHS.has(addr.length)) {
          out.push({ file: file.replace(CONFIG_DIR + "/", ""), line: i + 1, address: addr });
        }
      }
    }
  }
  return out;
}

describe("config TOML address / bytes32 shape", () => {
  it("every \"0x...\" literal in config/ is 42 chars (address) or 66 chars (bytes32)", () => {
    const offenders = findMalformedAddresses();
    const lines = offenders.map(
      (o) => `${o.file}:${o.line}  ${o.address}  (length=${o.address.length}, expected=42 or 66)`,
    );
    expect(
      offenders,
      "Malformed hex literals found in config TOML — fix or remove:\n" + lines.join("\n"),
    ).toEqual([]);
  });

  it("the regex itself catches the canonical bad shape (sanity)", () => {
    // Self-test: feed the regex an artificial 41-char address and confirm
    // the test would have rejected it. Guards against the regex silently
    // becoming permissive after future refactors.
    const sample = '"0x1234567890abcdef1234567890abcdef1234567"'; // 41 hex chars
    ADDR_RE.lastIndex = 0;
    const m = ADDR_RE.exec(sample);
    expect(m).not.toBeNull();
    expect(ALLOWED_LENGTHS.has(m![1].length)).toBe(false);
  });

  it("32-byte marketId hex (66 chars) is accepted as a bytes32 word", () => {
    // Sanity: confirm a real marketId-shaped literal passes the length set
    // — guards against accidentally tightening the rule back to 42-only.
    const marketId = '"0xfa0b720389b546fcf8562c18cda8c00460072b63776add7fbfe8cd4f06d7c3ba"';
    ADDR_RE.lastIndex = 0;
    const m = ADDR_RE.exec(marketId);
    expect(m).not.toBeNull();
    expect(ALLOWED_LENGTHS.has(m![1].length)).toBe(true);
  });
});
