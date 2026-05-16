// Unit tests for agent.ts handleSchema — the only exported entry point
// suitable for direct testing (runAgent reads from process.stdin). The
// schema switch sits at 63.81% line / 14.28% branch coverage in the
// 2026-05-17 sweep because most `case` arms are never exercised; this
// file walks every case so a future schema change can't drop a route
// silently.
import { describe, expect, it } from "vitest";

import { handleSchema } from "./agent.js";

interface ActionSchema {
  action: string;
  params: Record<string, { type: string; required: boolean; description: string; default?: string }>;
  cli: string;
}

interface ActionList {
  actions: string[];
}

describe("agent.handleSchema — happy switch cases", () => {
  it("status case returns a stub schema with no params", () => {
    const r = handleSchema({ action: "status" }) as ActionSchema;
    expect(r.action).toBe("status");
    expect(r.cli).toBe("defi status");
    expect(r.params).toEqual({});
  });

  it("list_protocols case documents an optional category filter", () => {
    const r = handleSchema({ action: "list_protocols" }) as ActionSchema;
    expect(r.action).toBe("list_protocols");
    expect(r.params["category"]?.required).toBe(false);
    expect(r.params["category"]?.description).toMatch(/category/i);
  });

  it("yield case defaults to USDC asset", () => {
    const r = handleSchema({ action: "yield" }) as ActionSchema;
    expect(r.action).toBe("yield");
    expect(r.params["asset"]?.default).toBe("USDC");
    expect(r.params["asset"]?.required).toBe(false);
  });

  it("lending.rates case requires chain + protocol + asset", () => {
    const r = handleSchema({ action: "lending.rates" }) as ActionSchema;
    expect(r.action).toBe("lending.rates");
    expect(r.params["chain"]?.required).toBe(true);
    expect(r.params["protocol"]?.required).toBe(true);
    expect(r.params["asset"]?.required).toBe(true);
    expect(r.cli).toContain("lending rates");
  });

  it.each([
    ["lending.supply", "supply"],
    ["lending.borrow", "borrow"],
    ["lending.repay", "repay"],
    ["lending.withdraw", "withdraw"],
  ])("%s collapses into the shared lending-action schema", (action, sub) => {
    const r = handleSchema({ action }) as ActionSchema;
    expect(r.action).toBe(action);
    expect(r.params["amount"]?.required).toBe(true);
    expect(r.cli).toContain(`lending ${sub}`);
  });

  it("lp.discover case requires chain, optional protocol filter", () => {
    const r = handleSchema({ action: "lp.discover" }) as ActionSchema;
    expect(r.action).toBe("lp.discover");
    expect(r.params["chain"]?.required).toBe(true);
    expect(r.params["protocol"]?.required).toBe(false);
  });

  it("swap case defaults provider=kyber and slippage=50 bps", () => {
    const r = handleSchema({ action: "swap" }) as ActionSchema;
    expect(r.action).toBe("swap");
    expect(r.params["provider"]?.default).toBe("kyber");
    expect(r.params["slippage"]?.default).toBe("50");
    expect(r.cli).toContain("swap --from");
  });

  // --- The two cases that were uncovered in the 2026-05-17 sweep ---

  it("price case requires chain + asset and emits the documented CLI example", () => {
    const r = handleSchema({ action: "price" }) as ActionSchema;
    expect(r.action).toBe("price");
    expect(r.params["chain"]?.required).toBe(true);
    expect(r.params["asset"]?.required).toBe(true);
    // Pin the documented example so agent docs / CLI help stay in sync.
    expect(r.cli).toBe("defi --chain hyperevm price --asset WHYPE");
  });

  it("bridge case requires chain/token/amount/to_chain", () => {
    const r = handleSchema({ action: "bridge" }) as ActionSchema;
    expect(r.action).toBe("bridge");
    expect(r.params["chain"]?.required).toBe(true);
    expect(r.params["token"]?.required).toBe(true);
    expect(r.params["amount"]?.required).toBe(true);
    expect(r.params["to_chain"]?.required).toBe(true);
    expect(r.cli).toContain("bridge --token");
    expect(r.cli).toContain("--to-chain");
  });
});

describe("agent.handleSchema — default branch", () => {
  it("returns the full action catalog for unknown actions", () => {
    const r = handleSchema({ action: "no-such-action" }) as ActionList;
    expect(Array.isArray(r.actions)).toBe(true);
    // Must list every case we tested above.
    for (const expected of [
      "status",
      "list_protocols",
      "schema",
      "yield",
      "lending.rates",
      "lending.supply",
      "lending.borrow",
      "lending.repay",
      "lending.withdraw",
      "lp.discover",
      "lp.add",
      "lp.farm",
      "lp.claim",
      "lp.remove",
      "swap",
      "price",
      "token.balance",
      "token.approve",
      "token.transfer",
      "wallet.balance",
      "portfolio.show",
      "bridge",
    ]) {
      expect(r.actions).toContain(expected);
    }
  });

  it("returns the catalog when no action is provided at all", () => {
    const r = handleSchema({}) as ActionList;
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.actions).toContain("price");
    expect(r.actions).toContain("bridge");
  });

  it("returns the catalog when action is a non-string value", () => {
    // Hardens the `typeof params.action === 'string' ? ... : 'all'` guard at
    // the top of handleSchema — a numeric / null / boolean action falls
    // through to the default branch.
    const r = handleSchema({ action: 42 as unknown as string }) as ActionList;
    expect(r.actions).toContain("status");
  });
});
