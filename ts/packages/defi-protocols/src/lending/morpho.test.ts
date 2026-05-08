/**
 * Morpho Blue adapter regression tests — verifies that supply/borrow/
 * repay/withdraw plus the new supplyCollateral/withdrawCollateral
 * methods all encode the right calldata when a marketId is pinned.
 *
 * Pre-2026-05-07 the adapter shipped a `defaultMarketParams(asset)`
 * stub that returned all-zero MarketParams; every direct-Morpho-Blue
 * tx therefore reverted on-chain. This file pins the post-fix contract:
 * caller passes a 32-byte marketId, the adapter dynamically resolves
 * MarketParams via `Morpho.idToMarketParams(id)`, and the calldata
 * matches the resolved tuple.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import type { Address, Hex } from "viem";
import { ProtocolCategory, InterestRateMode, type ProtocolEntry } from "@hypurrquant/defi-core";

const MORPHO = "0x6c247b1F6182318877311737BaC0844bAa518F5e" as Address;
const LOAN_TOKEN = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as Address; // AUSD
const COLLAT_TOKEN = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address; // WMON
const ORACLE = "0x409b68a5986a84fD90761BAEb34cB242a2ee02eF" as Address;
const IRM = "0x09475a3D6eA8c314c592b1a3799bDE044E2F400F" as Address;
const LLTV = 770000000000000000n; // 77%
const MARKET_ID = "0xfa0b720389b546fcf8562c18cda8c00460072b63776add7fbfe8cd4f06d7c3ba" as `0x${string}`;
const ON_BEHALF = "0x000000000000000000000000000000000000dEaD" as Address;

function makeEntry(): ProtocolEntry {
  return {
    name: "Morpho Blue Monad",
    slug: "morpho-blue-monad",
    category: ProtocolCategory.Lending,
    interface: "morpho_blue",
    chain: "monad",
    contracts: { morpho_blue: MORPHO },
  } as ProtocolEntry;
}

const readContractMock = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: readContractMock }),
    http: () => () => ({}),
  };
});

const SUPPLY_ABI = parseAbi([
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data)",
]);
const BORROW_ABI = parseAbi([
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)",
]);
const REPAY_ABI = parseAbi([
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data)",
]);
const WITHDRAW_ABI = parseAbi([
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)",
]);
const SUPPLY_COLLATERAL_ABI = parseAbi([
  "function supplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data)",
]);
const WITHDRAW_COLLATERAL_ABI = parseAbi([
  "function withdrawCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, address receiver)",
]);

function mockMarketParamsResolution(): void {
  // idToMarketParams returns the canonical AUSD/WMON tuple
  readContractMock.mockResolvedValueOnce([LOAN_TOKEN, COLLAT_TOKEN, ORACLE, IRM, LLTV]);
}

interface MarketTuple {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

function expectMarketParamsMatch(tuple: MarketTuple): void {
  expect(tuple.loanToken).toBe(LOAN_TOKEN);
  expect(tuple.collateralToken).toBe(COLLAT_TOKEN);
  expect(tuple.oracle).toBe(ORACLE);
  expect(tuple.irm).toBe(IRM);
  expect(tuple.lltv).toBe(LLTV);
}

describe("MorphoBlueAdapter — direct-market path with marketId", () => {
  beforeEach(() => readContractMock.mockReset());

  it("buildSupply with marketId resolves MarketParams and encodes loan-side supply", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildSupply({
      protocol: "Morpho Blue Monad",
      asset: LOAN_TOKEN,
      amount: 1_000_000n,
      on_behalf_of: ON_BEHALF,
      market_id: MARKET_ID,
    });
    expect(tx.to).toBe(MORPHO);
    const decoded = decodeFunctionData({ abi: SUPPLY_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(decoded.args[1]).toBe(1_000_000n); // assets
    expect(decoded.args[2]).toBe(0n); // shares (0 means amount-based)
    expect(decoded.args[3]).toBe(ON_BEHALF);
    expect(tx.approvals).toEqual([{ token: LOAN_TOKEN, spender: MORPHO, amount: 1_000_000n }]);
  });

  it("buildBorrow with marketId encodes a Pool.borrow call against the resolved tuple", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildBorrow({
      protocol: "Morpho Blue Monad",
      asset: LOAN_TOKEN,
      amount: 50_000n,
      interest_rate_mode: InterestRateMode.Variable,
      on_behalf_of: ON_BEHALF,
      market_id: MARKET_ID,
    });
    expect(tx.to).toBe(MORPHO);
    const decoded = decodeFunctionData({ abi: BORROW_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(decoded.args[1]).toBe(50_000n);
    expect(decoded.args[3]).toBe(ON_BEHALF);
    expect(decoded.args[4]).toBe(ON_BEHALF); // receiver
  });

  it("buildBorrow without marketId throws a clear DefiError", async () => {
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    await expect(
      adapter.buildBorrow({
        protocol: "Morpho Blue Monad",
        asset: LOAN_TOKEN,
        amount: 1n,
        interest_rate_mode: InterestRateMode.Variable,
        on_behalf_of: ON_BEHALF,
      }),
    ).rejects.toThrow(/marketId/);
  });

  it("buildRepay with marketId attaches approvals[]", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildRepay({
      protocol: "Morpho Blue Monad",
      asset: LOAN_TOKEN,
      amount: 25_000n,
      interest_rate_mode: InterestRateMode.Variable,
      on_behalf_of: ON_BEHALF,
      market_id: MARKET_ID,
    });
    const decoded = decodeFunctionData({ abi: REPAY_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(tx.approvals).toEqual([{ token: LOAN_TOKEN, spender: MORPHO, amount: 25_000n }]);
  });

  it("buildWithdraw with marketId routes loan-side withdrawal to Morpho.withdraw", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildWithdraw({
      protocol: "Morpho Blue Monad",
      asset: LOAN_TOKEN,
      amount: 10_000n,
      to: ON_BEHALF,
      market_id: MARKET_ID,
    });
    expect(tx.to).toBe(MORPHO);
    const decoded = decodeFunctionData({ abi: WITHDRAW_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(decoded.args[3]).toBe(ON_BEHALF); // onBehalf = to
    expect(decoded.args[4]).toBe(ON_BEHALF); // receiver = to
  });

  it("buildSupplyCollateral encodes supplyCollateral with the resolved tuple", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildSupplyCollateral!({
      protocol: "Morpho Blue Monad",
      asset: COLLAT_TOKEN,
      amount: 500_000n,
      on_behalf_of: ON_BEHALF,
      market_id: MARKET_ID,
    });
    expect(tx.to).toBe(MORPHO);
    const decoded = decodeFunctionData({ abi: SUPPLY_COLLATERAL_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(decoded.args[1]).toBe(500_000n);
    expect(decoded.args[2]).toBe(ON_BEHALF);
    expect(tx.approvals).toEqual([{ token: COLLAT_TOKEN, spender: MORPHO, amount: 500_000n }]);
  });

  it("buildWithdrawCollateral encodes withdrawCollateral", async () => {
    mockMarketParamsResolution();
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    const tx = await adapter.buildWithdrawCollateral!({
      protocol: "Morpho Blue Monad",
      asset: COLLAT_TOKEN,
      amount: 500_000n,
      to: ON_BEHALF,
      market_id: MARKET_ID,
    });
    expect(tx.to).toBe(MORPHO);
    const decoded = decodeFunctionData({ abi: WITHDRAW_COLLATERAL_ABI, data: tx.data as Hex });
    expectMarketParamsMatch(decoded.args[0] as MarketTuple);
    expect(decoded.args[1]).toBe(500_000n);
    expect(decoded.args[2]).toBe(ON_BEHALF);
    expect(decoded.args[3]).toBe(ON_BEHALF);
  });

  it("rejects when idToMarketParams returns an empty tuple (zero-init guard)", async () => {
    // Pre-fix bug class: passing a marketId that the deployment doesn't
    // know about caused the adapter to silently send all-zero params and
    // revert on-chain. Now we throw a clear error before the user spends
    // gas on an unknown market.
    readContractMock.mockResolvedValueOnce([
      "0x0000000000000000000000000000000000000000" as Address,
      "0x0000000000000000000000000000000000000000" as Address,
      "0x0000000000000000000000000000000000000000" as Address,
      "0x0000000000000000000000000000000000000000" as Address,
      0n,
    ]);
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    await expect(
      adapter.buildSupply({
        protocol: "Morpho Blue Monad",
        asset: LOAN_TOKEN,
        amount: 1n,
        on_behalf_of: ON_BEHALF,
        market_id: "0x0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow(/empty MarketParams|registered market/);
  });
});

describe("MorphoBlueAdapter — named-market lookup (US-B4)", () => {
  beforeEach(() => readContractMock.mockReset());

  function makeEntryWithMarkets(): ProtocolEntry {
    return {
      ...makeEntry(),
      markets: [
        {
          name: "WMON-AUSD",
          id: MARKET_ID,
          loan_asset: "AUSD",
          collateral_asset: "WMON",
          lltv: "770000000000000000",
        },
        {
          name: "TETH-TUSD",
          id: "0xfdfec1ced463198bba499c38a43c04a5919cab0472a298c4c68041b225d16563" as `0x${string}`,
          loan_asset: "TUSD",
          collateral_asset: "TETH",
          lltv: "860000000000000000",
        },
      ],
    } as ProtocolEntry;
  }

  it("resolveMarketIdByName: matches a registered name (case-insensitive)", async () => {
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntryWithMarkets(), "https://example/monad");
    expect(adapter.resolveMarketIdByName("WMON-AUSD")).toBe(MARKET_ID);
    // case-insensitive lookup matches "wmon-ausd"
    expect(adapter.resolveMarketIdByName("wmon-ausd")).toBe(MARKET_ID);
  });

  it("resolveMarketIdByName: returns null on unknown name (caller falls back / surfaces error)", async () => {
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntryWithMarkets(), "https://example/monad");
    expect(adapter.resolveMarketIdByName("UNKNOWN-MARKET")).toBeNull();
  });

  it("listNamedMarkets: returns the registered markets for diagnostics", async () => {
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntryWithMarkets(), "https://example/monad");
    const list = adapter.listNamedMarkets();
    expect(list.length).toBe(2);
    expect(list.map((m) => m.name)).toEqual(["WMON-AUSD", "TETH-TUSD"]);
  });

  it("falls back to empty registry when no markets[] in TOML — preserves backward compatibility", async () => {
    const { MorphoBlueAdapter } = await import("./morpho.js");
    const adapter = new MorphoBlueAdapter(makeEntry(), "https://example/monad");
    expect(adapter.resolveMarketIdByName("anything")).toBeNull();
    expect(adapter.listNamedMarkets()).toEqual([]);
  });
});
