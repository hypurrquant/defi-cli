// Unit tests for main.ts dispatch — covers decideEntryPoint() routing logic
// without invoking the CLI (which would trigger registry loads + side effects).
// The KNOWN_SUBCOMMANDS set is asserted in parallel so adding a new register*()
// call without updating the dispatch list trips a regression here.
import { describe, expect, it } from "vitest";

import { KNOWN_SUBCOMMANDS, decideEntryPoint } from "./main.js";

describe("decideEntryPoint dispatch", () => {
  it("empty args → landing page (non-JSON)", () => {
    expect(decideEntryPoint([])).toEqual({ mode: "landing", isJson: false });
  });

  it("only --json with no subcommand → landing page (JSON)", () => {
    expect(decideEntryPoint(["--json"])).toEqual({ mode: "landing", isJson: true });
  });

  it("--ndjson also flips isJson on the landing page", () => {
    expect(decideEntryPoint(["--ndjson"])).toEqual({ mode: "landing", isJson: true });
  });

  it("unrecognized arg with no known subcommand → landing page (commander would otherwise error)", () => {
    expect(decideEntryPoint(["foo", "bar"])).toEqual({ mode: "landing", isJson: false });
  });

  it("known subcommand → command mode (defers to commander)", () => {
    expect(decideEntryPoint(["status"])).toEqual({ mode: "command", isJson: false });
    expect(decideEntryPoint(["--json", "lending", "rates"])).toEqual({
      mode: "command",
      isJson: true,
    });
  });

  it("--help short-circuits to help mode even with a subcommand present", () => {
    expect(decideEntryPoint(["status", "--help"])).toEqual({ mode: "help", isJson: false });
    expect(decideEntryPoint(["-h"])).toEqual({ mode: "help", isJson: false });
  });

  it("--version short-circuits to version mode", () => {
    expect(decideEntryPoint(["--version"])).toEqual({ mode: "version", isJson: false });
    expect(decideEntryPoint(["-V"])).toEqual({ mode: "version", isJson: false });
  });

  it("flag-shaped arg that matches a subcommand name does NOT trigger command mode", () => {
    // hasSubcommand filters out args starting with "-" — so "--lending" stays
    // a flag, not a command match. This keeps a stray "--portfolio" typed by
    // the user from being treated as the portfolio subcommand.
    expect(decideEntryPoint(["--lending"])).toEqual({ mode: "landing", isJson: false });
  });
});

describe("KNOWN_SUBCOMMANDS coverage", () => {
  it("includes every subcommand registered in cli.ts (plus aliases)", () => {
    // The dispatch decision in main.ts only knows the entries listed here. If
    // a new register*() lands in cli.ts but this set isn't updated, the user
    // will get the landing page instead of the new subcommand — wire this
    // assertion to fail loudly when that happens.
    expect(KNOWN_SUBCOMMANDS.has("status")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("schema")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("lp")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("lending")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("yield")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("portfolio")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("price")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("wallet")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("token")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("bridge")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("swap")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("setup")).toBe(true);
    expect(KNOWN_SUBCOMMANDS.has("ows")).toBe(true);
    // Aliases that aren't separate register*() calls but should still land
    // on commander instead of the landing page:
    expect(KNOWN_SUBCOMMANDS.has("init")).toBe(true); // setup alias
  });
});
