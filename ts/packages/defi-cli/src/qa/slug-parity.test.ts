// Doc/CLI slug parity guard.
//
// SSOT (docs/QA_WORKFLOW.md) Sections 9.3/9.4 require README and SKILL.md
// to stay in lockstep with the live CLI. The 2026-05-05 QA baseline pass
// found three drift bugs that this test would have caught at PR time:
//   - `hyperswap`        (CLI exposes the slug as `hyperswap-v3`)
//   - `nest`             (CLI rejects: is_active = false in nest.toml)
//   - "39 protocols"     (CLI banner reports 38 active protocols)
//
// The intent is structural: rather than hard-coding slug lists, the test
// pulls the ground truth from the embedded Registry and asserts that the
// docs only refer to slugs that are actually live, with the carve-out that
// inactive slugs may still appear in tables when explicitly marked
// `_(inactive)_`.
import { Registry } from "@hypurrquant/defi-core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "../..");
const TS_ROOT = resolve(PKG_ROOT, "../..");
const REPO_ROOT = resolve(TS_ROOT, "..");

const README_PATH = resolve(REPO_ROOT, "README.md");

const SKILL_MIRRORS = [
  resolve(PKG_ROOT, "skills/defi-cli/SKILL.md"),
  resolve(REPO_ROOT, "skills/defi-cli/SKILL.md"),
];
const PROTOCOLS_MIRRORS = [
  resolve(PKG_ROOT, "skills/defi-cli/references/protocols.md"),
  resolve(REPO_ROOT, "skills/defi-cli/references/protocols.md"),
];
const COMMANDS_MIRRORS = [
  resolve(PKG_ROOT, "skills/defi-cli/references/commands.md"),
  resolve(REPO_ROOT, "skills/defi-cli/references/commands.md"),
];

function read(p: string): string {
  return readFileSync(p, "utf8");
}

function extractBacktickSlugs(s: string): Set<string> {
  const slugs = new Set<string>();
  const re = /`([a-z][a-z0-9-]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) slugs.add(m[1]);
  return slugs;
}

describe("doc/CLI slug parity", () => {
  const reg = Registry.loadEmbedded();
  const allChainNames = Array.from(reg.chains.keys());
  const activeSlugs = new Set<string>();
  const inactiveSlugs = new Set<string>();
  for (const p of reg.protocols) {
    if (p.is_active === false) inactiveSlugs.add(p.slug);
    else activeSlugs.add(p.slug);
  }
  let activeFromChainSum = 0;
  for (const chain of allChainNames) {
    activeFromChainSum += reg.getProtocolsForChain(chain).length;
  }

  it("registry exposes a positive number of active protocols", () => {
    expect(activeSlugs.size).toBeGreaterThan(0);
    expect(activeFromChainSum).toBe(activeSlugs.size);
  });

  it("ts mirror and root mirror are byte-identical (SKILL.md)", () => {
    const [ts, root] = SKILL_MIRRORS.map(read);
    expect(ts).toBe(root);
  });

  it("ts mirror and root mirror are byte-identical (protocols.md)", () => {
    const [ts, root] = PROTOCOLS_MIRRORS.map(read);
    expect(ts).toBe(root);
  });

  it("ts mirror and root mirror are byte-identical (commands.md)", () => {
    const [ts, root] = COMMANDS_MIRRORS.map(read);
    expect(ts).toBe(root);
  });

  it("README banner '<N> protocols' matches the active count", () => {
    const md = read(README_PATH);
    const m = md.match(/(\d+)\s+protocols?\b/);
    expect(m, "README must contain '<N> protocols' banner").toBeTruthy();
    expect(Number(m![1])).toBe(activeSlugs.size);
  });

  it("SKILL.md mirrors '<N> protocols' matches the active count", () => {
    for (const path of SKILL_MIRRORS) {
      const md = read(path);
      const m = md.match(/(\d+)\s+protocols?\b/);
      expect(m, `${path} must mention '<N> protocols'`).toBeTruthy();
      expect(Number(m![1])).toBe(activeSlugs.size);
    }
  });

  it("README protocol-table slugs are all active or marked _(inactive)_", () => {
    const md = read(README_PATH);
    // The README also has a Command Reference table (`status`, `ows`, ...)
    // whose first column happens to be a backticked token, so scope the
    // match to the "Supported Protocols" section only.
    const startIdx = md.indexOf("## Supported Protocols");
    expect(startIdx, "README must have a '## Supported Protocols' section").toBeGreaterThan(-1);
    const after = md.slice(startIdx);
    const nextHeader = after.indexOf("\n## ", 1);
    const protocolSection = nextHeader === -1 ? after : after.slice(0, nextHeader);
    const tableRe = /^\|\s*`([a-z][a-z0-9-]+)`\s*(_\(inactive\)_)?\s*\|/gm;
    const stale: string[] = [];
    const wronglyMarked: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tableRe.exec(protocolSection))) {
      const slug = m[1];
      const isMarked = !!m[2];
      if (isMarked) {
        if (activeSlugs.has(slug)) wronglyMarked.push(slug);
      } else if (!activeSlugs.has(slug)) {
        stale.push(slug);
      }
    }
    expect(stale, `Stale slugs in README (not in registry): ${stale.join(", ")}`).toEqual([]);
    expect(
      wronglyMarked,
      `Slugs marked _(inactive)_ but live: ${wronglyMarked.join(", ")}`,
    ).toEqual([]);
  });

  it("SKILL.md catalogue lines reference only active slugs", () => {
    for (const path of SKILL_MIRRORS) {
      const md = read(path);
      // e.g. **DEX**: `slug-a`, `slug-b`, ...
      const lineRe = /\*\*(?:Lending|DEX|Vault|CDP|Bridge)\*\*:\s*([^\n]+)/g;
      const stale: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = lineRe.exec(md))) {
        for (const s of extractBacktickSlugs(m[1])) {
          if (!activeSlugs.has(s)) stale.push(`${s}@${path}`);
        }
      }
      expect(stale, `Stale slugs in catalogue line: ${stale.join(", ")}`).toEqual([]);
    }
  });

  it("inactive slugs are filtered out by getProtocolsForChain", () => {
    if (inactiveSlugs.size === 0) return;
    const offending: string[] = [];
    for (const slug of inactiveSlugs) {
      for (const chain of allChainNames) {
        if (reg.getProtocolsForChain(chain).some((p) => p.slug === slug)) {
          offending.push(`${slug}@${chain}`);
        }
      }
    }
    expect(
      offending,
      `Inactive slugs leaked into getProtocolsForChain: ${offending.join(", ")}`,
    ).toEqual([]);
  });

  it("commands.md does not show usage examples for inactive slugs", () => {
    if (inactiveSlugs.size === 0) return;
    for (const path of COMMANDS_MIRRORS) {
      const md = read(path);
      for (const slug of inactiveSlugs) {
        const usageRe = new RegExp(`^\\s*defi\\b[^\\n]*--protocol\\s+${slug}\\b`, "m");
        const offendingLine = md.split("\n").findIndex((l) => usageRe.test(l));
        expect(
          offendingLine,
          `${path}:${offendingLine + 1} contains a runnable '--protocol ${slug}' example`,
        ).toBe(-1);
      }
    }
  });
});
