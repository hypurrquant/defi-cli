// Unit tests for the LI.FI provider branch of `defi bridge` —
// bridge.ts lines 582-622, the default provider. The path was uncovered
// (61.19% line / 9.09% branch) in the 2026-05-17 sweep because LI.FI
// requires a live HTTP fetch.
//
// We stub globalThis.fetch with a canned quote response per the pattern in
// swap.test.ts and assert:
//   1. native input (token = 0x0…0) → no approvals[] entry
//   2. ERC20 input → approvals[0] populated with quote.estimate.approvalAddress
//   3. approvalAddress fallback to transactionRequest.to when omitted
//   4. quote without transactionRequest → "No LI.FI route found" envelope
//   5. fetch throws → caught + "LI.FI API error" envelope
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerBridge } from "./bridge.js";
import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";
import { TxStatus } from "@hypurrquant/defi-core";
import type { DeFiTx } from "@hypurrquant/defi-core";

// ---------------------------------------------------------------------------
// Console capture (json/text envelopes are mixed; LI.FI prints to stdout).
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

// Executor.execute()'s dry-run result deliberately doesn't include the
// approvals[] the caller asked for — those are consumed by the executor's
// approval handling, which only fires under --broadcast. To assert on the
// approvals branch we wrap the executor in a tiny capture shim that
// records the most recent DeFiTx the handler passed in.
interface CapturedExecutor {
  executor: Executor;
  lastTx: () => DeFiTx | undefined;
}

function makeCapturingExecutor(): CapturedExecutor {
  let captured: DeFiTx | undefined;
  const ex = new Executor(false);
  // Override the instance method (shadows the prototype) so the handler's
  // `await executor.execute(tx)` lands here. We return a minimal
  // ActionResult-shaped object — the handler only forwards it under
  // `action` in the printed envelope.
  ex.execute = async (tx: DeFiTx) => {
    captured = tx;
    return {
      tx_hash: undefined,
      status: TxStatus.DryRun,
      gas_used: tx.gas_estimate,
      description: tx.description,
      details: {
        to: tx.to,
        data: tx.data,
        value: tx.value.toString(),
        mode: "dry_run",
      },
    };
  };
  return {
    executor: ex,
    lastTx: () => captured,
  };
}

function buildProgram(executor: Executor): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerBridge(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
    () => executor,
  );
  return program;
}

const origFetch = globalThis.fetch;
const ENV_KEYS = ["DEFI_WALLET_ADDRESS", "DEFI_PRIVATE_KEY"] as const;
let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  process.env["DEFI_WALLET_ADDRESS"] = "0x000000000000000000000000000000000000dEaD";
  globalThis.fetch = origFetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  globalThis.fetch = origFetch;
});

function mockFetchOnce(response: unknown): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
    json: async () => response,
  })) as unknown as typeof fetch;
}

function mockFetchThrows(error: Error): void {
  globalThis.fetch = vi.fn(async () => {
    throw error;
  }) as unknown as typeof fetch;
}

const ROUTER = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const APPROVAL_ADDRESS = "0xabcd00000000000000000000000000000000abcd";
const USDC_HYPEREVM = "0xb88339cb7199b77e23db6e890353e22632ba630f";
const FAKE_CALLDATA = "0xdeadbeef";

// ---------------------------------------------------------------------------
// Native input → empty approvals[]
// ---------------------------------------------------------------------------

describe("defi bridge — LI.FI native input", () => {
  it("passes empty approvals[] to executor when token is the 0x0 native sentinel", async () => {
    mockFetchOnce({
      transactionRequest: {
        to: ROUTER,
        data: FAKE_CALLDATA,
        value: "1000000000000000000",
      },
      estimate: { toAmount: "999", approvalAddress: APPROVAL_ADDRESS },
      toolDetails: { name: "LI.FI/across" },
    });
    const { executor, lastTx } = makeCapturingExecutor();
    const program = buildProgram(executor);
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "bridge",
        "--token",
        "0x0000000000000000000000000000000000000000",
        "--amount",
        "1000000000000000000",
        "--to-chain",
        "base",
      ]);
    } finally {
      restore();
    }
    // approvalAddress was supplied but native input must NOT include an
    // approvals[] entry — there's no ERC20 to approve.
    const tx = lastTx();
    expect(tx).toBeDefined();
    expect(tx!.approvals).toEqual([]);
    expect(tx!.to.toLowerCase()).toBe(ROUTER.toLowerCase());
    expect(tx!.value).toBe(1_000_000_000_000_000_000n);

    const data = JSON.parse(capture.json.join("\n")) as {
      bridge?: string;
      estimated_output?: string;
    };
    expect(data.bridge).toBe("LI.FI/across");
    expect(data.estimated_output).toBe("999");
  });
});

// ---------------------------------------------------------------------------
// ERC20 input → approvals[0] populated with the canonical spender
// ---------------------------------------------------------------------------

describe("defi bridge — LI.FI ERC20 input", () => {
  it("passes approvals[0] with quote.estimate.approvalAddress when present", async () => {
    mockFetchOnce({
      transactionRequest: { to: ROUTER, data: FAKE_CALLDATA, value: "0" },
      estimate: { toAmount: "999000", approvalAddress: APPROVAL_ADDRESS },
      toolDetails: { name: "LI.FI/hop" },
    });
    const { executor, lastTx } = makeCapturingExecutor();
    const program = buildProgram(executor);
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "bridge",
        "--asset",
        "USDC",
        "--amount",
        "1000000",
        "--to-chain",
        "base",
      ]);
    } finally {
      restore();
    }
    const tx = lastTx();
    expect(tx).toBeDefined();
    expect(tx!.approvals?.length).toBe(1);
    expect(tx!.approvals![0]!.token.toLowerCase()).toBe(USDC_HYPEREVM);
    expect(tx!.approvals![0]!.spender.toLowerCase()).toBe(
      APPROVAL_ADDRESS.toLowerCase(),
    );
    expect(tx!.approvals![0]!.amount).toBe(1_000_000n);

    const data = JSON.parse(capture.json.join("\n")) as {
      bridge?: string;
      estimated_output?: string;
    };
    expect(data.bridge).toBe("LI.FI/hop");
    expect(data.estimated_output).toBe("999000");
  });

  it("uses transactionRequest.to as spender when approvalAddress is missing", async () => {
    mockFetchOnce({
      transactionRequest: { to: ROUTER, data: FAKE_CALLDATA, value: "0" },
      // estimate without approvalAddress — pins the `?? quote.transactionRequest.to`
      // expression in bridge.ts:598. Without that branch coverage, a refactor
      // could silently drop the fallback and start emitting `approvals[0]
      // .spender = undefined`, which would crash the executor's approval pass.
      estimate: { toAmount: "500000" },
    });
    const { executor, lastTx } = makeCapturingExecutor();
    const program = buildProgram(executor);
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "bridge",
        "--token",
        "USDC",
        "--amount",
        "1000000",
        "--to-chain",
        "base",
      ]);
    } finally {
      restore();
    }
    const tx = lastTx();
    expect(tx).toBeDefined();
    expect(tx!.approvals![0]!.spender.toLowerCase()).toBe(ROUTER.toLowerCase());

    const data = JSON.parse(capture.json.join("\n")) as { bridge?: string };
    // bridge string degrades to bare "LI.FI" when toolDetails.name is absent.
    expect(data.bridge).toBe("LI.FI");
  });
});

// ---------------------------------------------------------------------------
// Quote errors
// ---------------------------------------------------------------------------

describe("defi bridge — LI.FI quote errors", () => {
  it("returns 'No LI.FI route found' when quote omits transactionRequest", async () => {
    mockFetchOnce({
      // Simulate the LI.FI 'no route' shape — common when src/dst pair
      // isn't supported (e.g. an obscure chain).
      message: "No route found",
    });
    const { executor } = makeCapturingExecutor();
    const program = buildProgram(executor);
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "bridge",
        "--token",
        "USDC",
        "--amount",
        "1000000",
        "--to-chain",
        "base",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      error?: string;
      details?: { message?: string };
    };
    expect(data.error).toBe("No LI.FI route found");
    // The original quote payload is bubbled up under `details` so the agent
    // caller can inspect why LI.FI declined.
    expect(data.details?.message).toBe("No route found");
  });

  it("catches fetch failure and surfaces a 'LI.FI API error' envelope", async () => {
    mockFetchThrows(new Error("ECONNREFUSED"));
    const { executor } = makeCapturingExecutor();
    const program = buildProgram(executor);
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "bridge",
        "--token",
        "USDC",
        "--amount",
        "1000000",
        "--to-chain",
        "base",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toMatch(/LI\.FI API error/i);
    expect(data.error).toMatch(/ECONNREFUSED/);
  });
});
