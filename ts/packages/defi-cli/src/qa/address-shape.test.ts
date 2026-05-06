// Address shape guard.
//
// Every "0x..." literal in the bundled config (chains.toml, tokens/*.toml,
// protocols/**/*.toml) must be exactly `0x` + 40 hex chars (20 bytes).
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
        if (addr.length !== 42) {
          out.push({ file: file.replace(CONFIG_DIR + "/", ""), line: i + 1, address: addr });
        }
      }
    }
  }
  return out;
}

describe("config TOML address shape", () => {
  it("every \"0x...\" literal in config/ is exactly 42 chars (0x + 40 hex)", () => {
    const offenders = findMalformedAddresses();
    const lines = offenders.map(
      (o) => `${o.file}:${o.line}  ${o.address}  (length=${o.address.length}, expected=42)`,
    );
    expect(
      offenders,
      "Malformed addresses found in config TOML — fix or remove:\n" + lines.join("\n"),
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
    expect(m![1].length).not.toBe(42);
  });
});
