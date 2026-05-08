// Unit tests for `defi wallet` — covers the address command (env-driven,
// no RPC) and the no-wallet error path of balance. The happy-path
// balance branch hits live RPC via viem and is intentionally exercised
// by integration / Anvil-fork tests rather than mocked here.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseOutputMode } from "../output.js";
import { registerWallet } from "./wallet.js";

interface CapturedOutput {
  json: string[];
  text: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
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
  registerWallet(program, () =>
    parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
  );
  return program;
}

// Snapshot + restore the env vars resolveWalletWithSigner() consults so
// each test runs in isolation regardless of host shell.
const ENV_KEYS = ["DEFI_WALLET_ADDRESS", "DEFI_PRIVATE_KEY"] as const;
let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("defi wallet address", () => {
  it("returns null + source=none when no env vars are set", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync(["node", "defi", "--json", "wallet", "address"]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n")) as { address: unknown; source: string };
    expect(data.address).toBeNull();
    expect(data.source).toBe("none");
  });

  it("returns the configured DEFI_WALLET_ADDRESS with source=env", async () => {
    const fixture = "0x000000000000000000000000000000000000dEaD";
    process.env["DEFI_WALLET_ADDRESS"] = fixture;

    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync(["node", "defi", "--json", "wallet", "address"]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { address: string; source: string };
    expect(data.address).toBe(fixture);
    expect(data.source).toBe("env");
  });

  it("derives the address from DEFI_PRIVATE_KEY with source=private_key", async () => {
    // Hardhat's well-known account #0 — same key the defi-cli docs use
    // for dry-run examples. Public knowledge, no funds at risk.
    process.env["DEFI_PRIVATE_KEY"] =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync(["node", "defi", "--json", "wallet", "address"]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as { address: string; source: string };
    expect(data.address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
    expect(data.source).toBe("private_key");
  });
});

describe("defi wallet balance", () => {
  it("rejects with a structured error when no wallet is configured", async () => {
    // Pre-condition: env scrubbed by beforeEach. The handler should
    // short-circuit BEFORE touching viem / the RPC, so this test is
    // safe to run without a network and without a chain RPC.
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "wallet",
        "balance",
      ]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n")) as { error?: string };
    expect(data.error).toBeTruthy();
    expect(data.error).toMatch(/wallet/i);
    expect(data.error).toMatch(/DEFI_WALLET_ADDRESS|DEFI_PRIVATE_KEY|--address/);
  });

  it("requires --chain (multi-chain balance fan-out is intentionally not supported)", async () => {
    process.env["DEFI_WALLET_ADDRESS"] = "0x000000000000000000000000000000000000dEaD";
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      // No --chain flag. requireChain() should print an error envelope
      // and the handler must not proceed to a real RPC call.
      await program.parseAsync(["node", "defi", "--json", "wallet", "balance"]);
    } finally {
      restore();
    }
    // Either an error envelope on the JSON channel or a stderr text
    // explaining --chain is required is acceptable. We assert at least
    // one channel surfaced something.
    const everything = [...capture.json, ...capture.text].join("\n");
    expect(everything.length).toBeGreaterThan(0);
    expect(everything).toMatch(/chain/i);
  });
});
