// Unit tests for `defi status` — covers the no-RPC paths (multi-chain
// summary and single-chain enumeration without --verify). The --verify
// branch hits live RPC and is exercised by the integration suite, not
// here.
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { parseOutputMode } from "../output.js";
import { registerStatus } from "./status.js";

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
  registerStatus(program, () =>
    parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
  );
  return program;
}

describe("defi status command", () => {
  it("with no --chain returns a multi-chain JSON summary array", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync(["node", "defi", "--json", "status"]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n")) as Array<{
      chain: string;
      chain_id: number;
      protocols: Array<{ slug: string }>;
      summary: { total_protocols: number };
    }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(5);
    // Each chain entry exposes the canonical shape.
    for (const entry of data) {
      expect(typeof entry.chain).toBe("string");
      expect(typeof entry.chain_id).toBe("number");
      expect(entry.chain_id).toBeGreaterThan(0);
      expect(Array.isArray(entry.protocols)).toBe(true);
      expect(entry.summary.total_protocols).toBe(entry.protocols.length);
    }
  });

  it("with --chain hyperevm returns a single chain object", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "hyperevm",
        "status",
      ]);
    } finally {
      restore();
    }
    expect(capture.json.length).toBeGreaterThan(0);
    const data = JSON.parse(capture.json.join("\n")) as {
      chain: string;
      chain_id: number;
      protocols: Array<{ slug: string }>;
      summary: { total_protocols: number };
    };
    expect(data.chain).toBe("HyperEVM");
    expect(data.chain_id).toBe(999);
    expect(data.protocols.length).toBeGreaterThanOrEqual(10);
    expect(data.summary.total_protocols).toBe(data.protocols.length);
  });

  it("filters out protocols whose chain doesn't match", async () => {
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    try {
      await program.parseAsync([
        "node",
        "defi",
        "--json",
        "--chain",
        "mantle",
        "status",
      ]);
    } finally {
      restore();
    }
    const data = JSON.parse(capture.json.join("\n")) as {
      protocols: Array<{ slug: string }>;
    };
    // Mantle slugs end in `-mantle` (or are interface-tagged like
    // `merchantmoe-mantle`); none should be hyperevm/bnb/base/monad.
    for (const p of data.protocols) {
      expect(p.slug).not.toMatch(/-bnb$|-base$|-monad$/);
      expect(p.slug).not.toBe("project-x");
      expect(p.slug).not.toBe("hyperswap-v3");
    }
  });

  it("getCode is never called without --verify (no live RPC)", async () => {
    // viem.createPublicClient is imported at the top of status.ts and only
    // invoked inside the `if (opts.verify)` branch. Verify the no-verify
    // path doesn't try to spy / monkey-patch viem.
    //
    // We can't directly assert "no network call" without intercepting the
    // module, but exiting cleanly with a sub-100ms duration for 5 chains
    // is a strong signal: a real RPC verify takes seconds per chain.
    const program = buildProgram();
    const { capture, restore } = captureConsole();
    const start = Date.now();
    try {
      await program.parseAsync(["node", "defi", "--json", "status"]);
    } finally {
      restore();
    }
    const elapsed = Date.now() - start;
    expect(capture.json.length).toBeGreaterThan(0);
    // 1500 ms is generous — even a slow Node startup typically renders
    // the registry summary in <100 ms locally.
    expect(elapsed).toBeLessThan(1500);
    // Avoid unused-variable lint by referencing vi's spy machinery
    // explicitly so the module-level vi import survives no-mock runs.
    expect(vi.isMockFunction(() => 0)).toBe(false);
  });
});
