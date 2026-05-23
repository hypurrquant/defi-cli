// Branch coverage tests for `defi swap --provider openocean` — pins the
// `isNativeInput ? {} : { approvals[]: ... }` split at swap.ts:354-365 +
// the symbol-vs-address `--from` lookup at swap.ts:331-333. swap.test.ts
// already covers the native-symbol path (MON → USDC); these tests
// complete the matrix: ERC20→ERC20, 0x-prefixed `--from`, and the
// 0xeeee… sentinel as native input.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";
import { registerSwap } from "./swap.js";
import { TxStatus } from "@hypurrquant/defi-core";
import type { DeFiTx } from "@hypurrquant/defi-core";

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

// As in bridge-lifi.test.ts — Executor.execute() in dry-run mode strips the
// approvals[] from its return shape, so we wrap the executor to capture the
// inbound DeFiTx and assert on its approvals directly.
interface CapturedExecutor {
  executor: Executor;
  lastTx: () => DeFiTx | undefined;
}

function makeCapturingExecutor(): CapturedExecutor {
  let captured: DeFiTx | undefined;
  const ex = new Executor(false);
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
  return { executor: ex, lastTx: () => captured };
}

function buildProgram(executor: Executor): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerSwap(
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

function mockOpenoceanResponse(response: Record<string, unknown>): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
    json: async () => response,
  })) as unknown as typeof fetch;
}

const ROUTER = "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64";
const FAKE_CALLDATA = "0xdeadbeef";
const USDC_MONAD = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const EEEE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// ---------------------------------------------------------------------------
// ERC20 input → approvals[] populated (covers swap.ts:364)
// ---------------------------------------------------------------------------

describe("defi swap --provider openocean — ERC20 input", () => {
  it("emits a single approvals[] entry with spender = router when --from is an ERC20", async () => {
    mockOpenoceanResponse({
      data: { to: ROUTER, data: FAKE_CALLDATA, value: "0", outAmount: "987654" },
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
        "monad",
        "swap",
        "--from",
        "USDC",
        "--to",
        "MON",
        "--amount",
        "1000000",
        "--provider",
        "openocean",
      ]);
    } finally {
      restore();
    }
    const tx = lastTx();
    expect(tx).toBeDefined();
    expect(tx!.approvals?.length).toBe(1);
    expect(tx!.approvals![0]!.token.toLowerCase()).toBe(USDC_MONAD);
    expect(tx!.approvals![0]!.spender.toLowerCase()).toBe(ROUTER.toLowerCase());
    expect(tx!.approvals![0]!.amount).toBe(1_000_000n);

    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string;
      amount_out?: string;
    };
    expect(data.provider).toBe("openocean");
    expect(data.amount_out).toBe("987654");
  });

  it("0x-prefixed --from is looked up by address (covers swap.ts:331-332)", async () => {
    mockOpenoceanResponse({
      data: { to: ROUTER, data: FAKE_CALLDATA, value: "0", outAmount: "111" },
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
        "monad",
        "swap",
        "--from",
        USDC_MONAD, // address, not symbol → exercises the startsWith("0x") arm
        "--to",
        "MON",
        "--amount",
        "1000000",
        "--provider",
        "openocean",
      ]);
    } finally {
      restore();
    }
    const tx = lastTx();
    expect(tx).toBeDefined();
    // Non-native ERC20 → approvals[] populated.
    expect(tx!.approvals?.length).toBe(1);
    expect(tx!.approvals![0]!.token.toLowerCase()).toBe(USDC_MONAD);

    const data = JSON.parse(capture.json.join("\n")) as { amount_out?: string };
    expect(data.amount_out).toBe("111");
  });
});

// ---------------------------------------------------------------------------
// 0xeeee… sentinel as native input (covers the second arm of isNativeInput
// at swap.ts:356) — the existing swap.test.ts already covers the symbol
// (MON) path; this pins the alias for callers that pass the canonical
// 1inch/KyberSwap/OpenOcean sentinel directly.
// ---------------------------------------------------------------------------

describe("defi swap --provider openocean — 0xeeee native sentinel", () => {
  it("omits approvals[] when --from is the 0xeeee sentinel", async () => {
    mockOpenoceanResponse({
      data: { to: ROUTER, data: FAKE_CALLDATA, value: "0", outAmount: "42" },
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
        "monad",
        "swap",
        "--from",
        EEEE_SENTINEL,
        "--to",
        "USDC",
        "--amount",
        "1000000000000000000",
        "--provider",
        "openocean",
      ]);
    } finally {
      restore();
    }
    const tx = lastTx();
    expect(tx).toBeDefined();
    // Native input → no approvals.
    expect(tx!.approvals).toBeUndefined();

    const data = JSON.parse(capture.json.join("\n")) as { provider?: string };
    expect(data.provider).toBe("openocean");
  });
});
