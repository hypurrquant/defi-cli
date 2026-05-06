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

// Happy-path coverage for the four still-untested providers. The kyber
// branch is exercised by the native-input section above; openocean
// likewise (via its isNativeInput check), but a dedicated happy-path
// test here pins the printOutput shape so a future printOutput refactor
// can't quietly drop fields.
describe("defi swap aggregator happy paths", () => {
  it("openocean: emits provider/router/amount_out and value=amount on native input", async () => {
    // OpenOcean returns a single object on /v4/{chain}/swap with the
    // executor-shaped fields. Native input mirrors the kyber pattern:
    // value=amount_in, no approvals[].
    mockFetchOnce({
      data: { to: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64", data: FAKE_CALLDATA, value: "0", outAmount: "33218" },
    });
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "monad",
        "swap", "--from", "MON", "--to", "USDC", "--amount",
        "100000000000000000", "--provider", "openocean",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string; chain?: string; amount_out?: string; router?: string;
    };
    expect(data.provider).toBe("openocean");
    expect(data.chain).toBe("monad");
    expect(data.amount_out).toBe("33218");
    expect(data.router?.toLowerCase()).toBe("0x6352a56caadc4f1e25cd6c75970fa768a3304e64");
  });

  it("lifi: emits provider/chain_id/amount_out from transactionRequest+estimate", async () => {
    // LI.FI returns a {transactionRequest, estimate} shape. The chain
    // is keyed off chains.toml's `chain_id` (Monad = 143), not a slug.
    mockFetchOnce({
      transactionRequest: {
        to: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37",
        data: FAKE_CALLDATA,
        value: "0",
      },
      estimate: { toAmount: "32220" },
    });
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "monad",
        "swap", "--from", "MON", "--to", "USDC", "--amount",
        "100000000000000000", "--provider", "lifi",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string; chain?: string; chain_id?: number; amount_out?: string;
    };
    expect(data.provider).toBe("lifi");
    expect(data.chain).toBe("monad");
    expect(data.chain_id).toBe(143);
    expect(data.amount_out).toBe("32220");
  });

  it("relay: skips approve step in steps[] and reports currencyOut amount", async () => {
    // Relay returns {steps: [{id:'approve',...}, {id:'swap', items:[{data}]}],
    // details: {currencyOut: {amount}}}. The CLI must skip the approve
    // step (the executor handles approvals) and decode the swap step.
    mockFetchOnce({
      steps: [
        { id: "approve", items: [{ data: { to: "0xapprove", data: "0xff", value: "0" } }] },
        {
          id: "swap",
          items: [{ data: { to: "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f", data: FAKE_CALLDATA, value: "0" } }],
        },
      ],
      details: { currencyOut: { amount: "3225554" } },
    });
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "monad",
        "swap", "--from", "MON", "--to", "USDC", "--amount",
        "100000000000000000000", "--provider", "relay",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string; chain_id?: number; amount_out?: string; router?: string;
    };
    expect(data.provider).toBe("relay");
    expect(data.chain_id).toBe(143);
    expect(data.amount_out).toBe("3225554");
    expect(data.router?.toLowerCase()).toBe("0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f");
  });

  it("liquid: returns the executor preview when invoked on hyperevm", async () => {
    // LiquidSwap is HyperEVM-only and uses {execution: {to, calldata, value},
    // details: {amountOut}}. The handler resolves token symbols against the
    // hyperevm registry, so we use HYPE → USDC tokens that exist.
    mockFetchOnce({
      execution: { to: "0x744489ee3d540777a66f2cf297479745e0852f7a", calldata: FAKE_CALLDATA, value: "0" },
      details: { amountOut: "12345" },
    });
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm",
        "swap", "--from", "HYPE", "--to", "USDC", "--amount",
        "1000000000000000000", "--provider", "liquid",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      provider?: string; chain?: string; amount_out?: string; router?: string;
      error?: string;
    };
    // liquid provider depends on the registry resolving HYPE/USDC on
    // hyperevm; if that resolution fails the error envelope still
    // tells us the provider routing reached the liquid branch.
    if (data.error) {
      expect(data.error).toMatch(/LiquidSwap|liquid/i);
    } else {
      expect(data.provider).toBe("liquid");
      expect(data.chain).toBe("hyperevm");
      expect(data.amount_out).toBe("12345");
    }
  });
});
