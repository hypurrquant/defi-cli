import { describe, it, expect } from "vitest";
import { Registry } from "./registry.js";
import { ProtocolCategory } from "./protocol.js";

describe("Registry", () => {
  it("loads embedded config successfully", () => {
    const registry = Registry.loadEmbedded();
    expect(registry).toBeDefined();
  });

  it("has 40 chains", () => {
    const registry = Registry.loadEmbedded();
    const chains = [
      "hyperevm", "arbitrum", "base", "bnb", "ethereum",
      "polygon", "avalanche", "optimism", "scroll", "linea", "mantle",
      "ink", "monad", "cronos", "rootstock", "gnosis",
      "berachain", "kava", "sei", "unichain", "blast", "sonic",
      "worldchain", "fraxtal", "core", "celo",
      "zksync", "abstract", "soneium", "manta", "taiko", "metis",
      "canto", "aurora", "boba", "moonbeam", "mode", "moonriver",
      "zircuit", "harmony",
    ];
    for (const name of chains) {
      const chain = registry.getChain(name);
      expect(chain).toBeDefined();
      expect(chain.chain_id).toBeGreaterThan(0);
    }
  });

  it("hyperevm has chainId 999", () => {
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain("hyperevm");
    expect(chain.chain_id).toBe(999);
  });

  it("loads 108 protocol configs", () => {
    const registry = Registry.loadEmbedded();
    const all = registry.getProtocolsByCategory(ProtocolCategory.Dex)
      .concat(registry.getProtocolsByCategory(ProtocolCategory.Lending))
      .concat(registry.getProtocolsByCategory(ProtocolCategory.Cdp))
      .concat(registry.getProtocolsByCategory(ProtocolCategory.LiquidStaking))
      .concat(registry.getProtocolsByCategory(ProtocolCategory.Vault))
      .concat(registry.getProtocolsByCategory(ProtocolCategory.YieldAggregator));
    expect(all.length).toBeGreaterThan(0);
  });

  it("getProtocolsForChain returns protocols for hyperevm", () => {
    const registry = Registry.loadEmbedded();
    const protocols = registry.getProtocolsForChain("hyperevm");
    expect(protocols.length).toBeGreaterThan(10);
  });

  it("resolveToken finds USDC on hyperevm", () => {
    const registry = Registry.loadEmbedded();
    const token = registry.resolveToken("hyperevm", "USDC");
    expect(token).toBeDefined();
    expect(token.symbol).toBe("USDC");
    expect(token.address).toMatch(/^0x/);
    expect(token.decimals).toBe(6);
  });

  it("throws for unknown chain", () => {
    const registry = Registry.loadEmbedded();
    expect(() => registry.getChain("nonexistent")).toThrow();
  });

  it("throws for unknown token", () => {
    const registry = Registry.loadEmbedded();
    expect(() => registry.resolveToken("hyperevm", "NONEXISTENT")).toThrow();
  });
});
