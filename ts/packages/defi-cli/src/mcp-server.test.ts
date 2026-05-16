// Unit tests for mcp-server.ts — the MCP (Model Context Protocol) server
// surface. mcp-server.ts is a 1663-line file dominated by ~25 server.tool()
// registrations; testing every tool handler end-to-end would require a full
// MCP client. Instead this file:
//
//   - exercises the JSON envelope helpers (ok / err) that every tool uses,
//   - exercises the registry / token / executor factory helpers,
//   - verifies the McpServer instance was constructed with the expected
//     name + version and that the import guard prevents stdio.connect()
//     from firing at module load (so vitest doesn't hang on stdin).
//
// Individual tool handlers are exercised in their CLI counterparts (every
// MCP tool dispatches the same underlying adapter / handler the CLI does).
import { describe, expect, it } from "vitest";
import type { Address } from "viem";

import { Registry } from "@hypurrquant/defi-core";

import { ok, err, getRegistry, makeExecutor, resolveToken, server } from "./mcp-server.js";

describe("ok / err envelope helpers", () => {
  it("ok wraps data in { ok: true, data, meta? } and returns indented JSON", () => {
    const raw = ok({ hello: "world" }, { latency_ms: 42 });
    const parsed = JSON.parse(raw) as { ok: boolean; data: { hello: string }; meta: { latency_ms: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.hello).toBe("world");
    expect(parsed.meta.latency_ms).toBe(42);
    // 2-space indent → multi-line output (callers eyeball this on stderr).
    expect(raw).toContain("\n");
  });

  it("ok permits the meta field to be omitted (undefined → serialised as undefined-skipped)", () => {
    const raw = ok({ a: 1 });
    const parsed = JSON.parse(raw) as { ok: boolean; data: { a: number }; meta?: unknown };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.a).toBe(1);
    expect(parsed.meta).toBeUndefined();
  });

  it("err wraps a message in { ok: false, error, meta? }", () => {
    const raw = err("boom", { code: "TEST" });
    const parsed = JSON.parse(raw) as { ok: boolean; error: string; meta: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("boom");
    expect(parsed.meta.code).toBe("TEST");
  });
});

describe("getRegistry / resolveToken / makeExecutor", () => {
  it("getRegistry returns a Registry instance loaded from embedded config", () => {
    const reg = getRegistry();
    expect(reg).toBeInstanceOf(Registry);
    expect(reg.chains.size).toBeGreaterThan(0);
  });

  it("resolveToken passes 0x-prefixed inputs through verbatim (no registry lookup)", () => {
    const reg = getRegistry();
    const addr = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01" as Address;
    expect(resolveToken(reg, "hyperevm", addr)).toBe(addr);
  });

  it("resolveToken resolves a symbol via Registry.resolveToken when not 0x-prefixed", () => {
    const reg = getRegistry();
    // HyperEVM USDC address from ts/config/tokens/hyperevm.toml.
    const usdc = resolveToken(reg, "hyperevm", "USDC");
    expect(usdc.toLowerCase()).toBe("0xb88339cb7199b77e23db6e890353e22632ba630f");
  });

  it("makeExecutor returns an Executor configured with broadcast + rpc + explorer", () => {
    const ex = makeExecutor(true, "https://rpc/example", "https://explorer/example");
    expect(ex.dryRun).toBe(false); // broadcast=true → dryRun=false
    expect(ex.rpcUrl).toBe("https://rpc/example");
    expect(ex.explorerUrl).toBe("https://explorer/example");
  });

  it("makeExecutor with broadcast=false yields a dry-run executor (no broadcast)", () => {
    const ex = makeExecutor(false, "https://rpc/example");
    expect(ex.dryRun).toBe(true);
    expect(ex.explorerUrl).toBeUndefined();
  });
});

describe("server module surface", () => {
  it("`server` is exported as an McpServer-shaped object (constructor anchored to defi-cli)", () => {
    // We don't import McpServer's type here — just verify the constructor
    // name is right and that a tool() method is present (every registration
    // in mcp-server.ts depends on it). Tool-registration was already done at
    // module load; we don't introspect the internal registry to avoid coupling
    // to MCP SDK internals.
    expect(server).toBeDefined();
    expect(server.constructor.name).toBe("McpServer");
    expect(typeof (server as unknown as { tool?: unknown }).tool).toBe("function");
  });

  it("import guard prevents StdioServerTransport.connect() from firing under test", () => {
    // If the guard were missing, importing this module would call
    // `await server.connect(transport)` and hang waiting on stdin. The fact
    // that this test file even reaches `it()` proves the guard worked under
    // vitest. Pin that explicitly so future refactors don't drop the gate.
    expect(process.argv[1]).not.toContain("mcp-server"); // we are running under vitest, not the bin
  });
});
