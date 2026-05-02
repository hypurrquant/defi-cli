/**
 * Compound V2 / Venus adapter regression tests.
 *
 * Locks behaviour fixed in v1.0.5–v1.0.8:
 * - v1.0.5: per-asset `getRates` (resolves the vToken whose underlying() matches
 *   the requested asset, instead of using a single defaultVtoken — which made
 *   cross-asset yield scans report the wrong APY).
 * - v1.0.6: utilization unit fix — `totalSupply()` returns vToken units; must
 *   convert to underlying via `* exchangeRateStored() / 1e18` before dividing
 *   by `totalBorrows()` (which is already underlying-denominated).
 * - v1.0.8: per-asset routing in builders + `approvals[]` entry +
 *   `redeemUnderlying` selector for buildWithdraw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import type { Address } from "viem";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import { InterestRateMode, ProtocolCategory } from "@hypurrquant/defi-core";

const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255" as Address;
const VUSDC = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8" as Address;
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as Address;
const USDT_UNDERLYING = "0x55d398326f99059fF775485246999027B3197955" as Address;
const USDC_UNDERLYING = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address;
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as Address;

function makeEntry(): ProtocolEntry {
  return {
    name: "Venus",
    slug: "venus-bnb",
    category: ProtocolCategory.Lending,
    interface: "compound_v2",
    chain: "bnb",
    contracts: {
      vusdt: VUSDT,
      vusdc: VUSDC,
      vbnb: VBNB,
      comptroller: COMPTROLLER,
    },
  } as ProtocolEntry;
}

const readContractMock = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: readContractMock,
    }),
    http: () => () => ({}),
  };
});

/**
 * Inject the vToken→underlying map so resolveVtoken short-circuits the RPC
 * lookup. Used by builder tests that don't care about getRates / position RPC.
 */
function injectCache(adapter: unknown): void {
  (adapter as { vTokenByAsset: Map<string, Address> }).vTokenByAsset = new Map<string, Address>([
    [USDT_UNDERLYING.toLowerCase(), VUSDT],
    [USDC_UNDERLYING.toLowerCase(), VUSDC],
  ]);
}

describe("CompoundV2Adapter — v1.0.8 builder regressions", () => {
  beforeEach(() => readContractMock.mockReset());

  it("buildSupply routes USDT to vUSDT (not the default vToken)", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildSupply({
      protocol: "Venus",
      asset: USDT_UNDERLYING,
      amount: 1_000_000_000_000_000_000n,
      on_behalf_of: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.to).toBe(VUSDT);
  });

  it("buildSupply routes USDC to vUSDC (different from USDT)", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildSupply({
      protocol: "Venus",
      asset: USDC_UNDERLYING,
      amount: 1_000_000_000_000_000_000n,
      on_behalf_of: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.to).toBe(VUSDC);
    expect(tx.to).not.toBe(VUSDT);
  });

  it("buildSupply emits an approvals[] entry so the executor can auto-approve", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildSupply({
      protocol: "Venus",
      asset: USDT_UNDERLYING,
      amount: 500_000_000_000_000_000n,
      on_behalf_of: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.approvals).toEqual([
      { token: USDT_UNDERLYING, spender: VUSDT, amount: 500_000_000_000_000_000n },
    ]);
  });

  it("buildBorrow routes USDC to vUSDC and emits selector 0xc5ebeaec", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildBorrow({
      protocol: "Venus",
      asset: USDC_UNDERLYING,
      amount: 750_000n,
      interest_rate_mode: InterestRateMode.Variable,
      on_behalf_of: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.to).toBe(VUSDC);
    expect(tx.data.slice(0, 10).toLowerCase()).toBe("0xc5ebeaec");
    const decoded = decodeFunctionData({
      abi: parseAbi(["function borrow(uint256)"]),
      data: tx.data,
    });
    expect(decoded.args).toEqual([750_000n]);
  });

  it("buildWithdraw uses redeemUnderlying (selector 0x852a12e3), not redeem", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildWithdraw({
      protocol: "Venus",
      asset: USDT_UNDERLYING,
      amount: 1_000_000n,
      to: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.data.slice(0, 10).toLowerCase()).toBe("0x852a12e3");
    const decoded = decodeFunctionData({
      abi: parseAbi(["function redeemUnderlying(uint256)"]),
      data: tx.data,
    });
    expect(decoded.args).toEqual([1_000_000n]);
  });

  it("buildRepay attaches approvals[] for the requested asset", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    const tx = await adapter.buildRepay({
      protocol: "Venus",
      asset: USDT_UNDERLYING,
      amount: 250_000n,
      interest_rate_mode: InterestRateMode.Variable,
      on_behalf_of: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(tx.approvals?.[0]?.token).toBe(USDT_UNDERLYING);
    expect(tx.approvals?.[0]?.spender).toBe(VUSDT);
  });
});

describe("CompoundV2Adapter — v1.0.5 per-asset getRates routing", () => {
  beforeEach(() => readContractMock.mockReset());

  it("uses the vToken whose underlying() matches the requested asset", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    // resolveVtoken's lazy lookup: one underlying() per vToken candidate.
    // 3 candidates (vusdt, vusdc, vbnb) → 3 calls. We want USDC.
    readContractMock
      .mockResolvedValueOnce(USDT_UNDERLYING) // vusdt.underlying()
      .mockResolvedValueOnce(USDC_UNDERLYING) // vusdc.underlying()  ← match
      .mockResolvedValueOnce("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address) // vbnb.underlying() (WBNB)
      // getRates per-vToken reads: supplyRatePerBlock, borrowRatePerBlock,
      // totalSupply, totalBorrows, exchangeRateStored — all on the resolved vToken.
      .mockResolvedValueOnce(100_000_000_000n) // supplyRatePerBlock
      .mockResolvedValueOnce(200_000_000_000n) // borrowRatePerBlock
      .mockResolvedValueOnce(1_000_000n) // totalSupply (vToken units)
      .mockResolvedValueOnce(50_000_000_000_000_000n) // totalBorrows (underlying)
      .mockResolvedValueOnce(2n * 10n ** 17n); // exchangeRateStored = 0.2
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    const rates = await adapter.getRates(USDC_UNDERLYING);
    expect(rates.protocol).toBe("Venus");
    expect(rates.asset).toBe(USDC_UNDERLYING);
  });

  it("returns zero rates when no vToken matches the asset (graceful degradation)", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    readContractMock
      .mockResolvedValueOnce(USDT_UNDERLYING)
      .mockResolvedValueOnce(USDC_UNDERLYING)
      .mockResolvedValueOnce("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address);
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    // Asset that no vToken supports → adapter returns zero rates instead of throwing.
    const unknownAsset = "0x1111111111111111111111111111111111111111" as Address;
    const rates = await adapter.getRates(unknownAsset);
    expect(rates.supply_apy).toBe(0);
    expect(rates.utilization).toBe(0);
    expect(rates.total_supply).toBe(0n);
  });
});

describe("CompoundV2Adapter — v1.0.6 utilization unit conversion", () => {
  beforeEach(() => readContractMock.mockReset());

  it("converts vToken totalSupply to underlying via exchangeRate before computing utilization", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    // Pre-populate the cache so resolveVtoken doesn't issue underlying() calls.
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    // Ratio: totalSupply 1M vToken × exchangeRate 0.2 = 200k underlying.
    // totalBorrows = 100k underlying. utilization = 50%.
    // (Pre-v1.0.6 bug: 100k / 1M = 10% — wildly understated.)
    readContractMock
      .mockResolvedValueOnce(0n) // supplyRatePerBlock
      .mockResolvedValueOnce(0n) // borrowRatePerBlock
      .mockResolvedValueOnce(1_000_000n) // totalSupply (vToken units)
      .mockResolvedValueOnce(100_000n) // totalBorrows (underlying — 100k)
      .mockResolvedValueOnce(2n * 10n ** 17n); // exchangeRate = 0.2 → underlying supply 200k
    const rates = await adapter.getRates(USDC_UNDERLYING);
    expect(rates.utilization).toBe(50); // 100k / 200k = 50%
    expect(rates.total_supply).toBe(200_000n); // converted from vToken units
    expect(rates.total_borrow).toBe(100_000n);
  });

  it("falls back to vToken units when exchangeRate read returns 0 (defensive)", async () => {
    const { CompoundV2Adapter } = await import("./compound_v2.js");
    const adapter = new CompoundV2Adapter(makeEntry(), "https://example/bnb");
    injectCache(adapter);
    readContractMock
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1_000_000n)
      .mockResolvedValueOnce(100_000n)
      .mockResolvedValueOnce(0n); // exchangeRate failure → fall back to raw vToken supply
    const rates = await adapter.getRates(USDC_UNDERLYING);
    expect(rates.total_supply).toBe(1_000_000n);
  });
});
