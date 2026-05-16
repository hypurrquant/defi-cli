// Unit tests for `defi yield compare` + `defi yield scan` (rates-only half of
// commands/yield.ts). The optimize/execute subcommands are tested separately
// in yield-optimize.test.ts to keep each test file under the SSOT 500-line
// guard.
//
// Mock strategy:
//   - vi.mock("@hypurrquant/defi-protocols") stubs createLending/createVault
//     factories; each test sets `getRatesResults` per protocol name to drive
//     the supply_apy / borrow_variable_apy decode branches plus throw paths.
//   - process.exit(1) is swapped with a vi.fn() spy so error-path tests can
//     assert it without terminating the runner.
import { Command } from "commander";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

// Per-protocol rates response. Default empty → adapter throws "no rates"
// (collected as error, not as a no-data miss).
type RateOrThrow =
  | { kind: "ok"; supply_apy: number; borrow_variable_apy: number; utilization: number }
  | { kind: "throw"; message: string };

let getRatesByProto: Map<string, RateOrThrow> = new Map();

vi.mock("@hypurrquant/defi-protocols", () => ({
  createLending: (proto: { name: string; slug: string }) => ({
    name: () => proto.name,
    async getRates(_asset: unknown) {
      const r = getRatesByProto.get(proto.slug);
      if (!r || r.kind === "throw") {
        throw new Error(r?.message ?? "no rates configured");
      }
      return {
        protocol: proto.name,
        asset: "0x0",
        supply_apy: r.supply_apy,
        borrow_variable_apy: r.borrow_variable_apy,
        borrow_stable_apy: 0,
        utilization: r.utilization,
      };
    },
  }),
  createVault: () => ({
    async getVaultInfo() {
      throw new Error("not used by compare/scan");
    },
  }),
}));

const { registerYield } = await import("./yield.js");

interface CapturedOutput {
  out: string[];
  err: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const originalErr = process.stderr.write.bind(process.stderr);
  const capture: CapturedOutput = { out: [], err: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  process.stderr.write = ((chunk: string | Uint8Array) => {
    capture.err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
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

const originalExit = process.exit;
const exitSpy = vi.fn();
beforeEach(() => {
  exitSpy.mockReset();
  process.exit = exitSpy as unknown as typeof process.exit;
  getRatesByProto = new Map();
});
afterAll(() => {
  process.exit = originalExit;
});

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerYield(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
    () => new Executor(false),
  );
  return program;
}

function lastJson<T>(capture: CapturedOutput): T {
  for (const line of [...capture.out].reverse()) {
    const t = line.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t) as T;
      } catch {
        // keep looking
      }
    }
  }
  throw new Error(`no JSON in:\n${capture.out.join("\n")}`);
}

interface ErrorEnvelope {
  error: string;
  failed_probes?: Array<{ protocol: string; type: string; reason: string }>;
}

interface CompareReport {
  asset: string;
  rates: Array<{ protocol: string; supply_apy: number; borrow_variable_apy: number }>;
  best_supply: string | null;
  best_borrow: string | null;
}

interface ScanReport {
  asset: string;
  scan_duration_ms: number;
  chains_scanned: number;
  rates: Array<{ chain: string; protocol: string; supply_apy: number; borrow_variable_apy: number }>;
  best_supply: string | null;
  arb_opportunities: Array<{
    spread_pct: number;
    supply_chain: string;
    supply_protocol: string;
    borrow_chain: string;
    borrow_protocol: string;
    strategy: string;
  }>;
}

describe("defi yield compare", () => {
  it("missing --chain returns the standard error envelope", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "yield", "compare", "--asset", "USDC"]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/--chain is required/);
    // No process.exit on this path — handler returns gracefully.
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("all adapters throwing surfaces as failed_probes with retry hint", async () => {
    // Every lending protocol on hyperevm throws → results.length === 0 with
    // errors > 0 → "Could not collect" envelope including failed_probes.
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "compare", "--asset", "USDC",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Could not collect lending rates/);
    expect(env.error).toMatch(/HYPEREVM_RPC_URL/);
    expect(env.failed_probes).toBeDefined();
    expect(env.failed_probes!.length).toBeGreaterThan(0);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("happy path returns rates sorted by supply_apy with best_supply/best_borrow", async () => {
    // Inject 2 known rates on hyperevm lending protocols. We don't care which
    // exact slugs exist — we set both `felix-morpho` and `hyperlend` (the two
    // lending protocols on hyperevm) to known values. If only one matches, the
    // other contributes an error which is fine — results.length > 0 still
    // hits the happy branch.
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.05, borrow_variable_apy: 0.08, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.02, utilization: 0.4 });
    getRatesByProto.set("hypurrfi", { kind: "ok", supply_apy: 0.03, borrow_variable_apy: 0.05, utilization: 0.3 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "compare", "--asset", "USDC",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<CompareReport>(capture);
    expect(data.asset).toBe("USDC");
    expect(data.rates.length).toBeGreaterThan(0);
    // First entry has the highest supply_apy (sort contract).
    for (let i = 1; i < data.rates.length; i++) {
      expect(data.rates[i - 1].supply_apy).toBeGreaterThanOrEqual(data.rates[i].supply_apy);
    }
    expect(data.best_supply).toBe(data.rates[0].protocol);
    // best_borrow is the protocol with the LOWEST borrow_variable_apy.
    const minBorrow = Math.min(...data.rates.map((r) => r.borrow_variable_apy));
    const expectedBest = data.rates.find((r) => r.borrow_variable_apy === minBorrow)?.protocol;
    expect(data.best_borrow).toBe(expectedBest);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--asset defaults to USDC when not supplied", async () => {
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.05, borrow_variable_apy: 0.08, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.02, utilization: 0.4 });
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "--chain", "hyperevm", "yield", "compare"]);
    } finally {
      restore();
    }
    const data = lastJson<CompareReport>(capture);
    expect(data.asset).toBe("USDC");
  });

  it("unknown asset on chain throws via resolveToken → outer catch → error envelope", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "compare", "--asset", "DEFINITELY_NOT_A_TOKEN_X",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Token not found/i);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("defi yield scan", () => {
  it("with no rates anywhere returns empty arrays + null best_supply", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "yield", "scan", "--asset", "USDC"]);
    } finally {
      restore();
    }
    const data = lastJson<ScanReport>(capture);
    expect(data.asset).toBe("USDC");
    expect(data.rates).toHaveLength(0);
    expect(data.best_supply).toBeNull();
    expect(data.arb_opportunities).toHaveLength(0);
    expect(data.chains_scanned).toBeGreaterThan(0);
  });

  it("multiple rates yields a best_supply and detects arb opportunities", async () => {
    // Inject rates on a handful of protocols across chains. Pick slugs known
    // to exist on at least 2 different chains so we get cross-chain arbs.
    // hyperevm: felix-morpho (low supply, high borrow), hyperlend (high supply)
    // base: aave-v3-base (mid both), compound-v3-base
    // mantle: aave-v3-mantle
    // bnb: aave-v3-bnb, venus-bnb, kinza-bnb
    // monad: morpho-blue-monad
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.02, borrow_variable_apy: 0.10, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.12, borrow_variable_apy: 0.04, utilization: 0.4 });
    getRatesByProto.set("aave-v3-base", { kind: "ok", supply_apy: 0.06, borrow_variable_apy: 0.03, utilization: 0.6 });
    getRatesByProto.set("aave-v3-mantle", { kind: "ok", supply_apy: 0.04, borrow_variable_apy: 0.08, utilization: 0.5 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "yield", "scan", "--asset", "USDC"]);
    } finally {
      restore();
    }
    const data = lastJson<ScanReport>(capture);
    expect(data.rates.length).toBeGreaterThan(0);
    expect(data.best_supply).not.toBeNull();
    // Top entry should be hyperlend at 0.12 (highest supply).
    expect(data.rates[0].supply_apy).toBe(0.12);
    expect(data.best_supply!.toLowerCase()).toContain("hyperlend");
    // At least one arb: e.g., hyperlend supply 0.12 vs aave-v3-base borrow 0.03 → spread 0.09 cross-chain.
    expect(data.arb_opportunities.length).toBeGreaterThan(0);
    // Arbs are sorted by spread descending.
    for (let i = 1; i < data.arb_opportunities.length; i++) {
      expect(data.arb_opportunities[i - 1].spread_pct).toBeGreaterThanOrEqual(
        data.arb_opportunities[i].spread_pct,
      );
    }
  });

  it("arb opportunities are capped at 10", async () => {
    // Saturate every known lending slug so we generate many arb pairs.
    const slugs = [
      "felix-morpho", "hyperlend", "hypurrfi",
      "aave-v3-base", "compound-v3-base",
      "aave-v3-mantle", "aave-v3-bnb", "venus-bnb", "kinza-bnb", "venus-flux-bnb",
      "morpho-blue-monad",
    ];
    for (let i = 0; i < slugs.length; i++) {
      // Stagger supply/borrow to create many positive spreads.
      getRatesByProto.set(slugs[i], {
        kind: "ok",
        supply_apy: 0.20 - i * 0.01,
        borrow_variable_apy: 0.01 + i * 0.005,
        utilization: 0.5,
      });
    }
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "yield", "scan"]);
    } finally {
      restore();
    }
    const data = lastJson<ScanReport>(capture);
    expect(data.arb_opportunities.length).toBeLessThanOrEqual(10);
  });

  it("--asset defaults to USDC when not supplied", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "yield", "scan"]);
    } finally {
      restore();
    }
    const data = lastJson<ScanReport>(capture);
    expect(data.asset).toBe("USDC");
  });
});
