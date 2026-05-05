// chainId integrity guard (SSOT Section 7.4).
//
// SSOT requires that the registered chain set, per-chain protocol configs,
// per-chain token tables, and adapter spender / pool addresses cannot
// drift across chains. The most common way for this to break:
//
//   * chains.toml gets a duplicate `chain_id` (two routes claim the same
//     chain).
//   * A protocol TOML's `chain = "..."` field references a key that
//     chains.toml does not define (orphan adapter — calls land on the
//     wrong network or fail at runtime).
//   * A token TOML lives under a filename whose chain key has no entry
//     in chains.toml.
//
// This test pins the matrix at the registry layer so a regression in
// any of the three sources fails the build before broadcast can pick up
// a mismatched address.
import { Registry } from "@hypurrquant/defi-core";
import { describe, expect, it } from "vitest";

describe("chainId integrity (SSOT 7.4)", () => {
  const reg = Registry.loadEmbedded();
  const chainKeys = Array.from(reg.chains.keys());
  const chainIds = chainKeys.map((k) => reg.chains.get(k)!.chain_id);

  it("chains.toml has a non-empty chain set", () => {
    expect(chainKeys.length).toBeGreaterThan(0);
  });

  it("every chain has a positive integer chain_id", () => {
    for (const key of chainKeys) {
      const cfg = reg.chains.get(key)!;
      expect(cfg.chain_id, `chain '${key}' chain_id`).toBeTypeOf("number");
      expect(Number.isInteger(cfg.chain_id), `chain '${key}' chain_id integer`).toBe(true);
      expect(cfg.chain_id).toBeGreaterThan(0);
    }
  });

  it("chain_id values are unique across chains.toml", () => {
    const seen = new Map<number, string>();
    for (const key of chainKeys) {
      const id = reg.chains.get(key)!.chain_id;
      const prev = seen.get(id);
      expect(prev, `chains '${prev}' and '${key}' both claim chain_id=${id}`).toBeUndefined();
      seen.set(id, key);
    }
  });

  it("known mainnet chain_ids match canonical EVM values", () => {
    // Anchor a handful of well-known IDs so a typo in chains.toml
    // (e.g. base = 8455) becomes immediately visible.
    const canonical: Record<string, number> = {
      hyperevm: 999,
      mantle: 5000,
      base: 8453,
      bnb: 56,
      monad: 143,
    };
    for (const [key, expected] of Object.entries(canonical)) {
      const cfg = reg.chains.get(key);
      if (!cfg) continue; // chain may have been removed; honor the registry
      expect(cfg.chain_id, `${key} chain_id`).toBe(expected);
    }
  });

  it("every protocol's `chain` field is a key registered in chains.toml", () => {
    const orphans: { slug: string; chain: string }[] = [];
    for (const p of reg.protocols) {
      if (!reg.chains.has(p.chain)) orphans.push({ slug: p.slug, chain: p.chain });
    }
    expect(
      orphans,
      "Protocol(s) reference an undefined chain key:\n" +
        orphans.map((o) => `  ${o.slug} -> ${o.chain}`).join("\n"),
    ).toEqual([]);
  });

  // README claims 🟡 staged status for these chains, and the token tables
  // exist, but chains.toml does not yet define a routing entry. Adding
  // them is a chain-list change (SSOT Section 3, requires explicit
  // approval), so for now they are tracked as known orphans. Removing an
  // entry from this set is the right move once chains.toml is extended.
  const KNOWN_ORPHAN_TOKEN_TABLES = new Set<string>([
    "arbitrum",
    "ethereum",
  ]);

  it("token tables whose chain is unregistered are tracked as known orphans", () => {
    const novel: string[] = [];
    const fixed: string[] = [];
    for (const chain of reg.tokens.keys()) {
      if (!reg.chains.has(chain) && !KNOWN_ORPHAN_TOKEN_TABLES.has(chain)) {
        novel.push(chain);
      }
    }
    for (const chain of KNOWN_ORPHAN_TOKEN_TABLES) {
      // a known-orphan that is now resolved means chains.toml gained the
      // entry (or the token file was deleted) — trim the set in the same
      // commit so it does not mask new drift.
      if (reg.chains.has(chain) || !reg.tokens.has(chain)) fixed.push(chain);
    }
    expect(
      novel,
      "Novel orphan token tables (no chains.toml entry, not in known set): " +
        novel.join(", "),
    ).toEqual([]);
    expect(
      fixed,
      "KNOWN_ORPHAN_TOKEN_TABLES has stale entries (chains.toml or token file changed). " +
        "Trim them in the same commit: " +
        fixed.join(", "),
    ).toEqual([]);
  });

  it("getProtocolsForChain only returns entries whose `chain` matches the query", () => {
    // Cross-pollination guard: if a protocol with chain='bnb' ever leaks
    // into getProtocolsForChain('hyperevm'), the user could broadcast
    // BNB-deployed router calldata to HyperEVM RPC.
    const leaks: string[] = [];
    for (const queryChain of chainKeys) {
      for (const p of reg.getProtocolsForChain(queryChain)) {
        if (p.chain.toLowerCase() !== queryChain.toLowerCase()) {
          leaks.push(`getProtocolsForChain('${queryChain}') yielded ${p.slug} (chain=${p.chain})`);
        }
      }
    }
    expect(leaks, leaks.join("\n")).toEqual([]);
  });

  it("wrapped_native is a non-zero 20-byte hex address per chain", () => {
    const bad: string[] = [];
    for (const key of chainKeys) {
      const cfg = reg.chains.get(key)!;
      const wn = cfg.wrapped_native;
      if (!/^0x[0-9a-fA-F]{40}$/.test(wn)) {
        bad.push(`${key}: wrapped_native='${wn}' is not a 20-byte hex address`);
      } else if (/^0x0+$/.test(wn)) {
        bad.push(`${key}: wrapped_native is the zero address`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("rpc_url is set per chain and uses http(s)", () => {
    const bad: string[] = [];
    for (const key of chainKeys) {
      const cfg = reg.chains.get(key)!;
      const url = cfg.rpc_url;
      if (typeof url !== "string" || url.length === 0) {
        bad.push(`${key}: rpc_url empty`);
      } else if (!/^https?:\/\//.test(url)) {
        bad.push(`${key}: rpc_url='${url}' not http(s)`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("chain_id sanity: at least 5 chains and total active protocols >= 30", () => {
    // Sanity floor — a refactor that wipes the registry returns the test
    // suite back to a green-but-broken state. Pin lower bounds.
    expect(chainKeys.length).toBeGreaterThanOrEqual(5);
    let active = 0;
    for (const key of chainKeys) active += reg.getProtocolsForChain(key).length;
    expect(active).toBeGreaterThanOrEqual(30);
    // chainIds is read for the duplicate-detection pass and pinned here
    // so the array isn't elided as unused.
    expect(chainIds.length).toBe(chainKeys.length);
  });
});
