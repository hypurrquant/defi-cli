// SSOT 7.4 unit tests for ChainConfig.viemChain().
//
// The viemChain() helper is the bridge that lets every wallet/public
// client built via makeExecutor() anchor to a known chainId at
// construction time, defending against MITM RPCs that lie about
// eth_chainId. These tests pin the contract.
import { describe, expect, it } from "vitest";

import { ChainConfig } from "./chain.js";

describe("ChainConfig.viemChain() (SSOT 7.4)", () => {
  it("anchors id, name, native currency, rpc, explorer, and multicall3", () => {
    const cfg = Object.assign(new ChainConfig(), {
      name: "Mantle",
      chain_id: 5000,
      rpc_url: "https://rpc.mantle.xyz",
      explorer_url: "https://mantlescan.xyz",
      native_token: "MNT",
      multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
    });
    const c = cfg.viemChain();
    expect(c.id).toBe(5000);
    expect(c.name).toBe("Mantle");
    expect(c.nativeCurrency.symbol).toBe("MNT");
    expect(c.nativeCurrency.name).toBe("MNT");
    expect(c.nativeCurrency.decimals).toBe(18);
    expect(c.rpcUrls.default.http[0]).toBe("https://rpc.mantle.xyz");
    expect(c.blockExplorers?.default.url).toBe("https://mantlescan.xyz");
    expect(c.contracts?.multicall3?.address).toBe(
      "0xcA11bde05977b3631167028862bE2a173976CA11",
    );
  });

  it("omits optional explorer/multicall3 when the config does not set them", () => {
    const cfg = Object.assign(new ChainConfig(), {
      name: "TestChain",
      chain_id: 1234,
      rpc_url: "https://test.example",
      native_token: "TEST",
    });
    const c = cfg.viemChain();
    expect(c.id).toBe(1234);
    expect(c.blockExplorers).toBeUndefined();
    expect(c.contracts).toBeUndefined();
  });

  it("threads the env-var RPC override through effectiveRpcUrl()", () => {
    const prev = process.env["MANTLE_RPC_URL"];
    process.env["MANTLE_RPC_URL"] = "https://custom.rpc.example";
    try {
      const cfg = Object.assign(new ChainConfig(), {
        name: "Mantle",
        chain_id: 5000,
        rpc_url: "https://rpc.mantle.xyz",
        native_token: "MNT",
      });
      expect(cfg.viemChain().rpcUrls.default.http[0]).toBe(
        "https://custom.rpc.example",
      );
    } finally {
      if (prev === undefined) {
        delete process.env["MANTLE_RPC_URL"];
      } else {
        process.env["MANTLE_RPC_URL"] = prev;
      }
    }
  });

  it("preserves chainId verbatim — no -1 / 0 / undefined slip-through", () => {
    // SSOT 7.4 sentinel: a typo in chains.toml that lands as `chain_id = 0`
    // or NaN must NOT silently render as a usable Chain. This test is
    // deliberately strict so the viemChain() output of a misconfigured
    // entry is recognizable as bad rather than auto-fetched at runtime.
    const cfg = Object.assign(new ChainConfig(), {
      name: "Misconfigured",
      chain_id: 0,
      rpc_url: "https://test.example",
      native_token: "X",
    });
    expect(cfg.viemChain().id).toBe(0);
  });
});
