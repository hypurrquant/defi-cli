// Unit tests for cli.ts — the static program wiring that turns a fresh
// commander instance into the full `defi` CLI with all 13 subcommands
// registered. We import `program` and walk its surface; we don't actually
// dispatch any command (those are tested per-handler).
import { describe, expect, it } from "vitest";

import { program } from "./cli.js";

describe("cli.ts program surface", () => {
  it("program.name() is 'defi'", () => {
    expect(program.name()).toBe("defi");
  });

  it("program.version() reports a semver string from package.json", () => {
    const v = program.version();
    expect(typeof v).toBe("string");
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("registers global output / chain / broadcast flags", () => {
    const long = program.options.map((o) => o.long);
    expect(long).toContain("--json");
    expect(long).toContain("--ndjson");
    expect(long).toContain("--fields");
    expect(long).toContain("--chain");
    expect(long).toContain("--dry-run");
    expect(long).toContain("--broadcast");
  });

  it("registers every documented top-level subcommand", () => {
    const subs = program.commands.map((c) => c.name()).sort();
    // 13 register*() calls in cli.ts.
    expect(subs).toEqual(
      [
        "status",
        "schema",
        "lp",
        "lending",
        "yield",
        "portfolio",
        "price",
        "wallet",
        "token",
        "bridge",
        "swap",
        "setup",
        "ows",
      ].sort(),
    );
  });

  it("helpInformation() reflects the description + every registered subcommand", () => {
    // helpInformation() returns commander's structured help (Usage / Options /
    // Commands). addHelpText("before", BANNER) is NOT included here — it's
    // appended by outputHelp() at display time. We assert the structured
    // surface; the banner is captured via outputHelp() in the next test.
    const help = program.helpInformation();
    expect(help).toContain("DeFi CLI");
    expect(help).toContain("lp");
    expect(help).toContain("portfolio");
    expect(help).toContain("ows");
  });

  it("outputHelp() emits the BANNER 'before' block including the HypurrQuant byline", () => {
    // Capture stdout via the configured help writer to isolate the banner.
    let captured = "";
    const origWriter = (program as unknown as {
      _helpConfiguration?: { writeOut?: (s: string) => void };
    })._helpConfiguration;
    program.configureOutput({
      writeOut: (s: string) => {
        captured += s;
      },
    });
    try {
      program.outputHelp();
    } finally {
      // Restore commander's default writer.
      if (origWriter && origWriter.writeOut) {
        program.configureOutput({ writeOut: origWriter.writeOut });
      } else {
        program.configureOutput({ writeOut: (s) => process.stdout.write(s) });
      }
    }
    expect(captured).toContain("by HypurrQuant");
  });

  it("help text describes the broadcast guardrail (dry-run default + --broadcast opt-in)", () => {
    const help = program.helpInformation();
    expect(help).toContain("--dry-run");
    expect(help).toContain("--broadcast");
  });
});
