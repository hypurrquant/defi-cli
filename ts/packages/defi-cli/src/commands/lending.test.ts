// Unit tests for `defi lending` — focused on the --amount parser.
//
// Pre-2026-05-07 behaviour: `defi lending withdraw --amount max` produced
// `Cannot convert max to a BigInt` because lending.ts called BigInt(opts.amount)
// directly. token.ts approve had supported "max" since the SSOT 7.x baseline;
// lending lagged. This test pins the new contract for both happy and failure
// paths so the regression can't sneak back in.
//
// We exercise the dry-run dispatch end-to-end (without RPC) by stubbing the
// adapter creation: lending commands call `createLending(...)` from
// @hypurrquant/defi-protocols, which builds an adapter that hits viem against
// the chain RPC. To keep the test offline we vi.mock that import and return
// a stub adapter whose buildSupply/buildWithdraw simply echo the parsed
// `amount` field back as the tx description, so we can assert the parser
// round-trip.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maxUint256 } from "viem";

import { Executor } from "../executor.js";
import { parseOutputMode } from "../output.js";

// vi.mock must be hoisted: declare the stub before importing registerLending.
vi.mock("@hypurrquant/defi-protocols", () => {
  const stub = {
    name: () => "stub-lending",
    async getRates() {
      return {} as never;
    },
    async getUserPosition() {
      return {} as never;
    },
    async buildSupply(p: { amount: bigint; asset: `0x${string}` }) {
      return {
        description: `stub supply ${p.amount} of ${p.asset}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      };
    },
    async buildBorrow(p: { amount: bigint; asset: `0x${string}` }) {
      return {
        description: `stub borrow ${p.amount} of ${p.asset}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      };
    },
    async buildRepay(p: { amount: bigint; asset: `0x${string}` }) {
      return {
        description: `stub repay ${p.amount} of ${p.asset}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      };
    },
    async buildWithdraw(p: { amount: bigint; asset: `0x${string}` }) {
      return {
        description: `stub withdraw ${p.amount} of ${p.asset}`,
        to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: 0n,
        gas_estimate: 100_000,
      };
    },
  };
  return {
    createLending: () => stub,
  };
});

const { registerLending } = await import("./lending.js");

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
  // Lending handler resolves a wallet via resolveWallet() → falls back to a
  // placeholder when no env var is set, but printOutput emits a warning to
  // stderr that's irrelevant here. Setting an explicit address keeps the
  // happy paths quiet and tests the parser end-to-end.
  process.env["DEFI_WALLET_ADDRESS"] = "0x000000000000000000000000000000000000dEaD";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

const PROTOCOL_ON_HYPEREVM = "felix-morpho";
const ASSET = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"; // arbitrary

describe("defi lending --amount parser", () => {
  for (const sub of ["supply", "borrow", "repay", "withdraw"] as const) {
    it(`${sub}: --amount max maps to type(uint256).max`, async () => {
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
          sub,
          "--protocol",
          PROTOCOL_ON_HYPEREVM,
          "--asset",
          ASSET,
          "--amount",
          "max",
        ]);
      } finally {
        restore();
      }
      const data = JSON.parse(capture.json.join("\n")) as { description?: string };
      expect(data.description, `${sub} description should echo max amount`).toContain(
        String(maxUint256),
      );
    });

    it(`${sub}: --amount ALL is also accepted (case-insensitive 'all')`, async () => {
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
          sub,
          "--protocol",
          PROTOCOL_ON_HYPEREVM,
          "--asset",
          ASSET,
          "--amount",
          "ALL",
        ]);
      } finally {
        restore();
      }
      const data = JSON.parse(capture.json.join("\n")) as { description?: string };
      expect(data.description).toContain(String(maxUint256));
    });

    it(`${sub}: --amount 12345 stays a literal bigint (no max sentinel)`, async () => {
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
          sub,
          "--protocol",
          PROTOCOL_ON_HYPEREVM,
          "--asset",
          ASSET,
          "--amount",
          "12345",
        ]);
      } finally {
        restore();
      }
      const data = JSON.parse(capture.json.join("\n")) as { description?: string };
      expect(data.description).toContain("12345");
      expect(data.description).not.toContain(String(maxUint256));
    });
  }
});
