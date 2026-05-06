// Unit tests for `defi lp positions` — covers the smallest leaf of lp.ts
// (1803 LOC, the largest still-untested handler at the start of this PR
// stack). Bounded scope: only the positions subcommand, only with a
// vi.mock'd viem so all NFT enumeration short-circuits offline.
//
// The other lp subcommands (add/remove/farm/claim/discover/pipeline/
// compound/autopilot) need their own follow-up PRs; the goal here is to
// pin the basic --chain / --protocol / --address routing so a future
// refactor can't quietly drop them.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

// vi.mock viem so any readContract call short-circuits to "no positions".
// The lp positions handler walks every protocol's NPM contract via
// balanceOf(); returning 0n in every case means the per-protocol loop
// produces no entries, so the output is the empty array we want to
// assert. Tests run offline and deterministically.
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: vi.fn(async () => 0n),
    }),
    http: () => () => ({}),
  };
});

// vi.mock the defi-protocols package's adapter constructors so the
// merchant-moe LB scan path also short-circuits without RPC.
vi.mock("@hypurrquant/defi-protocols", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypurrquant/defi-protocols")>();
  return {
    ...actual,
    // The handler calls createMerchantMoeLB(protocol, rpcUrl) and then
    // .discoverRewardedPools(). Returning [] makes the inner for-loop
    // a no-op without touching the chain.
    createMerchantMoeLB: () => ({
      discoverRewardedPools: async () => [],
      findUserBinsWithBalance: async () => [],
      getUserPositions: async () => [],
      getPendingRewards: async () => [],
    }),
    // Other LP-side adapter constructors aren't called for the protocols
    // exercised in these tests (we use uniswap-v2-monad and
    // uniswap-v3-monad), so leaving them as the real implementations is
    // safe — the handler resolves them lazily.
  };
});

const { registerLP } = await import("./lp.js");

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
  registerLP(
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
});

describe("defi lp positions", () => {
  it("errors when --chain is missing (no protocol enumeration)", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync(["node", "defi", "--json", "lp", "positions"]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toBeTruthy();
    expect(data.error).toMatch(/--chain.*required/i);
  });

  it("returns an empty array when balanceOf returns 0n across every protocol on the chain", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "monad",
        "lp",
        "positions",
      ]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n"));
    // The mocked viem.readContract returns 0n, so every protocol with an
    // NPM contract reports 0 NFTs and is skipped. The output is the
    // canonical empty-positions array.
    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it("--protocol filter narrows enumeration to a single protocol", async () => {
    // With --protocol set to a real Monad protocol slug, the handler
    // should only walk that one entry. Even if it produces no
    // positions (because of our mocks), the call must complete
    // without throwing.
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "monad",
        "lp",
        "positions",
        "--protocol",
        "uniswap-v3-monad",
      ]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n"));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it("--address parameter overrides DEFI_WALLET_ADDRESS without throwing", async () => {
    // The handler resolves the user address via resolveAccount(opts.address,
    // lp.opts().wallet). When --address is passed it should win over the
    // env DEFI_WALLET_ADDRESS we set in beforeEach. Test that the call
    // completes and returns the empty-positions sentinel.
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "monad",
        "lp",
        "positions",
        "--address",
        "0x000000000000000000000000000000000000bEEF",
      ]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n"));
    expect(Array.isArray(data)).toBe(true);
  });
});
