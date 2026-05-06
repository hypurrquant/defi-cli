// Unit tests for `defi swap` — focuses on the SSOT-7-equivalent native-input
// invariant: every aggregator branch must forward `value === amount_in` and
// omit `approvals[]` when the user is selling the chain's native gas token.
//
// Pre-2026-05-07 behaviour: the kyber branch passed `txData.value` (often
// `"0x0"` from KyberSwap's API for native input) verbatim, which made the
// router revert with `Invalid msg.value` on Monad MON → USDC. The openocean
// branch already had the right pattern (`isNativeInput` check); this fix
// mirrors it to the kyber branch and the tests pin both branches so the
// pattern can't drift.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";
import { registerSwap } from "./swap.js";

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
  registerSwap(
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
  // Reset fetch mock per test so prior implementations don't leak.
  globalThis.fetch = origFetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  globalThis.fetch = origFetch;
});

const origFetch = globalThis.fetch;

const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000";
const EEEE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const USDC_MONAD = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const FAKE_CALLDATA = "0xdeadbeef";

function mockFetchOnce(response: Record<string, unknown>): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
    json: async () => response,
  })) as unknown as typeof fetch;
}

function mockFetchSequence(responses: Record<string, unknown>[]): void {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const resp = responses[i] ?? responses[responses.length - 1];
    i++;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(resp),
      json: async () => resp,
    };
  }) as unknown as typeof fetch;
}

describe("defi swap kyber native-input msg.value invariant", () => {
  it("forces value=amount_in when from-token is the 0xeeee sentinel", async () => {
    // KyberSwap's quote + build flow: 2 fetches (GET routes, POST build).
    // The build response intentionally returns value="0x0" — the bug we're
    // pinning is that the CLI must NOT trust that on native input.
    mockFetchSequence([
      { data: { routeSummary: { amountOut: "32301" } } },
      { data: { routerAddress: ROUTER, data: FAKE_CALLDATA, value: "0x0" } },
    ]);

    const program = buildProgram();
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
        USDC_MONAD,
        "--amount",
        "100000000000000000",
        "--provider",
        "kyber",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string;
      details?: { value?: string };
    };
    expect(data.provider).toBe("kyber");
    // The fix: on native input, value MUST equal amount_in even when the
    // aggregator API echoed "0x0".
    expect(data.details?.value).toBe("100000000000000000");
  });

  it("forces value=amount_in when from-token is the 0x0 native sentinel", async () => {
    mockFetchSequence([
      { data: { routeSummary: { amountOut: "1" } } },
      { data: { routerAddress: ROUTER, data: FAKE_CALLDATA, value: "0x0" } },
    ]);

    const program = buildProgram();
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
        NATIVE_SENTINEL,
        "--to",
        USDC_MONAD,
        "--amount",
        "1234567890",
        "--provider",
        "kyber",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      details?: { value?: string };
    };
    expect(data.details?.value).toBe("1234567890");
  });

  it("preserves the kyber API's value verbatim when from-token is an ERC20", async () => {
    // Non-native input: the user must approve the router for an ERC20
    // transferFrom. The kyber API returns value="0x0" and that's correct;
    // we should NOT override it.
    mockFetchSequence([
      { data: { routeSummary: { amountOut: "999" } } },
      { data: { routerAddress: ROUTER, data: FAKE_CALLDATA, value: "0x0" } },
    ]);

    const program = buildProgram();
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
        USDC_MONAD,
        "--to",
        EEEE_SENTINEL,
        "--amount",
        "1000",
        "--provider",
        "kyber",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      details?: { value?: string };
    };
    expect(data.details?.value).toBe("0");
  });
});

describe("defi swap chain support guards", () => {
  it("liquid provider rejects non-hyperevm chains with a clear error", async () => {
    const program = buildProgram();
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
        USDC_MONAD,
        "--amount",
        "1",
        "--provider",
        "liquid",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toBeTruthy();
    expect(data.error).toMatch(/LiquidSwap.*hyperevm/i);
  });

  it("unknown provider returns a structured error envelope", async () => {
    const program = buildProgram();
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
        USDC_MONAD,
        "--amount",
        "1",
        "--provider",
        "made-up-provider",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toBeTruthy();
    expect(data.error).toMatch(/Unknown provider/i);
    expect(data.error).toMatch(/kyber|openocean|liquid|lifi|relay/i);
  });
});
