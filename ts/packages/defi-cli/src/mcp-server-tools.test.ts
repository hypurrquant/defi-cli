// Unit tests for the MCP tool handler bodies in mcp-server.ts.
//
// The pre-existing mcp-server.test.ts only verifies the envelope helpers
// (ok/err) and the server constructor — line coverage for the 22 tool
// handlers themselves was 21.9% at the 2026-05-17 sweep.
//
// We can't easily run a full MCP client in-process to call tools by name,
// so this file intercepts McpServer.tool() at module load via vi.mock,
// captures every registered handler into a Map, and then invokes the
// handlers directly with the same shape an MCP transport would deliver
// (just the destructured params object).
//
// Adapter constructors from @hypurrquant/defi-protocols are mocked so the
// handlers never touch real RPC. viem.createPublicClient is mocked for
// defi_lp_positions (the largest single uncovered handler, lines 1545-1663).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Capture every registered tool handler so we can invoke them directly.
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const registeredTools = new Map<string, ToolHandler>();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class {
      // The real SDK exposes a `tool(name, desc, schema, handler)` registration
      // method. We just stash the handler in our module-scoped map; tests
      // dispatch by name via callTool() below.
      tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler) {
        registeredTools.set(name, handler);
        return {} as unknown;
      }
      async connect() {
        /* no-op — the import guard in mcp-server.ts skips connect() under vitest */
      }
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

// ---------------------------------------------------------------------------
// Adapter mocks. These are constructors that the tool handlers call inside
// their try/catch — returning stub adapters keeps the handlers offline.
// ---------------------------------------------------------------------------

vi.mock("@hypurrquant/defi-protocols", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hypurrquant/defi-protocols")>();
  return {
    ...actual,
    createLending: vi.fn(() => ({
      name: () => "stub-lending",
      getRates: vi.fn(async () => ({
        supply_apy: 0.05,
        borrow_apy: 0.1,
        utilization: 0.6,
      })),
      buildSupply: vi.fn(
        async (p: { amount: bigint; asset: `0x${string}` }) => ({
          description: `stub supply ${p.amount} of ${p.asset}`,
          to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
          data: "0x" as `0x${string}`,
          value: 0n,
          gas_estimate: 100_000,
        }),
      ),
      buildWithdraw: vi.fn(
        async (p: { amount: bigint; asset: `0x${string}` }) => ({
          description: `stub withdraw ${p.amount} of ${p.asset}`,
          to: "0x0000000000000000000000000000000000000099" as `0x${string}`,
          data: "0x" as `0x${string}`,
          value: 0n,
          gas_estimate: 100_000,
        }),
      ),
    })),
    createDex: vi.fn(() => ({
      // amount_out is returned as a string so the MCP envelope's
      // JSON.stringify doesn't trip on a bigint. The real adapter
      // implementations may return either shape; the handler under test
      // just forwards the object, so the choice doesn't constrain prod.
      quote: vi.fn(async () => ({
        amount_out: "12345",
        price_impact: 0.001,
      })),
    })),
    createMerchantMoeLB: vi.fn(() => ({
      discoverRewardedPools: vi.fn(async () => []),
      findUserBinsWithBalance: vi.fn(async () => []),
      getUserPositions: vi.fn(async () => []),
      getPendingRewards: vi.fn(async () => []),
    })),
  };
});

// Mock viem so defi_lp_positions's NFT enumeration short-circuits without RPC.
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: vi.fn(async () => 0n),
    }),
    http: () => () => ({}),
  };
});

// Triggering the import after vi.mock is set up registers all tools into our
// captured map. The module's top-level guard prevents stdio.connect() from
// running under vitest, so this is safe and offline.
await import("./mcp-server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OkEnvelope<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}
interface ErrEnvelope {
  ok: false;
  error: string;
  meta?: Record<string, unknown>;
}

async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<{
  ok: boolean;
  payload: OkEnvelope<T> | ErrEnvelope;
  isError: boolean;
}> {
  const handler = registeredTools.get(name);
  if (!handler) throw new Error(`tool '${name}' was never registered`);
  const result = await handler(args);
  const text = result.content[0]?.text ?? "";
  const payload = JSON.parse(text) as OkEnvelope<T> | ErrEnvelope;
  return { ok: payload.ok, payload, isError: !!result.isError };
}

const ENV_KEYS = ["DEFI_WALLET_ADDRESS", "DEFI_PRIVATE_KEY"] as const;
let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  process.env["DEFI_WALLET_ADDRESS"] =
    "0x000000000000000000000000000000000000dEaD";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

// ---------------------------------------------------------------------------
// Tool registry assertions — confirm every handler we plan to test is wired up.
// ---------------------------------------------------------------------------

describe("MCP server registration", () => {
  it("registers all 22 tools at module load time", () => {
    expect(registeredTools.size).toBeGreaterThanOrEqual(22);
  });

  it.each([
    "defi_status",
    "defi_lending_rates",
    "defi_lending_supply",
    "defi_lending_withdraw",
    "defi_dex_quote",
    "defi_lp_positions",
  ])("includes %s", (toolName) => {
    expect(registeredTools.has(toolName)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defi_status — chain + protocol enumeration
// ---------------------------------------------------------------------------

describe("defi_status handler", () => {
  it("returns chain_id + protocol list for a known chain", async () => {
    const { ok, payload } = await callTool<{
      chain: string;
      chain_id: number;
      protocols: Array<{ slug: string; name: string }>;
      summary: { total_protocols: number };
    }>("defi_status", { chain: "hyperevm" });

    expect(ok).toBe(true);
    if (!ok) throw new Error("expected ok envelope");
    expect(payload.data.chain).toBe("hyperevm");
    expect(payload.data.chain_id).toBeGreaterThan(0);
    expect(payload.data.protocols.length).toBeGreaterThan(0);
    expect(payload.data.summary.total_protocols).toBe(payload.data.protocols.length);
  });

  it("defaults to hyperevm when chain is omitted", async () => {
    const { ok, payload } = await callTool<{ chain: string }>(
      "defi_status",
      {},
    );
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.chain).toBe("hyperevm");
  });

  it("returns an err envelope (isError: true) for an unknown chain", async () => {
    const { ok, payload, isError } = await callTool("defi_status", {
      chain: "totally-fake-chain-xyz",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
    if (ok) throw new Error("expected err envelope");
    expect(payload.error).toMatch(/chain|unknown|not found/i);
  });
});

// ---------------------------------------------------------------------------
// defi_lending_rates — adapter.getRates round-trip
// ---------------------------------------------------------------------------

describe("defi_lending_rates handler", () => {
  it("returns the stub adapter's rates payload", async () => {
    const { ok, payload } = await callTool<{
      supply_apy: number;
      borrow_apy: number;
    }>("defi_lending_rates", {
      chain: "hyperevm",
      protocol: "felix-morpho",
      asset: "USDC",
    });
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.supply_apy).toBe(0.05);
    expect(payload.data.borrow_apy).toBe(0.1);
  });

  it("err envelope for unknown protocol", async () => {
    const { ok, payload, isError } = await callTool("defi_lending_rates", {
      chain: "hyperevm",
      protocol: "this-protocol-does-not-exist",
      asset: "USDC",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
    if (ok) throw new Error();
    expect(payload.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// defi_lending_supply — dry-run round-trip through executor
// ---------------------------------------------------------------------------

describe("defi_lending_supply handler", () => {
  it("returns an executor preview for the stub adapter (broadcast omitted = dry run)", async () => {
    const { ok, payload } = await callTool<{
      status: string;
      tx?: { description?: string; to?: string };
    }>("defi_lending_supply", {
      chain: "hyperevm",
      protocol: "felix-morpho",
      asset: "USDC",
      amount: "1000000",
    });
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    // Executor.execute in dry-run mode returns an ActionResult whose
    // .tx field includes our stub's description.
    expect(payload.data.status).toBeDefined();
  });

  it("threads on_behalf_of into the buildSupply call without throwing", async () => {
    const { ok } = await callTool("defi_lending_supply", {
      chain: "hyperevm",
      protocol: "felix-morpho",
      asset: "USDC",
      amount: "500",
      on_behalf_of: "0x000000000000000000000000000000000000bEEF",
    });
    expect(ok).toBe(true);
  });

  it("err envelope for unknown protocol", async () => {
    const { ok, isError } = await callTool("defi_lending_supply", {
      chain: "hyperevm",
      protocol: "nope",
      asset: "USDC",
      amount: "1",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defi_lending_withdraw
// ---------------------------------------------------------------------------

describe("defi_lending_withdraw handler", () => {
  it("returns an executor preview for the withdraw path", async () => {
    const { ok, payload } = await callTool<{ status: string }>(
      "defi_lending_withdraw",
      {
        chain: "hyperevm",
        protocol: "felix-morpho",
        asset: "USDC",
        amount: "500000",
      },
    );
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.status).toBeDefined();
  });

  it("err envelope for unknown chain", async () => {
    const { ok, isError } = await callTool("defi_lending_withdraw", {
      chain: "ghost-chain",
      protocol: "felix-morpho",
      asset: "USDC",
      amount: "1",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defi_dex_quote — adapter.quote round-trip
// ---------------------------------------------------------------------------

describe("defi_dex_quote handler", () => {
  it("returns the stub adapter's quote (amount_out + price_impact)", async () => {
    // Use a known DEX protocol slug on hyperevm. The stub adapter doesn't
    // care which slug we use — only that registry.getProtocol(slug) succeeds.
    const { ok, payload } = await callTool<{
      amount_out: string;
      price_impact: number;
    }>("defi_dex_quote", {
      chain: "hyperevm",
      protocol: "kittenswap",
      token_in: "USDC",
      token_out: "WHYPE",
      amount_in: "1000000",
    });
    // The handler may serialise bigint via JSON; we accept either string or
    // number representation. The important thing is the round trip succeeded.
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.price_impact).toBe(0.001);
  });

  it("err envelope for unknown chain", async () => {
    const { ok, isError } = await callTool("defi_dex_quote", {
      chain: "ghost-chain",
      protocol: "kittenswap",
      token_in: "USDC",
      token_out: "WHYPE",
      amount_in: "1",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defi_lp_positions — the largest single uncovered handler (lines 1545-1663).
// ---------------------------------------------------------------------------

describe("defi_lp_positions handler", () => {
  it("returns empty positions when every protocol's balanceOf returns 0n", async () => {
    const { ok, payload } = await callTool<{
      chain: string;
      positions: Array<unknown>;
      total: number;
    }>("defi_lp_positions", {
      chain: "hyperevm",
      address: "0x000000000000000000000000000000000000bEEF",
    });
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.chain).toBe("hyperevm");
    expect(payload.data.positions).toEqual([]);
    expect(payload.data.total).toBe(0);
    // Meta should report the wallet + scanned_protocols count.
    expect(payload.meta?.["scanned_protocols"]).toBeGreaterThan(0);
  });

  it("defaults to DEFI_WALLET_ADDRESS when address is omitted", async () => {
    // beforeEach sets DEFI_WALLET_ADDRESS, so the handler should resolve and
    // succeed even with no `address` arg. (Address-required error path is
    // covered by the next test.)
    const { ok } = await callTool("defi_lp_positions", {
      chain: "hyperevm",
    });
    expect(ok).toBe(true);
  });

  it("rejects when no address is given and DEFI_WALLET_ADDRESS is unset", async () => {
    delete process.env["DEFI_WALLET_ADDRESS"];
    const { ok, isError, payload } = await callTool("defi_lp_positions", {
      chain: "hyperevm",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
    if (ok) throw new Error();
    expect(payload.error).toMatch(/address required/i);
  });

  it("--protocol filter narrows enumeration to a single protocol", async () => {
    const { ok, payload } = await callTool<{
      chain: string;
      positions: Array<unknown>;
    }>("defi_lp_positions", {
      chain: "hyperevm",
      protocol: "kittenswap",
      address: "0x000000000000000000000000000000000000bEEF",
    });
    expect(ok).toBe(true);
    if (!ok) throw new Error();
    expect(payload.data.positions).toEqual([]);
    expect(payload.meta?.["scanned_protocols"]).toBe(1);
  });

  it("err envelope for unknown chain", async () => {
    const { ok, isError } = await callTool("defi_lp_positions", {
      chain: "ghost-chain",
      address: "0x000000000000000000000000000000000000bEEF",
    });
    expect(ok).toBe(false);
    expect(isError).toBe(true);
  });
});
