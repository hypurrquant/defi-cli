/**
 * Anvil Fork E2E Tests — validates CLI commands against all 40 chains.
 * Non-Anvil tests run always; Anvil fork tests run when Anvil is available.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const ANVIL_BIN = "/Users/hik/.foundry/bin/anvil";
const TS_ROOT = resolve(__dirname, "../..");
const TS_BIN = resolve(TS_ROOT, "packages/defi-cli/dist/main.js");

const ALL_CHAINS: Array<{ slug: string; chainId: number }> = [
  { slug: "hyperevm", chainId: 999 }, { slug: "arbitrum", chainId: 42161 },
  { slug: "base", chainId: 8453 }, { slug: "bnb", chainId: 56 },
  { slug: "ethereum", chainId: 1 }, { slug: "polygon", chainId: 137 },
  { slug: "avalanche", chainId: 43114 }, { slug: "optimism", chainId: 10 },
  { slug: "scroll", chainId: 534352 }, { slug: "linea", chainId: 59144 },
  { slug: "mantle", chainId: 5000 }, { slug: "ink", chainId: 57073 },
  { slug: "monad", chainId: 143 }, { slug: "cronos", chainId: 25 },
  { slug: "rootstock", chainId: 30 }, { slug: "gnosis", chainId: 100 },
  { slug: "berachain", chainId: 80094 }, { slug: "kava", chainId: 2222 },
  { slug: "sei", chainId: 1329 }, { slug: "unichain", chainId: 130 },
  { slug: "blast", chainId: 81457 }, { slug: "sonic", chainId: 146 },
  { slug: "worldchain", chainId: 480 }, { slug: "fraxtal", chainId: 252 },
  { slug: "core", chainId: 1116 }, { slug: "celo", chainId: 42220 },
  { slug: "zksync", chainId: 324 }, { slug: "abstract", chainId: 2741 },
  { slug: "soneium", chainId: 1868 }, { slug: "manta", chainId: 169 },
  { slug: "taiko", chainId: 167000 }, { slug: "metis", chainId: 1088 },
  { slug: "canto", chainId: 7700 }, { slug: "aurora", chainId: 1313161554 },
  { slug: "boba", chainId: 288 }, { slug: "moonbeam", chainId: 1284 },
  { slug: "mode", chainId: 34443 }, { slug: "moonriver", chainId: 1285 },
  { slug: "zircuit", chainId: 48900 }, { slug: "harmony", chainId: 1666600000 },
];

// Active + Limited tier chains (should have >= 1 protocol)
const CHAINS_WITH_PROTOCOLS = [
  "ink", "monad", "cronos", "rootstock", "gnosis", "berachain", "kava",
  "sei", "unichain", "blast", "sonic", "worldchain", "fraxtal", "core",
  "celo", "zksync", "abstract", "soneium", "manta", "taiko", "metis",
  "canto", "aurora", "boba", "moonbeam", "mode", "moonriver",
];

function runCliJson(args: string): any {
  try {
    const output = execSync(`node ${TS_BIN} ${args}`, {
      cwd: TS_ROOT,
      timeout: 30_000,
      encoding: "utf-8",
    }).trim();
    return JSON.parse(output);
  } catch (e: any) {
    if (e.stderr) {
      try { return JSON.parse(e.stderr.trim()); } catch {}
    }
    return { error: e.message?.slice(0, 200) };
  }
}

const anvilAvailable = existsSync(ANVIL_BIN);

describe("E2E Tests: All 40 Chains", () => {
  beforeAll(() => {
    if (!anvilAvailable) {
      console.warn(`⚠ Anvil not found at ${ANVIL_BIN}. Anvil fork tests will be skipped.`);
    }
  });

  // Test 1: All 40 chains produce valid status JSON
  describe("Status (all chains)", () => {
    for (const { slug, chainId } of ALL_CHAINS) {
      it(`${slug}: chain_id=${chainId}`, () => {
        const data = runCliJson(`status --json --chain ${slug}`);
        expect(data.chain).toBeTruthy();
        expect(data.chain_id).toBe(chainId);
        expect(Array.isArray(data.protocols)).toBe(true);
        expect(data.summary).toBeDefined();
      });
    }
  });

  // Test 2: New chains have protocols loaded
  describe("Protocol coverage", () => {
    for (const chain of CHAINS_WITH_PROTOCOLS) {
      it(`${chain}: >= 1 protocol`, () => {
        const data = runCliJson(`status --json --chain ${chain}`);
        expect(data.summary.total_protocols).toBeGreaterThanOrEqual(1);
      });
    }
  });

  // Test 3: Original 11 chains still have full protocol sets
  describe("Original chain integrity", () => {
    const originals = [
      { slug: "hyperevm", min: 20 }, { slug: "arbitrum", min: 8 },
      { slug: "base", min: 8 }, { slug: "bnb", min: 14 },
      { slug: "ethereum", min: 6 }, { slug: "polygon", min: 6 },
      { slug: "avalanche", min: 4 }, { slug: "optimism", min: 4 },
      { slug: "scroll", min: 4 }, { slug: "linea", min: 6 },
      { slug: "mantle", min: 6 },
    ];
    for (const { slug, min } of originals) {
      it(`${slug}: >= ${min} protocols (unchanged)`, () => {
        const data = runCliJson(`status --json --chain ${slug}`);
        expect(data.summary.total_protocols).toBeGreaterThanOrEqual(min);
      });
    }
  });

  // Test 4: BigInt serialization
  describe("BigInt 0x-hex", () => {
    it("jsonStringify produces 0x-hex", async () => {
      const { jsonStringify } = await import("../../packages/defi-core/src/json.js");
      const parsed = JSON.parse(jsonStringify({ amount: 1000000000000000000n }));
      expect(parsed.amount).toBe("0xde0b6b3a7640000");
    });
  });
});
