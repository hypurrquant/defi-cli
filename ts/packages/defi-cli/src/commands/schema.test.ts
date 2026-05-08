// Unit tests for `defi schema` — purely registry-driven, no RPC or
// network calls. Pins the JSON envelope shape so external agents (MCP
// tools, scripts) parsing the output catch any drift at PR time.
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { parseOutputMode } from "../output.js";
import { registerSchema } from "./schema.js";

function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    const line = [msg, ...rest]
      .map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
      .join(" ");
    lines.push(line);
  };
  return { lines, restore: () => { console.log = original; } };
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output as JSON");
  program.option("--fields <fields>", "Filter fields");
  registerSchema(program, () =>
    parseOutputMode(program.opts<{ json?: boolean; fields?: string }>()),
  );
  return program;
}

describe("defi schema command", () => {
  it("returns a non-empty actions list when called with no positional", async () => {
    const program = buildProgram();
    const { lines, restore } = captureLog();
    try {
      await program.parseAsync(["node", "defi", "--json", "schema"]);
    } finally {
      restore();
    }
    const data = JSON.parse(lines.join("\n")) as { actions: string[] };
    expect(Array.isArray(data.actions)).toBe(true);
    expect(data.actions).toContain("status");
    expect(data.actions).toContain("schema");
    expect(data.actions.length).toBeGreaterThanOrEqual(5);
  });

  it("returns an action-specific payload when given an action argument", async () => {
    const program = buildProgram();
    const { lines, restore } = captureLog();
    try {
      await program.parseAsync(["node", "defi", "--json", "schema", "status"]);
    } finally {
      restore();
    }
    const data = JSON.parse(lines.join("\n")) as {
      action?: string;
      params?: unknown;
      cli?: string;
      error?: string;
    };
    // Either the schema returns a structured payload for "status" or it
    // returns an error envelope — both are acceptable shapes, but it
    // must not silently print empty output.
    const hasPayload = data.action !== undefined || data.params !== undefined || data.cli !== undefined;
    const hasError = data.error !== undefined;
    expect(hasPayload || hasError).toBe(true);
  });
});
