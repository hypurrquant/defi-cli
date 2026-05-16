// Unit tests for provider.ts — the public client cache + SSOT 7.4 chain
// anchor. We assert cache identity by reference and confirm the chainId
// keying so two callers with the same RPC but different `chain` arguments
// don't collide.
import { afterEach, describe, expect, it } from "vitest";
import { defineChain } from "viem";

import { clearProviderCache, getProvider } from "./provider.js";

const CHAIN_A = defineChain({
  id: 12345,
  name: "Test Chain A",
  nativeCurrency: { name: "T", symbol: "T", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc/a"] } },
});

const CHAIN_B = defineChain({
  id: 67890,
  name: "Test Chain B",
  nativeCurrency: { name: "T", symbol: "T", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc/b"] } },
});

afterEach(() => {
  clearProviderCache();
});

describe("getProvider cache", () => {
  it("returns the same PublicClient instance for repeat calls with the same key", () => {
    const a = getProvider("https://rpc/example");
    const b = getProvider("https://rpc/example");
    expect(a).toBe(b);
  });

  it("treats different rpcUrls as different keys", () => {
    const a = getProvider("https://rpc/one");
    const b = getProvider("https://rpc/two");
    expect(a).not.toBe(b);
  });

  it("chain anchor is part of the cache key — same RPC, different chains → different clients", () => {
    const plain = getProvider("https://rpc/shared");
    const anchoredA = getProvider("https://rpc/shared", CHAIN_A);
    const anchoredB = getProvider("https://rpc/shared", CHAIN_B);
    expect(anchoredA).not.toBe(plain);
    expect(anchoredA).not.toBe(anchoredB);

    // Same chain re-passed → still cached.
    const anchoredA2 = getProvider("https://rpc/shared", CHAIN_A);
    expect(anchoredA2).toBe(anchoredA);
  });

  it("clearProviderCache forces a fresh client even for an identical key", () => {
    const before = getProvider("https://rpc/clearme");
    clearProviderCache();
    const after = getProvider("https://rpc/clearme");
    expect(after).not.toBe(before);
  });
});
