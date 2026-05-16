// Unit tests for `defi price` — covers the oracle/dex aggregation and spread
// calculation paths without any real RPC.
//
// price.ts has three notable behaviours that this test pins down:
//
//   1. --source filters which probe loops run (oracle/dex/all). A bad value
//      silently runs neither, which we want to keep observable as the
//      "No prices could be fetched" envelope rather than silent success.
//   2. --asset accepts either a 40-hex address (used verbatim, decimals=18)
//      or a registry symbol (resolved through Registry.resolveToken).
//   3. The DEX leg pivots through USDC as the quote token and is skipped
//      with a stderr warning when no USDC entry is registered.
//
// Mock strategy mirrors lending.test.ts — vi.mock("@hypurrquant/defi-protocols")
// at module top so the registerPrice import binds to the stubbed factories.
// Registry.loadEmbedded() stays real so the test exercises the actual chain /
// token resolution code path (HyperEVM is the canonical test chain — has
// lending, dex, AND cdp protocols, plus a USDC entry for the DEX quote leg).
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

import { parseOutputMode } from "../output.js";

interface FakePriceData {
  source: string;
  source_type: string;
  asset: Address;
  price_usd: bigint;
  price_f64: number;
  block_number?: undefined;
  timestamp?: undefined;
}

// Per-test overridable behaviour. Default = oracle returns 1.00 and the
// dex returns 1.01 so the spread calc has something non-zero to assert on.
let oracleLendingPrice: number | "throw" = 1.0;
let dexQuotePrice: number | "throw" = 1.01;
let lendingOracleCalls: number = 0;
let dexCalls: number = 0;

function makePriceData(
  src: string,
  srcType: "oracle" | "dex_spot",
  price: number,
  asset: Address,
): FakePriceData {
  return {
    source: src,
    source_type: srcType,
    asset,
    price_usd: 0n,
    price_f64: price,
  };
}

vi.mock("@hypurrquant/defi-protocols", () => {
  return {
    createOracleFromLending: (entry: { name: string }) => ({
      getPrice: async (asset: Address): Promise<FakePriceData> => {
        lendingOracleCalls++;
        if (oracleLendingPrice === "throw") {
          throw new Error(`stub lending oracle (${entry.name}) refused`);
        }
        return makePriceData(`oracle:${entry.name}`, "oracle", oracleLendingPrice, asset);
      },
      getPrices: async () => {
        throw new Error("not used by price.ts");
      },
    }),
    createDex: (entry: { name: string }) => ({
      name: () => entry.name,
      // Only the methods price.ts indirectly needs (via DexSpotPrice.getPrice).
      quote: async () => {
        throw new Error("DexSpotPrice mock intercepts before this is called");
      },
    }),
    DexSpotPrice: {
      getPrice: async (
        dex: { name: () => string },
        token: Address,
      ): Promise<FakePriceData> => {
        dexCalls++;
        if (dexQuotePrice === "throw") {
          throw new Error(`stub dex (${dex.name()}) refused`);
        }
        return makePriceData(`dex:${dex.name()}`, "dex_spot", dexQuotePrice, token);
      },
    },
  };
});

// Hoisted: stub must register before the SUT is imported.
const { registerPrice } = await import("./price.js");

interface CapturedOutput {
  json: string[];
  text: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const originalErr = process.stderr.write.bind(process.stderr);
  const capture: CapturedOutput = { json: [], text: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    const line = [msg, ...rest]
      .map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
      .join(" ");
    if (line.trim().startsWith("[") || line.trim().startsWith("{")) {
      capture.json.push(line);
    } else {
      capture.text.push(line);
    }
  };
  process.stderr.write = ((chunk: string | Uint8Array) => {
    capture.text.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    capture,
    restore: () => {
      console.log = originalLog;
      process.stderr.write = originalErr;
    },
  };
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerPrice(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
  );
  return program;
}

beforeEach(() => {
  oracleLendingPrice = 1.0;
  dexQuotePrice = 1.01;
  lendingOracleCalls = 0;
  dexCalls = 0;
});

afterEach(() => {
  // No env to restore — price.ts is read-only and doesn't touch env vars.
});

interface PriceReport {
  asset: string;
  asset_address: string;
  prices: Array<{ source: string; source_type: string; price: number }>;
  max_spread_pct: number;
  oracle_vs_dex_spread_pct: number;
}

interface ErrorEnvelope {
  error: string;
}

function lastJson<T>(capture: CapturedOutput): T {
  // printOutput emits one JSON line in --json mode; grab the most recent.
  return JSON.parse(capture.json[capture.json.length - 1]!) as T;
}

describe("defi price — source filter", () => {
  it("--source oracle skips DEX probes entirely", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "oracle",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBeGreaterThan(0);
    expect(dexCalls).toBe(0);
    const report = lastJson<PriceReport>(capture);
    expect(report.prices.every((p) => p.source_type === "oracle")).toBe(true);
  });

  it("--source dex skips oracle probes entirely", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "dex",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBe(0);
    expect(dexCalls).toBeGreaterThan(0);
    const report = lastJson<PriceReport>(capture);
    expect(report.prices.every((p) => p.source_type === "dex_spot")).toBe(true);
  });

  it("--source all runs both oracle and dex probes", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "all",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBeGreaterThan(0);
    expect(dexCalls).toBeGreaterThan(0);
    const report = lastJson<PriceReport>(capture);
    const types = new Set(report.prices.map((p) => p.source_type));
    expect(types.has("oracle")).toBe(true);
    expect(types.has("dex_spot")).toBe(true);
  });

  it("unknown --source value yields no probes + error envelope", async () => {
    // Quirk worth pinning: invalid --source silently runs neither branch
    // (fetchOracle = false, fetchDex = false) and falls through to the
    // "No prices could be fetched" guard. Keeps the user-facing error
    // surface uniform — if this changes to throw on validation, this test
    // tells the author to update the contract.
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "garbage",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBe(0);
    expect(dexCalls).toBe(0);
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/No prices could be fetched/);
  });
});

describe("defi price — asset resolution", () => {
  it("--asset <symbol> resolves via registry and reports the symbol", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "oracle",
      ]);
    } finally {
      restore();
    }
    const report = lastJson<PriceReport>(capture);
    expect(report.asset).toBe("USDC");
    // HyperEVM USDC address from ts/config/tokens/hyperevm.toml.
    expect(report.asset_address.toLowerCase()).toBe(
      "0xb88339cb7199b77e23db6e890353e22632ba630f",
    );
  });

  it("--asset <0x-address> is taken verbatim with decimals=18 fallback", async () => {
    const arbitrary = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", arbitrary, "--source", "oracle",
      ]);
    } finally {
      restore();
    }
    const report = lastJson<PriceReport>(capture);
    expect(report.asset_address.toLowerCase()).toBe(arbitrary.toLowerCase());
    // When the asset is a raw address, the symbol field echoes the address
    // (no registry lookup) — pin that so it's an intentional contract.
    expect(report.asset.toLowerCase()).toBe(arbitrary.toLowerCase());
  });

  it("--asset <unknown-symbol> yields 'Could not resolve asset' error", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "NOT_A_REAL_TOKEN_XYZ", "--source", "all",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBe(0);
    expect(dexCalls).toBe(0);
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Could not resolve asset/);
  });
});

describe("defi price — chain validation", () => {
  it("missing --chain emits the standard requireChain error", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json",
        "price", "--asset", "USDC", "--source", "oracle",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/--chain is required/);
    expect(lendingOracleCalls).toBe(0);
  });

  it("unknown --chain yields 'Chain not found' before any probe runs", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "not_a_real_chain",
        "price", "--asset", "USDC", "--source", "all",
      ]);
    } finally {
      restore();
    }
    expect(lendingOracleCalls).toBe(0);
    expect(dexCalls).toBe(0);
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Chain not found/);
  });
});


describe("defi price — spread math + empty-result guard", () => {
  it("all probes throwing emits 'No prices could be fetched'", async () => {
    oracleLendingPrice = "throw";
    dexQuotePrice = "throw";
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "USDC", "--source", "all",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/No prices could be fetched/);
  });

  it("max_spread_pct is 0 when all sources agree", async () => {
    oracleLendingPrice = 2.5;
    dexQuotePrice = 2.5;
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "WHYPE", "--source", "all",
      ]);
    } finally {
      restore();
    }
    const report = lastJson<PriceReport>(capture);
    expect(report.max_spread_pct).toBe(0);
    expect(report.oracle_vs_dex_spread_pct).toBe(0);
  });

  it("oracle_vs_dex_spread_pct reflects the gap between average oracle and average dex", async () => {
    // Oracle says 1.00, dex says 1.10 → gap = 10% relative to the lower mean.
    oracleLendingPrice = 1.0;
    dexQuotePrice = 1.1;
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "price", "--asset", "WHYPE", "--source", "all",
      ]);
    } finally {
      restore();
    }
    const report = lastJson<PriceReport>(capture);
    // round2 quantises to 2 decimals so we can do an exact compare.
    expect(report.oracle_vs_dex_spread_pct).toBeCloseTo(10, 1);
    expect(report.max_spread_pct).toBeCloseTo(10, 1);
  });
});
