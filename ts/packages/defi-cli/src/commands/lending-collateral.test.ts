// Unit tests for `defi lending supply-collateral` and `defi lending
// withdraw-collateral` — the two Morpho-Blue-only subcommands at
// lending.ts:289-350 that were uncovered (53.28% line coverage) in the
// 2026-05-17 sweep.
//
// Both subcommands feature-detect the adapter:
//   1. if `adapter.buildSupplyCollateral` is not a function → error envelope
//   2. otherwise → build tx + executor.execute + print result
//
// We cover both paths. The default vi.mock returns a Morpho-shaped stub
// that exposes the collateral builders; a negative-path test swaps the
// mock for a stub WITHOUT those methods to exercise the feature-detect
// envelope.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maxUint256 } from "viem";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

// ---------------------------------------------------------------------------
// Default mock: Morpho-Blue-shaped adapter that exposes the collateral
// builders. Each builder echoes the parsed amount + asset back as the
// description so we can pin the parser → adapter wiring without a real RPC.
// ---------------------------------------------------------------------------

vi.mock("@hypurrquant/defi-protocols", () => {
  const morphoStub = {
    name: () => "stub-morpho",
    async getRates() {
      return {} as never;
    },
    async getUserPosition() {
      return {} as never;
    },
    async buildSupply() {
      return {} as never;
    },
    async buildBorrow() {
      return {} as never;
    },
    async buildRepay() {
      return {} as never;
    },
    async buildWithdraw() {
      return {} as never;
    },
    async buildSupplyCollateral(p: {
      amount: bigint;
      asset: `0x${string}`;
      market_id: `0x${string}`;
    }) {
      return {
        description: `stub supplyCollateral ${p.amount} of ${p.asset} (market ${p.market_id})`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 200_000,
      };
    },
    async buildWithdrawCollateral(p: {
      amount: bigint;
      asset: `0x${string}`;
      market_id: `0x${string}`;
    }) {
      return {
        description: `stub withdrawCollateral ${p.amount} of ${p.asset} (market ${p.market_id})`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 200_000,
      };
    },
  };
  return {
    createLending: vi.fn(() => morphoStub),
  };
});

const { createLending } = await import("@hypurrquant/defi-protocols");
const mockedCreateLending = createLending as unknown as ReturnType<typeof vi.fn>;

const { registerLending } = await import("./lending.js");

// ---------------------------------------------------------------------------
// Console capture + program builder (same pattern as lending.test.ts).
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
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerLending(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
    () => new Executor(false),
  );
  return program;
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
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  // Restore the default Morpho stub so a test that swapped it in via
  // mockReturnValueOnce doesn't leak into the next test.
  mockedCreateLending.mockClear();
});

const PROTOCOL = "felix-morpho";
const ASSET = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";
// Morpho marketId — must be 32-byte hex per resolveMarketInput; we use a
// deterministic stub value so the regex passes through verbatim.
const MARKET_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

// ---------------------------------------------------------------------------
// supply-collateral — happy path + edge cases
// ---------------------------------------------------------------------------

describe("defi lending supply-collateral — happy path", () => {
  it("echoes the parsed amount and market_id through buildSupplyCollateral", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "supply-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "12345",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { description?: string };
    expect(data.description).toContain("12345");
    expect(data.description).toContain(MARKET_ID);
    expect(data.description).toMatch(/supplyCollateral/);
  });

  it("supply-collateral --amount max maps to type(uint256).max", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "supply-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "max",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { description?: string };
    expect(data.description).toContain(String(maxUint256));
  });

  it("supply-collateral honors --on-behalf-of (no exception even with arbitrary addr)", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "supply-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "1",
        "--market",
        MARKET_ID,
        "--on-behalf-of",
        "0x000000000000000000000000000000000000bEEF",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { description?: string };
    expect(data.description).toMatch(/supplyCollateral/);
  });
});

// ---------------------------------------------------------------------------
// withdraw-collateral — happy path
// ---------------------------------------------------------------------------

describe("defi lending withdraw-collateral — happy path", () => {
  it("echoes the parsed amount and market_id through buildWithdrawCollateral", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "withdraw-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "99999",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { description?: string };
    expect(data.description).toContain("99999");
    expect(data.description).toContain(MARKET_ID);
    expect(data.description).toMatch(/withdrawCollateral/);
  });

  it("withdraw-collateral --amount max maps to type(uint256).max", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "withdraw-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "max",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { description?: string };
    expect(data.description).toContain(String(maxUint256));
  });
});

// ---------------------------------------------------------------------------
// Feature-detection error path — adapter that does NOT expose the collateral
// builders (e.g. Aave V3 / Compound V2). The handler should print a clear
// error envelope explaining which forks support the subcommand.
// ---------------------------------------------------------------------------

describe("defi lending supply-collateral — feature detect (non-Morpho adapter)", () => {
  it("emits a clear error envelope when adapter lacks buildSupplyCollateral", async () => {
    // Swap the default Morpho stub for an Aave-shaped stub that omits the
    // collateral builders. The handler's `typeof !== "function"` guard
    // should fire and short-circuit before reaching adapter.buildSupplyCollateral.
    mockedCreateLending.mockReturnValueOnce({
      name: () => "aave-shaped-stub",
      // intentionally NO buildSupplyCollateral / buildWithdrawCollateral
    });

    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "supply-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "1",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toMatch(/does not implement buildSupplyCollateral/i);
    // The error should hint at which forks support it.
    expect(data.error).toMatch(/Morpho|Aave|Compound/i);
  });

  it("emits a clear error envelope when adapter lacks buildWithdrawCollateral", async () => {
    mockedCreateLending.mockReturnValueOnce({
      name: () => "aave-shaped-stub",
    });

    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "lending",
        "withdraw-collateral",
        "--protocol",
        PROTOCOL,
        "--asset",
        ASSET,
        "--amount",
        "1",
        "--market",
        MARKET_ID,
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toMatch(/does not implement buildWithdrawCollateral/i);
  });
});
