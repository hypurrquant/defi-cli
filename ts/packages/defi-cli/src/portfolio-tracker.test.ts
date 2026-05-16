// Unit tests for portfolio-tracker.ts — covers the 4 exported helpers:
//   - takeSnapshot   (Registry + multicallRead + viem.getBalance)
//   - saveSnapshot   (writes to ~/.defi-cli/snapshots/)
//   - loadSnapshots  (reads + hydrates bigint fields)
//   - calculatePnL   (pure math + duration formatting)
//
// $HOME is redirected to a tmpdir before each test so saveSnapshot /
// loadSnapshots touch a throwaway directory instead of the user's real
// ~/.defi-cli. multicallRead + viem.createPublicClient are stubbed so
// takeSnapshot runs end-to-end without RPC.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import type { Address, Hex } from "viem";
import { Registry } from "@hypurrquant/defi-core";
import type { PortfolioSnapshot } from "@hypurrquant/defi-core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_HOME = mkdtempSync(resolve(tmpdir(), "defi-cli-portfolio-test-"));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TEST_HOME;
const SNAPSHOT_DIR = resolve(TEST_HOME, ".defi-cli", "snapshots");

afterAll(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  else delete process.env.HOME;
});

let nativeBalance: bigint = 0n;
let multicallResponse: (Hex | null)[] | null = null;
let multicallShouldThrow = false;
let getBalanceShouldThrow = false;

vi.mock("@hypurrquant/defi-core", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("@hypurrquant/defi-core");
  return {
    ...real,
    multicallRead: async (_rpc: string, calls: Array<[Address, Hex]>) => {
      if (multicallShouldThrow) throw new Error("simulated multicall failure");
      if (multicallResponse) {
        const out = multicallResponse.slice(0, calls.length);
        while (out.length < calls.length) out.push(u256(0n));
        return out;
      }
      return calls.map(() => u256(0n));
    },
  };
});

vi.mock("viem", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("viem");
  return {
    ...real,
    createPublicClient: () => ({
      getBalance: async () => {
        if (getBalanceShouldThrow) throw new Error("simulated eth_getBalance failure");
        return nativeBalance;
      },
    }),
  };
});

const { takeSnapshot, saveSnapshot, loadSnapshots, calculatePnL } = await import(
  "./portfolio-tracker.js"
);

function u256(n: bigint): Hex {
  return `0x${n.toString(16).padStart(64, "0")}` as Hex;
}

beforeEach(() => {
  if (existsSync(SNAPSHOT_DIR)) rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  nativeBalance = 0n;
  multicallResponse = null;
  multicallShouldThrow = false;
  getBalanceShouldThrow = false;
});

describe("saveSnapshot + loadSnapshots", () => {
  function makeSnapshot(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
    return {
      timestamp: 1_700_000_000_000,
      chain: "hyperevm",
      wallet: "0xdEAD",
      tokens: [
        { token: "0x1" as Address, symbol: "USDC", balance: 1_000_000n, value_usd: 1, price_usd: 1 },
      ],
      defi_positions: [
        { protocol: "felix-morpho", type: "lending_supply", asset: "collateral", amount: 12_345n, value_usd: 12.345 },
      ],
      total_value_usd: 13.345,
      ...overrides,
    };
  }

  it("saveSnapshot writes to ~/.defi-cli/snapshots/<chain>_<wallet>_<ts>.json + returns path", () => {
    const snap = makeSnapshot();
    const filepath = saveSnapshot(snap);
    expect(filepath).toBe(
      resolve(SNAPSHOT_DIR, `${snap.chain}_${snap.wallet}_${snap.timestamp}.json`),
    );
    expect(existsSync(filepath)).toBe(true);
  });

  it("saveSnapshot serialises bigint fields as strings (JSON-safe)", () => {
    const filepath = saveSnapshot(makeSnapshot());
    // readFileSync via the same fs module we mocked HOME against
    // — verify the JSON parses and the bigints came through as strings.
    const raw = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("fs").readFileSync(filepath, "utf-8"),
    );
    expect(raw.tokens[0].balance).toBe("1000000"); // bigint → string
    expect(raw.defi_positions[0].amount).toBe("12345");
  });

  it("loadSnapshots returns [] when the snapshot directory does not exist", () => {
    expect(existsSync(SNAPSHOT_DIR)).toBe(false);
    expect(loadSnapshots("hyperevm", "0xdEAD")).toEqual([]);
  });

  it("loadSnapshots filters by chain_wallet_ prefix, sorts reverse (newest first), and limits", () => {
    // Use a tiny offset so the alphabetic sort matches numeric timestamp order.
    saveSnapshot(makeSnapshot({ timestamp: 1_700_000_000_000 }));
    saveSnapshot(makeSnapshot({ timestamp: 1_700_000_001_000 }));
    saveSnapshot(makeSnapshot({ timestamp: 1_700_000_002_000 }));
    // Different wallet — must be filtered out by prefix.
    saveSnapshot(makeSnapshot({ wallet: "0xOTHER", timestamp: 1_700_000_999_000 }));

    const out = loadSnapshots("hyperevm", "0xdEAD", 2);
    expect(out).toHaveLength(2);
    expect(out[0].timestamp).toBe(1_700_000_002_000); // newest first
    expect(out[1].timestamp).toBe(1_700_000_001_000);
  });

  it("loadSnapshots hydrates bigint balance + position amount back from JSON strings", () => {
    saveSnapshot(makeSnapshot());
    const [snap] = loadSnapshots("hyperevm", "0xdEAD");
    expect(typeof snap.tokens[0].balance).toBe("bigint");
    expect(snap.tokens[0].balance).toBe(1_000_000n);
    expect(typeof snap.defi_positions[0].amount).toBe("bigint");
    expect(snap.defi_positions[0].amount).toBe(12_345n);
  });

  it("loadSnapshots handles files that pre-date the bigint hydration code (no balance/amount fields)", () => {
    // Simulate an older snapshot with plain number balances (or none at all).
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const path = resolve(SNAPSHOT_DIR, "hyperevm_0xdEAD_1700000000000.json");
    writeFileSync(
      path,
      JSON.stringify({
        timestamp: 1_700_000_000_000,
        chain: "hyperevm",
        wallet: "0xdEAD",
        tokens: [{ token: "0x1", symbol: "USDC", balance: 1_000, value_usd: 1, price_usd: 1 }],
        defi_positions: [],
        total_value_usd: 1,
      }),
    );
    const [snap] = loadSnapshots("hyperevm", "0xdEAD");
    // Hydration only triggers on string fields; number stays as-is.
    expect(snap.tokens[0].balance).toBe(1_000);
  });
});

describe("calculatePnL", () => {
  function snap(overrides: Partial<PortfolioSnapshot>): PortfolioSnapshot {
    return {
      timestamp: 0,
      chain: "hyperevm",
      wallet: "0xdEAD",
      tokens: [],
      defi_positions: [],
      total_value_usd: 0,
      ...overrides,
    };
  }

  it("computes pnl_usd and pnl_pct from start/end totals", () => {
    const prev = snap({ total_value_usd: 100, timestamp: 0 });
    const curr = snap({ total_value_usd: 130, timestamp: 60 * 60_000 }); // +1h
    const pnl = calculatePnL(curr, prev);
    expect(pnl.start_value_usd).toBe(100);
    expect(pnl.end_value_usd).toBe(130);
    expect(pnl.pnl_usd).toBe(30);
    expect(pnl.pnl_pct).toBeCloseTo(30, 5);
  });

  it("pnl_pct is 0 when start_value_usd is 0 (avoid div-by-zero)", () => {
    const pnl = calculatePnL(
      snap({ total_value_usd: 50, timestamp: 0 }),
      snap({ total_value_usd: 0, timestamp: 0 }),
    );
    expect(pnl.pnl_pct).toBe(0);
  });

  it("period format: <1h returns minutes, <24h returns Xh, ≥24h returns Xd", () => {
    expect(
      calculatePnL(snap({ timestamp: 30 * 60_000 }), snap({ timestamp: 0 })).period,
    ).toBe("30m");
    expect(
      calculatePnL(snap({ timestamp: 5 * 60 * 60_000 }), snap({ timestamp: 0 })).period,
    ).toBe("5.0h");
    expect(
      calculatePnL(snap({ timestamp: 2 * 24 * 60 * 60_000 }), snap({ timestamp: 0 })).period,
    ).toBe("2.0d");
  });

  it("token_changes captures non-zero balance + value deltas (skip dust < 0.001 USD)", () => {
    const prev = snap({
      tokens: [
        { token: "0x1" as Address, symbol: "USDC", balance: 100n, value_usd: 100, price_usd: 1 },
        { token: "0x2" as Address, symbol: "DUST", balance: 0n, value_usd: 0, price_usd: 0 },
      ],
    });
    const curr = snap({
      tokens: [
        { token: "0x1" as Address, symbol: "USDC", balance: 150n, value_usd: 150, price_usd: 1 },
        // DUST token: balance unchanged + value delta = 0.0001 → skipped.
        { token: "0x2" as Address, symbol: "DUST", balance: 0n, value_usd: 0.0001, price_usd: 0 },
        // NEW token: never in prev → balance change = whole balance.
        { token: "0x3" as Address, symbol: "NEW", balance: 42n, value_usd: 4.2, price_usd: 0.1 },
      ],
    });
    const pnl = calculatePnL(curr, prev);
    const symbols = pnl.token_changes.map((t) => t.symbol);
    expect(symbols).toContain("USDC");
    expect(symbols).toContain("NEW");
    expect(symbols).not.toContain("DUST");
    const usdc = pnl.token_changes.find((t) => t.symbol === "USDC")!;
    expect(usdc.balance_change).toBe(50n);
    expect(usdc.value_change_usd).toBe(50);
  });
});

describe("takeSnapshot", () => {
  it("returns a snapshot with zero-balance entries when multicall returns all-zero", async () => {
    const registry = Registry.loadEmbedded();
    const snap = await takeSnapshot("hyperevm", "0x000000000000000000000000000000000000dEaD", registry);
    expect(snap.chain).toBe("hyperevm");
    expect(snap.wallet).toBe("0x000000000000000000000000000000000000dEaD");
    // takeSnapshot does NOT filter zero balances (unlike portfolio show); it
    // emits a row per token so cross-snapshot diffs stay aligned by symbol.
    expect(snap.tokens.length).toBeGreaterThan(0);
    expect(snap.tokens.every((t) => t.balance === 0n)).toBe(true);
    expect(snap.defi_positions).toEqual([]);
    expect(snap.total_value_usd).toBe(0);
  });

  it("appends a synthetic native-token entry when eth_getBalance > 0", async () => {
    // Native price = 0 in default mock so nativeValueUsd is 0, but the token
    // entry is appended. The wrapped-native address matches an existing
    // WHYPE registry entry (balance=0n), so we look for the row with the
    // *non-zero* balance to pin the synthetic native append specifically.
    nativeBalance = 1_500_000_000_000_000_000n; // 1.5 native
    const registry = Registry.loadEmbedded();
    const snap = await takeSnapshot("hyperevm", "0x000000000000000000000000000000000000dEaD", registry);
    const native = snap.tokens.find((t) => t.balance === 1_500_000_000_000_000_000n);
    expect(native).toBeDefined();
    expect(native!.token.toLowerCase()).toBe("0x5555555555555555555555555555555555555555");
    expect(native!.symbol).toBe("HYPE"); // chain.native_token
  });

  it("silently continues when eth_getBalance throws (RPC hiccup on native leg)", async () => {
    getBalanceShouldThrow = true;
    const registry = Registry.loadEmbedded();
    const snap = await takeSnapshot("hyperevm", "0x000000000000000000000000000000000000dEaD", registry);
    // The handler swallows the RPC failure and skips the synthetic native
    // append. The regular WHYPE row from the multicall fan-out still exists
    // (with balance=0n); the assertion is that no row carries the synthetic
    // non-zero native balance we'd otherwise have added.
    expect(snap.chain).toBe("hyperevm");
    expect(snap.tokens.every((t) => t.balance === 0n)).toBe(true);
  });
});
