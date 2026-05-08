/**
 * Aave V3 adapter regression tests.
 *
 * Locks v1.0.9 fix: `buildWithdraw` auto-caps the requested amount to
 * `type(uint256).max` when `amount >= aTokenBalance`, so Aave's "withdraw all"
 * path handles 1-wei rounding drift on the scaled-index aToken accounting.
 *
 * Approach: vi.mock viem so `createPublicClient.readContract` returns a fake
 * reserve-data tuple + aToken balance. The adapter's RPC branch then runs end
 * to end without a live RPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import type { Address } from "viem";
import { ProtocolCategory, type ProtocolEntry } from "@hypurrquant/defi-core";

const POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const ATOKEN = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as Address;
const RECIPIENT = "0x000000000000000000000000000000000000dEaD" as Address;

const WITHDRAW_ABI = parseAbi([
  "function withdraw(address asset, uint256 amount, address to)",
]);

function makeEntry(): ProtocolEntry {
  return {
    name: "Aave V3 Base",
    slug: "aave-v3-base",
    category: ProtocolCategory.Lending,
    interface: "aave_v3",
    chain: "base",
    contracts: { pool: POOL },
  } as ProtocolEntry;
}

// Reserve-data tuple as `getReserveData` returns it. Index [8] is aTokenAddress.
function makeReserveData(aToken: Address): readonly unknown[] {
  return [0n, 0n, 0n, 0n, 0n, 0n, 0, 0, aToken, aToken, aToken, aToken, 0n, 0n, 0n];
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

describe("AaveV3Adapter — v1.0.9 buildWithdraw auto-cap", () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  it("auto-caps to uint256.max when amount >= aToken balance (the v1.0.9 fix)", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    readContractMock
      .mockResolvedValueOnce(makeReserveData(ATOKEN)) // getReserveData
      .mockResolvedValueOnce(500_000n); // aToken balanceOf — caller asks for 600k, balance is 500k
    const adapter = new AaveV3Adapter(makeEntry(), "https://example/base");
    const tx = await adapter.buildWithdraw({
      protocol: "Aave V3 Base",
      asset: USDC,
      amount: 600_000n,
      to: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: WITHDRAW_ABI, data: tx.data });
    const UINT256_MAX = (1n << 256n) - 1n;
    expect(decoded.args).toEqual([USDC, UINT256_MAX, RECIPIENT]);
    expect(tx.description).toContain("auto-max");
  });

  it("preserves caller-supplied amount when amount < aToken balance", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    readContractMock
      .mockResolvedValueOnce(makeReserveData(ATOKEN))
      .mockResolvedValueOnce(1_000_000n); // balance 1M, caller asks 100k → no auto-cap
    const adapter = new AaveV3Adapter(makeEntry(), "https://example/base");
    const tx = await adapter.buildWithdraw({
      protocol: "Aave V3 Base",
      asset: USDC,
      amount: 100_000n,
      to: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: WITHDRAW_ABI, data: tx.data });
    expect(decoded.args).toEqual([USDC, 100_000n, RECIPIENT]);
    expect(tx.description).not.toContain("auto-max");
  });

  it("preserves caller-supplied amount when no rpcUrl is configured (offline mode)", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry()); // no rpcUrl
    const tx = await adapter.buildWithdraw({
      protocol: "Aave V3 Base",
      asset: USDC,
      amount: 500_000n,
      to: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: WITHDRAW_ABI, data: tx.data });
    expect(decoded.args).toEqual([USDC, 500_000n, RECIPIENT]);
    expect(readContractMock).not.toHaveBeenCalled();
  });

  it("falls back to caller amount when RPC throws (degraded-network safety)", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    readContractMock.mockRejectedValueOnce(new Error("RPC unreachable"));
    const adapter = new AaveV3Adapter(makeEntry(), "https://example/base");
    const tx = await adapter.buildWithdraw({
      protocol: "Aave V3 Base",
      asset: USDC,
      amount: 250_000n,
      to: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: WITHDRAW_ABI, data: tx.data });
    expect(decoded.args).toEqual([USDC, 250_000n, RECIPIENT]);
  });

  it("emits the withdraw selector 0x69328dec", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry()); // offline path is enough
    const tx = await adapter.buildWithdraw({
      protocol: "Aave V3 Base",
      asset: USDC,
      amount: 1n,
      to: RECIPIENT,
    });
    expect(tx.data.slice(0, 10).toLowerCase()).toBe("0x69328dec");
    expect(tx.to).toBe(POOL);
  });
});

// 2026-05-07 borrow-lifecycle unblocking. Pre-fix the BNB Aave V3 borrow
// path reverted because the adapter never emitted the
// `setUserUseReserveAsCollateral` toggle that isolation-mode reserves
// require before non-isolation borrows are allowed. Live verification
// post-fix on BNB:
//   supply  0x5b4481dc…  toggle  0x1c078498…  borrow  0xb7b34740…
//   repay   0xe294a035…  withdraw 0xf5ef3065…  (block 96,854,907 area)
describe("AaveV3Adapter — Pool toggles for isolation/eMode", () => {
  beforeEach(() => readContractMock.mockReset());

  it("buildSetUseReserveAsCollateral encodes (asset, true) and targets the Pool", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry()); // offline; no RPC needed
    const tx = await adapter.buildSetUseReserveAsCollateral(USDC, true);
    expect(tx.to).toBe(POOL);
    const decoded = decodeFunctionData({
      abi: parseAbi(["function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)"]),
      data: tx.data,
    });
    expect(decoded.args).toEqual([USDC, true]);
    expect(tx.description).toContain("Enable");
    expect(tx.value).toBe(0n);
  });

  it("buildSetUseReserveAsCollateral encodes (asset, false) on disable", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry());
    const tx = await adapter.buildSetUseReserveAsCollateral(USDC, false);
    const decoded = decodeFunctionData({
      abi: parseAbi(["function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)"]),
      data: tx.data,
    });
    expect(decoded.args).toEqual([USDC, false]);
    expect(tx.description).toContain("Disable");
  });

  it("buildSetEMode encodes the right uint8 category id", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry());
    const tx = await adapter.buildSetEMode(2);
    expect(tx.to).toBe(POOL);
    const decoded = decodeFunctionData({
      abi: parseAbi(["function setUserEMode(uint8 categoryId)"]),
      data: tx.data,
    });
    expect(decoded.args).toEqual([2]);
    expect(tx.description).toContain("category to 2");
  });

  it("buildSetEMode 0 description marks the opt-out", async () => {
    const { AaveV3Adapter } = await import("./aave_v3.js");
    const adapter = new AaveV3Adapter(makeEntry());
    const tx = await adapter.buildSetEMode(0);
    expect(tx.description).toContain("opt out");
  });
});
