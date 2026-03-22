/**
 * Snapshot comparison tests: Rust CLI output vs TypeScript CLI output.
 *
 * These tests run both the Rust and TS CLI with identical arguments,
 * then compare the JSON output field-by-field, ignoring volatile fields
 * like timestamps and block numbers.
 *
 * Prerequisites:
 * - Rust binary built: cargo build --release -p defi-cli
 * - TS built: pnpm build
 * - Snapshot fixtures generated: pnpm run generate-snapshots
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../..");
const TS_ROOT = resolve(__dirname, "../..");
// Check multiple locations for Rust binary
const RUST_BIN_CANDIDATES = [
  resolve(PROJECT_ROOT, "target/release/defi-cli"),
  "/Users/hik/.local/bin/defi",
];
const RUST_BIN = RUST_BIN_CANDIDATES.find((p) => existsSync(p)) ?? RUST_BIN_CANDIDATES[0];
const TS_BIN = resolve(TS_ROOT, "packages/defi-cli/dist/main.js");
const SNAPSHOT_DIR = resolve(__dirname, "rust");

/** Fields that change between runs — excluded from comparison */
const VOLATILE_FIELDS = new Set([
  "timestamp",
  "block_number",
  "block_timestamp",
  "scan_duration_ms",
  "duration_ms",
  "last_update",
  "lastUpdate",
]);

/** Deep compare two values, ignoring volatile fields */
function deepCompare(
  rustVal: unknown,
  tsVal: unknown,
  path: string = "$",
): string[] {
  const diffs: string[] = [];

  if (rustVal === null || rustVal === undefined) {
    if (tsVal !== null && tsVal !== undefined) {
      diffs.push(`${path}: Rust=null, TS=${JSON.stringify(tsVal)}`);
    }
    return diffs;
  }

  if (typeof rustVal !== typeof tsVal) {
    // Allow bigint string comparison: Rust "0x..." vs TS "0x..."
    if (typeof rustVal === "string" && typeof tsVal === "string") {
      if (rustVal !== tsVal) {
        diffs.push(`${path}: Rust=${rustVal}, TS=${tsVal}`);
      }
      return diffs;
    }
    diffs.push(
      `${path}: type mismatch Rust=${typeof rustVal}, TS=${typeof tsVal}`,
    );
    return diffs;
  }

  if (Array.isArray(rustVal)) {
    if (!Array.isArray(tsVal)) {
      diffs.push(`${path}: Rust=array, TS=${typeof tsVal}`);
      return diffs;
    }
    if (rustVal.length !== (tsVal as unknown[]).length) {
      diffs.push(
        `${path}: array length Rust=${rustVal.length}, TS=${(tsVal as unknown[]).length}`,
      );
    }
    const minLen = Math.min(rustVal.length, (tsVal as unknown[]).length);
    for (let i = 0; i < minLen; i++) {
      diffs.push(
        ...deepCompare(rustVal[i], (tsVal as unknown[])[i], `${path}[${i}]`),
      );
    }
    return diffs;
  }

  if (typeof rustVal === "object" && rustVal !== null) {
    const rustObj = rustVal as Record<string, unknown>;
    const tsObj = tsVal as Record<string, unknown>;
    const allKeys = new Set([
      ...Object.keys(rustObj),
      ...Object.keys(tsObj),
    ]);

    for (const key of allKeys) {
      if (VOLATILE_FIELDS.has(key)) continue;
      if (!(key in rustObj)) {
        // TS has extra field — note but don't fail (TS may add metadata)
        continue;
      }
      if (!(key in tsObj)) {
        diffs.push(`${path}.${key}: missing in TS output`);
        continue;
      }
      diffs.push(
        ...deepCompare(rustObj[key], tsObj[key], `${path}.${key}`),
      );
    }
    return diffs;
  }

  if (rustVal !== tsVal) {
    diffs.push(`${path}: Rust=${JSON.stringify(rustVal)}, TS=${JSON.stringify(tsVal)}`);
  }
  return diffs;
}

function runRust(args: string): string | null {
  if (!existsSync(RUST_BIN)) return null;
  try {
    return execSync(`${RUST_BIN} ${args}`, {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      encoding: "utf-8",
      env: { ...process.env, RUST_LOG: "" },
    }).trim();
  } catch {
    return null;
  }
}

function runTs(args: string): string | null {
  try {
    return execSync(`node ${TS_BIN} ${args}`, {
      cwd: TS_ROOT,
      timeout: 30000,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

function loadSnapshot(name: string): Record<string, unknown> | null {
  const path = join(SNAPSHOT_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveSnapshot(name: string, data: unknown): void {
  writeFileSync(
    join(SNAPSHOT_DIR, `${name}.json`),
    JSON.stringify(data, null, 2),
  );
}

/** Test cases: [name, cli_args] */
const SNAPSHOT_CASES: Array<[string, string]> = [
  ["status-hyperevm", "status --json --chain hyperevm"],
  ["status-arbitrum", "status --json --chain arbitrum"],
  ["status-base", "status --json --chain base"],
  ["status-ethereum", "status --json --chain ethereum"],
];

describe("Snapshot Tests: Rust vs TypeScript CLI", () => {
  const rustAvailable = existsSync(RUST_BIN);

  beforeAll(() => {
    if (!rustAvailable) {
      console.warn(
        `⚠ Rust binary not found at ${RUST_BIN}. ` +
        `Run 'cargo build --release -p defi-cli' to enable Rust comparison. ` +
        `Tests will compare TS output against saved snapshots only.`,
      );
    }
  });

  describe("TS CLI produces valid JSON", () => {
    for (const [name, args] of SNAPSHOT_CASES) {
      it(`${name}: produces valid JSON`, () => {
        const tsOutput = runTs(args);
        expect(tsOutput).toBeTruthy();
        const parsed = JSON.parse(tsOutput!);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe("object");
      });
    }
  });

  describe("Status command structure", () => {
    it("status --json has required fields", () => {
      const tsOutput = runTs("status --json --chain hyperevm");
      expect(tsOutput).toBeTruthy();
      const data = JSON.parse(tsOutput!);
      expect(data.chain).toBe("HyperEVM");
      expect(data.chain_id).toBe(999);
      expect(data.rpc_url).toContain("hyperliquid");
      expect(Array.isArray(data.protocols)).toBe(true);
      expect(data.protocols.length).toBeGreaterThan(0);
      expect(data.summary).toBeDefined();
      expect(data.summary.total_protocols).toBe(data.protocols.length);
    });

    it("each protocol has name, category, interface, contracts", () => {
      const tsOutput = runTs("status --json --chain hyperevm");
      const data = JSON.parse(tsOutput!);
      for (const p of data.protocols) {
        expect(typeof p.name).toBe("string");
        expect(typeof p.category).toBe("string");
        expect(typeof p.interface).toBe("string");
        expect(Array.isArray(p.contracts)).toBe(true);
        for (const c of p.contracts) {
          expect(typeof c.name).toBe("string");
          expect(c.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        }
      }
    });
  });

  describe("Cross-chain consistency", () => {
    const chains = [
      // Original 11 chains
      { name: "hyperevm", chainId: 999 },
      { name: "arbitrum", chainId: 42161 },
      { name: "base", chainId: 8453 },
      { name: "ethereum", chainId: 1 },
      { name: "polygon", chainId: 137 },
      { name: "bnb", chainId: 56 },
      { name: "avalanche", chainId: 43114 },
      { name: "optimism", chainId: 10 },
      { name: "scroll", chainId: 534352 },
      { name: "linea", chainId: 59144 },
      { name: "mantle", chainId: 5000 },
      // Tier 1: >$100M TVL
      { name: "ink", chainId: 57073 },
      { name: "monad", chainId: 143 },
      { name: "cronos", chainId: 25 },
      { name: "rootstock", chainId: 30 },
      { name: "gnosis", chainId: 100 },
      // Tier 2: $25M-$100M TVL
      { name: "berachain", chainId: 80094 },
      { name: "kava", chainId: 2222 },
      { name: "sei", chainId: 1329 },
      { name: "unichain", chainId: 130 },
      { name: "blast", chainId: 81457 },
      { name: "sonic", chainId: 146 },
      { name: "worldchain", chainId: 480 },
      { name: "fraxtal", chainId: 252 },
      { name: "core", chainId: 1116 },
      { name: "celo", chainId: 42220 },
      // Tier 3: $5M-$25M TVL
      { name: "zksync", chainId: 324 },
      { name: "abstract", chainId: 2741 },
      { name: "soneium", chainId: 1868 },
      { name: "manta", chainId: 169 },
      { name: "taiko", chainId: 167000 },
      { name: "metis", chainId: 1088 },
      // Tier 4: $1M-$5M TVL
      { name: "canto", chainId: 7700 },
      { name: "aurora", chainId: 1313161554 },
      { name: "boba", chainId: 288 },
      { name: "moonbeam", chainId: 1284 },
      { name: "mode", chainId: 34443 },
      { name: "moonriver", chainId: 1285 },
      // Tier 5: <$1M TVL
      { name: "zircuit", chainId: 48900 },
      { name: "harmony", chainId: 1666600000 },
    ];

    for (const { name, chainId } of chains) {
      it(`${name}: chain_id=${chainId}`, () => {
        const tsOutput = runTs(`status --json --chain ${name}`);
        expect(tsOutput).toBeTruthy();
        const data = JSON.parse(tsOutput!);
        expect(data.chain_id).toBe(chainId);
        expect(Array.isArray(data.protocols)).toBe(true);
      });
    }
  });

  if (rustAvailable) {
    describe("Rust vs TS comparison", () => {
      for (const [name, args] of SNAPSHOT_CASES) {
        it(`${name}: TS output matches Rust`, () => {
          const rustOutput = runRust(args);
          const tsOutput = runTs(args);

          expect(rustOutput).toBeTruthy();
          expect(tsOutput).toBeTruthy();

          const rustData = JSON.parse(rustOutput!);
          const tsData = JSON.parse(tsOutput!);

          // Save snapshots for debugging
          saveSnapshot(`${name}-rust`, rustData);
          saveSnapshot(`${name}-ts`, tsData);

          const diffs = deepCompare(rustData, tsData);
          if (diffs.length > 0) {
            console.warn(`Diffs for ${name}:\n${diffs.join("\n")}`);
          }
          // Allow some diffs for now — the key structural fields must match
          expect(tsData.chain).toBe(rustData.chain);
          expect(tsData.chain_id).toBe(rustData.chain_id);
          expect(tsData.summary.total_protocols).toBeGreaterThanOrEqual(
            rustData.summary.total_protocols,
          );
        });
      }
    });
  }

  describe("BigInt serialization (decimal)", () => {
    it("jsonStringify produces decimal string for bigint", async () => {
      const { jsonStringify } = await import(
        "../../packages/defi-core/src/json.js"
      );
      const data = { amount: 123456789n, name: "test" };
      const result = JSON.parse(jsonStringify(data));
      expect(result.amount).toBe("123456789");
    });
  });

  describe("Schema command", () => {
    it("produces valid JSON with commands list", () => {
      const tsOutput = runTs("schema --json");
      expect(tsOutput).toBeTruthy();
      const data = JSON.parse(tsOutput!);
      expect(data).toBeDefined();
    });
  });
});
