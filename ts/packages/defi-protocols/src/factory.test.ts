import { describe, it, expect } from "vitest";
import { ProtocolCategory, type ProtocolEntry } from "@hypurrquant/defi-core";
import { createDex, createLending, createCdp, createVault } from "./factory.js";

function entry(overrides: Partial<ProtocolEntry>): ProtocolEntry {
  return {
    name: "Test",
    slug: "test",
    category: ProtocolCategory.Dex,
    interface: "uniswap_v3",
    chain: "hyperevm",
    ...overrides,
  };
}

describe("factory dispatch", () => {
  it("createDex throws for unknown interface", () => {
    expect(() => createDex(entry({ interface: "no_such_iface" }))).toThrow(
      /not yet implemented/,
    );
  });

  it("createDex throws for uniswap_v4 (singleton not supported)", () => {
    expect(() => createDex(entry({ interface: "uniswap_v4" }))).toThrow(
      /Uniswap V4/,
    );
  });

  it("createLending throws for unknown interface", () => {
    expect(() =>
      createLending(entry({ category: ProtocolCategory.Lending, interface: "no_such" })),
    ).toThrow();
  });

  it("createCdp throws for unknown interface", () => {
    expect(() =>
      createCdp(entry({ category: ProtocolCategory.Cdp, interface: "no_such" })),
    ).toThrow();
  });

  it("createVault throws for unknown interface", () => {
    expect(() =>
      createVault(entry({ category: ProtocolCategory.Vault, interface: "no_such" })),
    ).toThrow();
  });

  it("createDex returns an object with name() for valid interface", () => {
    const adapter = createDex(
      entry({
        interface: "uniswap_v3",
        contracts: {
          router: "0x0000000000000000000000000000000000000001",
          factory: "0x0000000000000000000000000000000000000002",
          quoter: "0x0000000000000000000000000000000000000003",
          position_manager: "0x0000000000000000000000000000000000000004",
        },
      }),
    );
    expect(adapter.name()).toBe("Test");
  });
});
