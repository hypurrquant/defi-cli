// Unit tests for `defi portfolio` (show / snapshot / pnl / history).
// Mocks: multicallRead (defi-core), createPublicClient (viem),
// takeSnapshot/saveSnapshot/loadSnapshots/calculatePnL (portfolio-tracker).
// Registry stays real so chain/token resolution is exercised.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import { parseOutputMode } from "../output.js";

// ── multicall response control ─────────────────────────────────────

function u256(n: bigint): Hex {
  return `0x${n.toString(16).padStart(64, "0")}` as Hex;
}

let multicallShouldThrow = false;
let multicallResponse: (Hex | null)[] | null = null;
let lastMulticallCalls: Array<[Address, Hex]> = [];

vi.mock("@hypurrquant/defi-core", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("@hypurrquant/defi-core");
  return {
    ...real,
    multicallRead: async (_rpc: string, calls: Array<[Address, Hex]>) => {
      lastMulticallCalls = calls;
      if (multicallShouldThrow) throw new Error("simulated multicall RPC failure");
      if (multicallResponse) {
        // Pad with zeros if injected response is shorter than calls.
        const out = multicallResponse.slice(0, calls.length);
        while (out.length < calls.length) out.push(u256(0n));
        return out;
      }
      return calls.map(() => u256(0n));
    },
  };
});

// ── viem stub for the native-balance eth_getBalance leg ────────────

let nativeBalance: bigint = 0n;

vi.mock("viem", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("viem");
  return {
    ...real,
    createPublicClient: () => ({
      getBalance: async () => nativeBalance,
    }),
  };
});

// ── portfolio-tracker stub ─────────────────────────────────────────

interface MockSnapshot {
  timestamp: number;
  chain: string;
  wallet: string;
  total_value_usd: number;
  tokens: unknown[];
  defi_positions: unknown[];
}

let takeSnapshotResult: MockSnapshot | null = null;
let takeSnapshotShouldThrow = false;
let saveSnapshotPath = "/tmp/fake-snapshot.json";
let loadSnapshotsResult: MockSnapshot[] = [];
let calculatePnLResult = { pnl_usd: 0, pnl_pct: 0, start_value_usd: 0, end_value_usd: 0 };

vi.mock("../portfolio-tracker.js", () => ({
  takeSnapshot: async (chain: string, wallet: string): Promise<MockSnapshot> => {
    if (takeSnapshotShouldThrow) throw new Error("simulated snapshot RPC failure");
    return (
      takeSnapshotResult ?? {
        timestamp: Date.now(),
        chain,
        wallet,
        total_value_usd: 100,
        tokens: [{ symbol: "USDC", balance: "100" }],
        defi_positions: [],
      }
    );
  },
  saveSnapshot: () => saveSnapshotPath,
  loadSnapshots: () => loadSnapshotsResult,
  calculatePnL: () => calculatePnLResult,
}));

const { registerPortfolio } = await import("./portfolio.js");

interface CapturedOutput {
  out: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const capture: CapturedOutput = { out: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  return {
    capture,
    restore: () => {
      console.log = originalLog;
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
  registerPortfolio(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
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
  throw new Error(`no JSON found in:\n${capture.out.join("\n")}`);
}

const FAKE_ADDR = "0x000000000000000000000000000000000000dEaD";

const SNAPSHOT_ADDR_KEY = "DEFI_WALLET_ADDRESS";
let envSnap: string | undefined;
beforeEach(() => {
  envSnap = process.env[SNAPSHOT_ADDR_KEY];
  delete process.env[SNAPSHOT_ADDR_KEY];
  multicallShouldThrow = false;
  multicallResponse = null;
  lastMulticallCalls = [];
  nativeBalance = 0n;
  takeSnapshotResult = null;
  takeSnapshotShouldThrow = false;
  saveSnapshotPath = "/tmp/fake-snapshot.json";
  loadSnapshotsResult = [];
  calculatePnLResult = { pnl_usd: 0, pnl_pct: 0, start_value_usd: 0, end_value_usd: 0 };
});
afterEach(() => {
  if (envSnap === undefined) delete process.env[SNAPSHOT_ADDR_KEY];
  else process.env[SNAPSHOT_ADDR_KEY] = envSnap;
});

interface ErrorEnvelope {
  error: string;
}

interface PortfolioShow {
  address: string;
  chain: string;
  total_value_usd: string;
  token_balances: Array<{ symbol: string; balance: string; value_usd: string | null }>;
  lending_positions: unknown[];
  native_balance: string;
  native_value_usd: string;
}

describe("defi portfolio show — validation", () => {
  it("missing --chain emits the standard requireChain error", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "portfolio", "show", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/--chain is required/);
  });

  it("missing address (no --address + no DEFI_WALLET_ADDRESS) errors", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm", "portfolio", "show",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/--address required/);
  });

  it("invalid address shape is rejected before any RPC call", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "show", "--address", "0xNOTHEX",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Invalid address/);
    expect(lastMulticallCalls).toHaveLength(0);
  });
});

describe("defi portfolio show — multicall behaviour", () => {
  it("multicall throwing surfaces as a clean error envelope (not a crash)", async () => {
    multicallShouldThrow = true;
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "show", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/Multicall failed: simulated multicall RPC failure/);
  });

  it("all-zero multicall renders empty token_balances + lending_positions", async () => {
    // multicallResponse left null → default all-zero. Native balance 0 too.
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "show", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<PortfolioShow>(capture);
    expect(data.address.toLowerCase()).toBe(FAKE_ADDR.toLowerCase());
    expect(data.token_balances).toHaveLength(0);
    expect(data.lending_positions).toHaveLength(0);
    expect(data.total_value_usd).toBe("0.00");
  });

  it("USDC balance + native balance get aggregated into total_value_usd", async () => {
    // Build a response that injects 1 USDC (1_000_000 wei at 6 decimals = $1)
    // into the first balanceOf slot. All other balances + lending + prices
    // stay zero (handler ignores zero balances + missing prices).
    // The slot of USDC in calls depends on the order registry.tokens returns
    // them. We can't easily predict that without inspecting, so we set ALL
    // balance slots to 1_000_000 and rely on the USD-symbol shortcut
    // (USDC/USDT0/feUSD/etc. all match symbolUpper.includes("USD")) for
    // 1:1 pricing — every non-USD token will be priced at null (no oracle
    // price injected) and contribute 0.
    multicallResponse = Array.from({ length: 200 }, () => u256(1_000_000n));
    nativeBalance = 0n;
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "show", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<PortfolioShow>(capture);
    // At least one USD-symbol token must show up with a non-null value.
    const usdRows = data.token_balances.filter(
      (t) => t.symbol.toUpperCase().includes("USD") && t.value_usd !== null,
    );
    expect(usdRows.length).toBeGreaterThan(0);
    // Total must be > 0 (the USD stablecoins contribute).
    expect(parseFloat(data.total_value_usd)).toBeGreaterThan(0);
  });

  it("non-zero native balance is added separately via createPublicClient.getBalance", async () => {
    // 1.5 native (18 decimals) — no oracle native price injected so
    // native_value_usd = 0, but native_balance must reflect the wei.
    nativeBalance = 1_500_000_000_000_000_000n;
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "show", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<PortfolioShow>(capture);
    expect(parseFloat(data.native_balance)).toBeCloseTo(1.5, 5);
  });
});

describe("defi portfolio snapshot", () => {
  it("missing address errors before takeSnapshot fires", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm", "portfolio", "snapshot",
      ]);
    } finally {
      restore();
    }
    const env = lastJson<ErrorEnvelope>(capture);
    expect(env.error).toMatch(/--address required/);
  });

  it("invalid address errors before takeSnapshot fires", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "snapshot", "--address", "0xNOPE",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/Invalid address/);
  });

  it("happy path returns the saved filepath + snapshot summary", async () => {
    takeSnapshotResult = {
      timestamp: 1_700_000_000_000,
      chain: "hyperevm",
      wallet: FAKE_ADDR,
      total_value_usd: 42.5,
      tokens: [{ symbol: "USDC" }, { symbol: "HYPE" }],
      defi_positions: [{ protocol: "felix-morpho" }],
    };
    saveSnapshotPath = "/tmp/snap-1700000000000.json";
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "snapshot", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      saved: string;
      total_value_usd: string;
      token_count: number;
      defi_position_count: number;
    }>(capture);
    expect(data.saved).toBe(saveSnapshotPath);
    expect(data.total_value_usd).toBe("42.50");
    expect(data.token_count).toBe(2);
    expect(data.defi_position_count).toBe(1);
  });

  it("takeSnapshot throwing surfaces as an error envelope (not a crash)", async () => {
    takeSnapshotShouldThrow = true;
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "snapshot", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/simulated snapshot RPC failure/);
  });
});

describe("defi portfolio pnl", () => {
  it("with zero snapshots, instructs the user to run snapshot first", async () => {
    loadSnapshotsResult = [];
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "pnl", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/Run `portfolio snapshot` first/);
  });

  it("--since with no older snapshot returns the cutoff error", async () => {
    loadSnapshotsResult = [
      { timestamp: Date.now(), chain: "hyperevm", wallet: FAKE_ADDR, total_value_usd: 0, tokens: [], defi_positions: [] },
    ];
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "pnl", "--address", FAKE_ADDR, "--since", "24",
      ]);
    } finally {
      restore();
    }
    expect(lastJson<ErrorEnvelope>(capture).error).toMatch(/No snapshot found older than 24 hours/);
  });

  it("happy path formats pnl_usd/pnl_pct to fixed decimals", async () => {
    loadSnapshotsResult = [
      { timestamp: Date.now() - 3600_000, chain: "hyperevm", wallet: FAKE_ADDR, total_value_usd: 100, tokens: [], defi_positions: [] },
    ];
    takeSnapshotResult = {
      timestamp: Date.now(),
      chain: "hyperevm",
      wallet: FAKE_ADDR,
      total_value_usd: 110,
      tokens: [],
      defi_positions: [],
    };
    calculatePnLResult = { pnl_usd: 10, pnl_pct: 0.1, start_value_usd: 100, end_value_usd: 110 };

    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "pnl", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      pnl_usd: string;
      pnl_pct: string;
      start_value_usd: string;
      end_value_usd: string;
    }>(capture);
    expect(data.pnl_usd).toBe("10.00");
    expect(data.pnl_pct).toBe("0.1000");
    expect(data.start_value_usd).toBe("100.00");
    expect(data.end_value_usd).toBe("110.00");
  });
});

describe("defi portfolio history", () => {
  it("empty result emits the 'No snapshots found' message envelope", async () => {
    loadSnapshotsResult = [];
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "history", "--address", FAKE_ADDR,
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{ message: string }>(capture);
    expect(data.message).toMatch(/No snapshots found/);
  });

  it("populated history maps each snapshot to a formatted summary", async () => {
    loadSnapshotsResult = [
      { timestamp: 1_700_000_000_000, chain: "hyperevm", wallet: FAKE_ADDR, total_value_usd: 100, tokens: [{}, {}], defi_positions: [{}] },
      { timestamp: 1_700_086_400_000, chain: "hyperevm", wallet: FAKE_ADDR, total_value_usd: 105, tokens: [{}], defi_positions: [] },
    ];
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "portfolio", "history", "--address", FAKE_ADDR, "--limit", "5",
      ]);
    } finally {
      restore();
    }
    const data = lastJson<{
      snapshots: Array<{
        timestamp: string;
        total_value_usd: string;
        token_count: number;
        defi_position_count: number;
      }>;
    }>(capture);
    expect(data.snapshots).toHaveLength(2);
    expect(data.snapshots[0]?.total_value_usd).toBe("100.00");
    expect(data.snapshots[0]?.token_count).toBe(2);
    expect(data.snapshots[1]?.defi_position_count).toBe(0);
  });
});
