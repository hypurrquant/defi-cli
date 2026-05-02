/**
 * Bridge regression tests.
 *
 * Locks v1.0.7 fix: CCTP path rejects amounts below the protocol fee with a
 * structured error envelope (`error` + `minimum_amount_wei` +
 * `minimum_amount_usdc`) instead of returning a negative `estimated_output`
 * that would later make `depositForBurn` revert on-chain.
 *
 * v1.0.5 fix: `bridge --to-chain ethereum/arbitrum/...` resolves via
 * DEST_CHAIN_META map even though those chains were dropped as source chains.
 */
import { describe, it, expect } from "vitest";
import { cctpMinFeeGuard, resolveDestChain, DEST_CHAIN_META } from "./bridge.js";
import { Registry } from "@hypurrquant/defi-core";

describe("cctpMinFeeGuard — v1.0.7", () => {
  it("returns null when amount is above the fee", () => {
    expect(cctpMinFeeGuard(1_000_000n, 250_000n, 0.25)).toBeNull();
  });

  it("returns a structured error envelope when amount equals the fee", () => {
    // amount == fee is rejected (caller would receive 0 USDC after the fee).
    const err = cctpMinFeeGuard(250_000n, 250_000n, 0.25);
    expect(err).not.toBeNull();
    expect(err!.minimum_amount_wei).toBe("250000");
    expect(err!.minimum_amount_usdc).toBe(0.25);
    expect(err!.error).toContain("below the minimum bridge fee");
  });

  it("returns a structured error envelope when amount is below the fee", () => {
    const err = cctpMinFeeGuard(100_000n, 250_000n, 0.25);
    expect(err).not.toBeNull();
    expect(err!.error).toContain("100000");
    expect(err!.error).toContain("0.25 USDC");
    expect(err!.minimum_amount_wei).toBe("250000");
    expect(err!.minimum_amount_usdc).toBe(0.25);
  });
});

describe("resolveDestChain — v1.0.5 destination resolution", () => {
  const registry = Registry.loadEmbedded();

  it("returns the registry chain when source-registered (e.g. base)", () => {
    const got = resolveDestChain(registry, "base");
    expect(got.chain_id).toBe(8453);
    expect(got.name.toLowerCase()).toContain("base");
  });

  it("falls back to DEST_CHAIN_META for ethereum (bridge-only)", () => {
    const got = resolveDestChain(registry, "ethereum");
    expect(got.chain_id).toBe(1);
    expect(got.name).toBe("Ethereum");
  });

  it("falls back to DEST_CHAIN_META for arbitrum (bridge-only)", () => {
    const got = resolveDestChain(registry, "arbitrum");
    expect(got.chain_id).toBe(42161);
  });

  it("throws a helpful error for unknown destinations (lists DEST_CHAIN_META)", () => {
    expect(() => resolveDestChain(registry, "totally-fake-chain")).toThrow(/Unknown destination chain.*ethereum.*arbitrum/i);
  });
});

describe("DEST_CHAIN_META covers the canonical bridge-only chains", () => {
  it("contains ethereum / arbitrum / optimism / polygon / avalanche", () => {
    expect(DEST_CHAIN_META.ethereum?.chain_id).toBe(1);
    expect(DEST_CHAIN_META.arbitrum?.chain_id).toBe(42161);
    expect(DEST_CHAIN_META.optimism?.chain_id).toBe(10);
    expect(DEST_CHAIN_META.polygon?.chain_id).toBe(137);
    expect(DEST_CHAIN_META.avalanche?.chain_id).toBe(43114);
  });
});
