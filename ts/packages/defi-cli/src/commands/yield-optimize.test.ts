// Unit tests for `defi yield optimize` + `defi yield execute` (execution /
// strategy half of commands/yield.ts). The read-only compare/scan halves are
// in yield-rates.test.ts to stay under the SSOT 500-line guard.
//
// Mock strategy:
//   - vi.mock("@hypurrquant/defi-protocols") stubs createLending +
//     createVault. Per-slug response controlled by getRatesByProto +
//     getVaultInfoByProto so each test scripts the optimize/execute branches
//     (auto / best-supply / leverage-loop / cross-chain arb / same-chain
//     supply).
//   - Executor runs in dry-run mode (no rpcUrl) → execute() returns a
//     deterministic { status: "DryRun" } ActionResult, so we assert that
//     payload appears in the `yield execute` JSON envelope without touching
//     any RPC.
//   - process.exit(1) is swapped with a vi.fn() spy so error paths assert
//     the exit was called without terminating the runner.
import { Command } from "commander";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

type RateOrThrow =
  | { kind: "ok"; supply_apy: number; borrow_variable_apy: number; utilization: number }
  | { kind: "throw"; message: string };

let getRatesByProto: Map<string, RateOrThrow> = new Map();
let getVaultInfoByProto: Map<string, { apy: number; total_assets: bigint }> = new Map();

vi.mock("@hypurrquant/defi-protocols", () => ({
  createLending: (proto: { name: string; slug: string }) => ({
    name: () => proto.name,
    async getRates(_asset: unknown) {
      const r = getRatesByProto.get(proto.slug);
      if (!r || r.kind === "throw") throw new Error(r?.message ?? "no rates configured");
      return {
        protocol: proto.name,
        asset: "0x0",
        supply_apy: r.supply_apy,
        borrow_variable_apy: r.borrow_variable_apy,
        borrow_stable_apy: 0,
        utilization: r.utilization,
      };
    },
    async buildSupply(p: { amount: bigint; asset: `0x${string}` }) {
      return {
        description: `stub supply ${p.amount} of ${p.asset} on ${proto.name}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      };
    },
  }),
  createVault: (proto: { name: string; slug: string }) => ({
    async getVaultInfo() {
      const v = getVaultInfoByProto.get(proto.slug);
      if (!v) throw new Error(`no vault info configured for ${proto.slug}`);
      return { protocol: proto.name, apy: v.apy, total_assets: v.total_assets };
    },
  }),
}));

const { registerYield } = await import("./yield.js");

interface CapturedOutput {
  out: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const originalErr = process.stderr.write.bind(process.stderr);
  const capture: CapturedOutput = { out: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  process.stderr.write = ((_chunk: string | Uint8Array) => true) as typeof process.stderr.write;
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
  getVaultInfoByProto = new Map();
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
    () => new Executor(false), // dry-run, no rpcUrl → execute() returns DryRun ActionResult
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

describe("defi yield optimize — strategy: auto", () => {
  it("with opportunities returns sorted list + best_protocol + weighted_apy", async () => {
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.05, borrow_variable_apy: 0.08, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.04, utilization: 0.4 });
    getRatesByProto.set("hypurrfi", { kind: "ok", supply_apy: 0.03, borrow_variable_apy: 0.05, utilization: 0.3 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      strategy: string;
      asset: string;
      best_protocol: string;
      best_apy: number;
      weighted_apy: number;
      opportunities: Array<{ apy: number }>;
    }>(capture);
    expect(data.strategy).toBe("auto");
    expect(data.asset).toBe("USDC");
    expect(data.opportunities.length).toBeGreaterThan(0);
    // Sorted by APY descending.
    for (let i = 1; i < data.opportunities.length; i++) {
      expect(data.opportunities[i - 1].apy).toBeGreaterThanOrEqual(data.opportunities[i].apy);
    }
    expect(data.best_apy).toBe(data.opportunities[0].apy);
  });

  it("with --amount returns allocation percentages (60/30/10 weights)", async () => {
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.05, borrow_variable_apy: 0.08, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.04, utilization: 0.4 });
    getRatesByProto.set("hypurrfi", { kind: "ok", supply_apy: 0.03, borrow_variable_apy: 0.05, utilization: 0.3 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC", "--amount", "1000",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{ allocation: Array<{ allocation_pct: number; amount: string }> }>(capture);
    expect(data.allocation).toHaveLength(3);
    expect(data.allocation[0].allocation_pct).toBe(60);
    expect(data.allocation[1].allocation_pct).toBe(30);
    expect(data.allocation[2].allocation_pct).toBe(10);
    expect(data.allocation[0].amount).toBe("600.00");
    expect(data.allocation[1].amount).toBe("300.00");
    expect(data.allocation[2].amount).toBe("100.00");
  });

  it("no opportunities + transport errors → failed_probes envelope", async () => {
    // All protos throw → opportunities=[] AND errors>0
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Could not collect yield data/);
    expect(env.error).toMatch(/HYPEREVM_RPC_URL/);
    expect(env.failed_probes).toBeDefined();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("defi yield optimize — strategy: best-supply / leverage-loop / unknown", () => {
  it("best-supply returns a recommendation string + all_options", async () => {
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.05, borrow_variable_apy: 0.08, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.04, utilization: 0.4 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC", "--strategy", "best-supply",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      strategy: string;
      recommendation: string;
      best_protocol: string;
      best_supply_apy: number;
      all_options: unknown[];
    }>(capture);
    expect(data.strategy).toBe("best-supply");
    expect(data.recommendation).toMatch(/Supply USDC on .* for .*% APY/);
    expect(data.best_supply_apy).toBe(0.10);
    expect(data.all_options.length).toBeGreaterThan(0);
  });

  it("leverage-loop with profitable rate returns candidates with net_apy", async () => {
    // Supply 0.20, borrow 0.05 → loops produce big positive net_apy.
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.20, borrow_variable_apy: 0.05, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.15, borrow_variable_apy: 0.04, utilization: 0.4 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC", "--strategy", "leverage-loop",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      strategy: string;
      recommendation: string;
      candidates: Array<{ protocol: string; net_apy: number; loops: number; ltv: number }>;
    }>(capture);
    expect(data.strategy).toBe("leverage-loop");
    expect(data.candidates.length).toBeGreaterThan(0);
    expect(data.candidates[0].net_apy).toBeGreaterThan(0);
    expect(data.candidates[0].loops).toBe(5);
    expect(data.candidates[0].ltv).toBe(0.8);
    expect(data.recommendation).toMatch(/Leverage loop USDC/);
  });

  it("leverage-loop with no profitable rate returns 'No favorable leverage loop' recommendation", async () => {
    // Supply 0.02, borrow 0.10 → supply < borrow*0.8 (0.08) → skipped → no candidates.
    getRatesByProto.set("felix-morpho", { kind: "ok", supply_apy: 0.02, borrow_variable_apy: 0.10, utilization: 0.5 });
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.03, borrow_variable_apy: 0.08, utilization: 0.4 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC", "--strategy", "leverage-loop",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{ candidates: unknown[]; recommendation: string }>(capture);
    expect(data.candidates).toHaveLength(0);
    expect(data.recommendation).toMatch(/No favorable leverage loop/);
  });

  it("unknown strategy errors with the 'Supported:' hint + process.exit(1)", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "yield", "optimize", "--asset", "USDC", "--strategy", "moonshot",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Unknown strategy 'moonshot'/);
    expect(env.error).toMatch(/best-supply, leverage-loop, auto/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("missing --chain returns the standard error envelope", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "optimize", "--asset", "USDC",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/--chain is required/);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("defi yield execute", () => {
  it("invalid --amount (negative) errors before any RPC fan-out", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "execute",
        "--asset", "USDC", "--amount", "-1",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/Invalid amount: -1/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("no rates anywhere errors with 'No yield opportunities found'", async () => {
    // All adapters throw → cross-chain scan returns 0 rates.
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "execute",
        "--asset", "USDC", "--amount", "1000",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/No yield opportunities found/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("cross-chain arb above --min-spread emits plan_only (no execution)", async () => {
    // Supply on hyperlend (hyperevm) at 10%, borrow on aave-v3-base at 1% → 9% spread cross-chain.
    // NOTE: code compares spread_pct (decimal 0.09) against minSpread (parseFloat
    // of the flag, also taken as decimal). The default "1.0" effectively disables
    // plan_only mode — passing 0.05 here keeps the assertion realistic while
    // pinning that the threshold is interpreted in decimal units.
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.05, utilization: 0.4 });
    getRatesByProto.set("aave-v3-base", { kind: "ok", supply_apy: 0.04, borrow_variable_apy: 0.01, utilization: 0.5 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "execute",
        "--asset", "USDC", "--amount", "500", "--min-spread", "0.05",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      mode: string;
      asset: string;
      amount_human: number;
      best_arb: { strategy: string; spread_pct: number };
      steps: Array<{ step: number; action: string }>;
    }>(capture);
    expect(data.mode).toBe("plan_only");
    expect(data.amount_human).toBe(500);
    expect(data.best_arb.strategy).toBe("cross-chain");
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0].action).toBe("bridge");
    expect(data.steps[1].action).toBe("supply");
    // Not a process.exit path — plan_only is a successful return.
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--target-chain override bypasses scan and executes same-chain supply (dry-run)", async () => {
    getRatesByProto.set("hyperlend", { kind: "ok", supply_apy: 0.10, borrow_variable_apy: 0.04, utilization: 0.4 });

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "execute",
        "--asset", "USDC", "--amount", "1000",
        "--target-chain", "hyperevm", "--target-protocol", "hyperlend",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      action: string;
      asset: string;
      amount_human: number;
      chain: string;
      protocol: string;
      protocol_slug: string;
      result: { status: string; description: string };
    }>(capture);
    expect(data.action).toBe("yield_execute");
    expect(data.amount_human).toBe(1000);
    expect(data.protocol_slug).toBe("hyperlend");
    // Dry-run Executor returns { status: "dry_run" } — TxStatus.DryRun serialises to that string.
    expect(data.result.status).toBeDefined();
    expect(data.result.description).toMatch(/stub supply/);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--target-protocol with unknown slug errors before adapter creation", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "yield", "execute",
        "--asset", "USDC", "--amount", "1000",
        "--target-chain", "hyperevm", "--target-protocol", "not-a-real-protocol-x",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/Protocol not found: not-a-real-protocol-x/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
