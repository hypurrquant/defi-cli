// Unit tests for `defi lp autopilot` — covers lp.ts lines 1595-1891 which
// remained at 31.82% line coverage in the 2026-05-17 sweep. The autopilot
// handler is the largest still-untested handler in defi-cli and combines
// four code paths that all need wiring:
//
//   1. budget / whitelist validation guards
//   2. per-entry yield scan via the protocol adapter constructors
//   3. dry-run allocation plan (sort, max_allocation_pct cap, 20% reserve)
//   4. broadcast execution (lending = supply; LB / gauge / farming = skip)
//
// We vi.mock the whitelist loader and every adapter constructor that the
// scanner / executor reach for, so the test runs offline and deterministically.
// process.exit() in the error guards is intercepted via vi.spyOn — without
// that, the error-path tests would terminate the vitest worker.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

// ---------------------------------------------------------------------------
// vi.mock surface: must be hoisted, so declared before the dynamic import.
// ---------------------------------------------------------------------------

vi.mock("../whitelist.js", () => ({
  // Default to empty; individual tests override via the mocked symbol below.
  loadWhitelist: vi.fn(() => []),
}));

vi.mock("@hypurrquant/defi-protocols", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypurrquant/defi-protocols")>();
  return {
    ...actual,
    createLending: vi.fn(() => ({
      getRates: vi.fn(async () => ({ supply_apy: 0.05, borrow_apy: 0.1 })),
      buildSupply: vi.fn(async (p: { asset: `0x${string}`; amount: bigint }) => ({
        description: `stub supply ${p.amount} of ${p.asset}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      })),
    })),
    createMerchantMoeLB: vi.fn(() => ({
      discoverRewardedPools: vi.fn(async () => [
        {
          pool: "0x000000000000000000000000000000000000abcd",
          symbolX: "MOE",
          symbolY: "USDC",
          aprPercent: 25,
          stopped: false,
        },
      ]),
    })),
    createKittenSwapFarming: vi.fn(() => ({
      discoverFarmingPools: vi.fn(async () => [
        { pool: "0x000000000000000000000000000000000000beef", active: true },
      ]),
    })),
    createGauge: vi.fn(() => ({
      discoverGaugedPools: vi.fn(async () => [
        {
          pool: "0x000000000000000000000000000000000000cafe",
          token0: "TOK0",
          token1: "TOK1",
        },
      ]),
    })),
  };
});

const { loadWhitelist } = await import("../whitelist.js");
const mockedLoadWhitelist = loadWhitelist as unknown as ReturnType<typeof vi.fn>;

const { registerLP } = await import("./lp.js");

// ---------------------------------------------------------------------------
// Console capture + program builder helpers (mirror lp-positions.test.ts).
// ---------------------------------------------------------------------------

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
  // Note: we deliberately do NOT declare `--chain` on the root program here.
  // The `lp autopilot` subcommand defines its own `--chain` flag (it filters
  // the whitelist, not the executor's target chain), and commander would let
  // a root-level `--chain` consume the value before the subcommand sees it.
  // Other lp subcommands (positions, etc.) read `parent.opts().chain`, but
  // this file only exercises autopilot — so omitting the root flag avoids
  // the collision without affecting any production code path.
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerLP(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
    () => new Executor(false),
  );
  return program;
}

// process.exit(1) inside the autopilot guards would terminate the vitest
// worker; intercept it so the test can assert on the captured envelope and
// continue. The thrown sentinel is caught inside the `try`/`finally` below.
class ProcessExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code ?? 0})`);
  }
}

function spyOnExit(): { restore: () => void } {
  const spy = vi
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      throw new ProcessExitSignal(code);
    }) as never);
  return {
    restore: () => spy.mockRestore(),
  };
}

const ENV_KEYS = ["DEFI_WALLET_ADDRESS", "DEFI_PRIVATE_KEY"] as const;
let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  process.env["DEFI_WALLET_ADDRESS"] = "0x000000000000000000000000000000000000dEaD";
  // Reset whitelist mock so each test starts with an empty list unless it
  // explicitly overrides via mockedLoadWhitelist.mockReturnValue(...).
  mockedLoadWhitelist.mockReturnValue([]);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

async function runAutopilot(args: string[]): Promise<CapturedOutput> {
  const program = buildProgram();
  const { capture, restore } = captureConsole();
  const exit = spyOnExit();
  try {
    try {
      await program.parseAsync(["node", "defi", ...args]);
    } catch (e) {
      if (!(e instanceof ProcessExitSignal)) throw e;
    }
  } finally {
    restore();
    exit.restore();
  }
  return capture;
}

// ---------------------------------------------------------------------------
// Error guards (budget / whitelist / chain filter)
// ---------------------------------------------------------------------------

describe("defi lp autopilot — guards", () => {
  it("rejects an invalid budget (NaN) with a structured error and exits 1", async () => {
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "not-a-number",
    ]);
    const env = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(env.error).toMatch(/Invalid budget/i);
  });

  it("rejects a zero budget with a structured error and exits 1", async () => {
    const capture = await runAutopilot(["--json", "lp", "autopilot", "--budget", "0"]);
    const env = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(env.error).toMatch(/Invalid budget/i);
  });

  it("rejects a negative budget", async () => {
    const capture = await runAutopilot(["--json", "lp", "autopilot", "--budget", "-100"]);
    const env = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(env.error).toMatch(/Invalid budget/i);
  });

  it("errors when the whitelist is empty (no pools.toml)", async () => {
    // mockedLoadWhitelist already returns [] via beforeEach reset.
    const capture = await runAutopilot(["--json", "lp", "autopilot", "--budget", "1000"]);
    const env = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(env.error).toMatch(/No pools whitelisted/i);
  });

  it("errors when --chain filter excludes every whitelist entry", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 50,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
      "--chain",
      "monad",
    ]);
    const env = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(env.error).toMatch(/No whitelisted pools found for chain 'monad'/i);
  });
});

// ---------------------------------------------------------------------------
// Happy path: dry-run allocation plan
// ---------------------------------------------------------------------------

describe("defi lp autopilot — dry-run allocation plan", () => {
  it("builds a plan with 20% reserve and lending entry APY scan", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 80,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
    ]);

    interface Plan {
      budget_usd: number;
      deployable_usd: number;
      reserve_pct: number;
      allocations: Array<Record<string, unknown>>;
      execution: string;
    }
    const plan = JSON.parse(capture.json.join("\n")) as Plan;

    expect(plan.budget_usd).toBe(1000);
    expect(plan.reserve_pct).toBe(20);
    expect(plan.deployable_usd).toBe(800);
    expect(plan.execution).toBe("dry_run");
    // Two entries: the lending allocation, then the reserve sentinel.
    expect(plan.allocations.length).toBe(2);

    const lending = plan.allocations[0]!;
    expect(lending["protocol"]).toBe("felix-morpho");
    expect(lending["type"]).toBe("lending");
    // 80% cap is above the 80% deployable → spends the entire deployable.
    expect(lending["amount_usd"]).toBe(800);
    expect(lending["apy"]).toBe(0.05);
    expect(lending["asset"]).toBe("USDC");

    const reserve = plan.allocations[1]!;
    expect(reserve["reserve"]).toBe(true);
    expect(reserve["amount_usd"]).toBe(200);
  });

  it("caps allocation at max_allocation_pct and rolls the remainder into reserve", async () => {
    // max_allocation_pct = 30 → can only take $300 of the $800 deployable.
    // Remaining $500 falls back into the reserve entry alongside the base 20%.
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 30,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
    ]);
    const plan = JSON.parse(capture.json.join("\n")) as {
      allocations: Array<Record<string, unknown>>;
    };

    const lending = plan.allocations[0]!;
    expect(lending["amount_usd"]).toBe(300);

    const reserve = plan.allocations.find((a) => a["reserve"] === true)!;
    // 20% base reserve ($200) + leftover ($500) = $700
    expect(reserve["amount_usd"]).toBe(700);
  });

  it("attaches scan_error when protocol slug is not registered on the chain", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "not-a-real-protocol-slug",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 50,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
    ]);
    const plan = JSON.parse(capture.json.join("\n")) as {
      allocations: Array<Record<string, unknown>>;
    };
    const entry = plan.allocations[0]!;
    expect(entry["scan_error"]).toMatch(/Protocol not found/i);
  });

  it("attaches scan_error for an unknown chain in the whitelist entry", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "totally-fake-chain",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 50,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
    ]);
    const plan = JSON.parse(capture.json.join("\n")) as {
      allocations: Array<Record<string, unknown>>;
    };
    const entry = plan.allocations[0]!;
    expect(entry["scan_error"]).toMatch(/Unknown chain/i);
  });

  it("--chain filter narrows the plan to entries on the requested chain", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 50,
      },
      {
        chain: "monad",
        protocol: "should-not-appear",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 50,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
      "--chain",
      "hyperevm",
    ]);
    const plan = JSON.parse(capture.json.join("\n")) as {
      allocations: Array<Record<string, unknown>>;
    };
    // 1 lending + 1 reserve entry, the monad row is filtered out.
    expect(plan.allocations.length).toBe(2);
    expect(plan.allocations[0]!["chain"]).toBe("hyperevm");
  });

  it("marks unsupported entry types with scan_error", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        // `swap` is not one of the four handled types (lending/lb/farming/gauge)
        // so the scanner returns the generic "Unsupported entry type" envelope.
        protocol: "anything",
        type: "swap" as never,
        max_allocation_pct: 50,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
    ]);
    const plan = JSON.parse(capture.json.join("\n")) as {
      allocations: Array<Record<string, unknown>>;
    };
    const entry = plan.allocations[0]!;
    expect(entry["scan_error"]).toMatch(/Unsupported entry type/i);
  });
});

// ---------------------------------------------------------------------------
// Broadcast execution path
// ---------------------------------------------------------------------------

describe("defi lp autopilot — broadcast execution", () => {
  it("executes lending allocations by calling buildSupply + executor.execute", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 80,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
      "--broadcast",
    ]);

    // Two JSON envelopes: the plan, then the execution_results.
    expect(capture.json.length).toBeGreaterThanOrEqual(2);
    const plan = JSON.parse(capture.json[0]!) as {
      execution: string;
    };
    expect(plan.execution).toBe("broadcast");

    const execEnv = JSON.parse(capture.json[capture.json.length - 1]!) as {
      execution_results: Array<Record<string, unknown>>;
    };
    expect(execEnv.execution_results).toBeDefined();
    expect(execEnv.execution_results.length).toBe(1);
    const exec = execEnv.execution_results[0]!;
    expect(exec["protocol"]).toBe("felix-morpho");
    // Executor is dry-run (broadcast=false on the constructor) → status reflects
    // the simulated path, but the important thing is that we reached
    // executor.execute and got an exec_status field back.
    expect(exec["exec_status"]).toBeDefined();
  });

  it("warns and skips LB / farming / gauge entries (non-lending types) during broadcast", async () => {
    mockedLoadWhitelist.mockReturnValue([
      {
        chain: "hyperevm",
        protocol: "merchant-moe",
        pool: "MOE/USDC",
        type: "lb",
        max_allocation_pct: 80,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
      "--broadcast",
    ]);

    const execEnv = JSON.parse(capture.json[capture.json.length - 1]!) as {
      execution_results: Array<Record<string, unknown>>;
    };
    const exec = execEnv.execution_results[0]!;
    expect(exec["exec_status"]).toBe("skipped");
    expect(exec["exec_note"]).toMatch(/requires manual token preparation/i);
  });

  it("skips and reports unknown chains during broadcast without aborting the loop", async () => {
    mockedLoadWhitelist.mockReturnValue([
      // First entry: unknown chain. Should be reported but not stop the run.
      // Second entry: a valid lending row that still gets attempted.
      {
        chain: "ghost-chain",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 40,
      },
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        type: "lending",
        max_allocation_pct: 40,
      },
    ]);
    const capture = await runAutopilot([
      "--json",
      "lp",
      "autopilot",
      "--budget",
      "1000",
      "--broadcast",
    ]);
    const execEnv = JSON.parse(capture.json[capture.json.length - 1]!) as {
      execution_results: Array<Record<string, unknown>>;
    };
    // 2 allocations attempted; one skipped (unknown chain), one executed.
    expect(execEnv.execution_results.length).toBe(2);
    const ghost = execEnv.execution_results.find(
      (r) => r["chain"] === "ghost-chain",
    );
    expect(ghost?.["exec_status"]).toBe("skipped");
    expect(ghost?.["exec_error"]).toMatch(/Unknown chain/i);
  });
});
