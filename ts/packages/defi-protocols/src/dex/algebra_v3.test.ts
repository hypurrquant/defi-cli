// Tests for AlgebraV3Adapter covering both the SSOT 7.3 slippage guarantees
// and the V2 (NEST, single-hop quoter with pool_deployer) vs Integral
// (KittenSwap, multi-hop quoter with deployer field) dispatch paths.
//
// quote() and the auto-quote leg of buildSwap need an RPC, so we vi.mock viem
// and stub createPublicClient.call/readContract per test. Everything else
// (LP guards, sort branches) is exercised offline.
import { ProtocolCategory } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import {
  decodeFunctionData,
  encodeAbiParameters,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it, vi, beforeEach } from "vitest";

let callStub: ((args: { to: Address; data: Hex }) => Promise<{ data: Hex | "0x" }>) | null = null;

vi.mock("viem", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("viem");
  return {
    ...real,
    createPublicClient: () => ({
      call: async (args: { to: Address; data: Hex }) => {
        if (!callStub) throw new Error("callStub not configured for this test");
        return callStub(args);
      },
    }),
  };
});

const { AlgebraV3Adapter } = await import("./algebra_v3.js");

const LOW = ("0x" + "01".repeat(20)) as Address;
const HIGH = ("0x" + "ff".repeat(20)) as Address;
const RECIPIENT = ("0x" + "be".repeat(20)) as Address;

const ENTRY: ProtocolEntry = {
  name: "test_algebra_v3",
  slug: "test-algebra-v3",
  category: ProtocolCategory.Dex,
  interface: "algebra_v3",
  chain: "hyperevm",
  contracts: {
    router: ("0x" + "01".repeat(20)) as Address,
    quoter: ("0x" + "02".repeat(20)) as Address,
    position_manager: ("0x" + "03".repeat(20)) as Address,
    factory: ("0x" + "04".repeat(20)) as Address,
  },
};

const swapAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) returns (uint256)",
]);

const v2MintAbi = parseAbi([
  "function mint((address token0, address token1, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256, uint128, uint256, uint256)",
]);

const decreaseAbi = parseAbi([
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint256, uint256)",
]);

const multicallAbi = parseAbi(["function multicall(bytes[] data) returns (bytes[])"]);

interface SwapTuple { amountOutMinimum: bigint }
interface MintTuple { amount0Min: bigint; amount1Min: bigint }
interface DecreaseTuple { amount0Min: bigint; amount1Min: bigint }

describe("AlgebraV3Adapter slippage protection (SSOT 7.3)", () => {
  it("buildSwap honors amount_out_min override (skips the quote path)", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY);
    const tx = await adapter.buildSwap({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 1_000_000n,
      slippage: { bps: 50 },
      recipient: RECIPIENT,
      amount_out_min: 12_345n,
    });
    const decoded = decodeFunctionData({ abi: swapAbi, data: tx.data as Hex });
    const params = decoded.args[0] as SwapTuple;
    expect(params.amountOutMinimum).toBe(12_345n);
    expect(params.amountOutMinimum).not.toBe(0n);
  });

  it("buildAddLiquidity defaults to 50 bps slippage on both axes", async () => {
    // useSingleQuoter is gated on `pool_deployer` (NEST-style Algebra
    // V2). Add it to land in the v2 mint branch whose ABI matches
    // v2MintAbi below. The Integral branch (KittenSwap) ships a
    // `deployer` field and is exercised separately by integration tests.
    const v2Entry: ProtocolEntry = {
      ...ENTRY,
      contracts: {
        ...(ENTRY.contracts as Record<string, Address>),
        pool_deployer: ("0x" + "05".repeat(20)) as Address,
      },
    };
    const adapter = new AlgebraV3Adapter(v2Entry);
    const tx = await adapter.buildAddLiquidity({
      protocol: v2Entry.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      recipient: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: v2MintAbi, data: tx.data as Hex });
    const params = decoded.args[0] as MintTuple;
    // 50 bps = 0.5% → minimum = desired * 9950 / 10000.
    expect(params.amount0Min).toBe(995_000n);
    expect(params.amount1Min).toBe(1_990_000n);
  });

  it("buildRemoveLiquidity refuses to ship without amount_{a,b}_min", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY);
    await expect(
      adapter.buildRemoveLiquidity({
        protocol: ENTRY.slug,
        token_a: LOW,
        token_b: HIGH,
        liquidity: 100n,
        recipient: RECIPIENT,
        token_id: 1n,
      }),
    ).rejects.toThrow(/amount_a_min and amount_b_min/);
  });

  it("buildRemoveLiquidity sorts amount_{a,b}_min onto amount{0,1}Min", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY);
    const tx = await adapter.buildRemoveLiquidity({
      protocol: ENTRY.slug,
      token_a: LOW,
      token_b: HIGH,
      liquidity: 100n,
      recipient: RECIPIENT,
      token_id: 7n,
      amount_a_min: 11n,
      amount_b_min: 22n,
    });
    const outer = decodeFunctionData({ abi: multicallAbi, data: tx.data as Hex });
    const decreaseData = (outer.args[0] as readonly Hex[])[0];
    const decoded = decodeFunctionData({ abi: decreaseAbi, data: decreaseData });
    const params = decoded.args[0] as DecreaseTuple;
    expect(params.amount0Min).toBe(11n);
    expect(params.amount1Min).toBe(22n);
  });
});

// Integral ABI: extra `deployer` field. Used to verify the Integral mint
// path (no pool_deployer in entry.contracts) emits the right calldata.
const integralMintAbi = parseAbi([
  "function mint((address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256, uint128, uint256, uint256)",
]);

interface IntegralMintTuple {
  token0: Address;
  token1: Address;
  amount0Min: bigint;
  amount1Min: bigint;
}

describe("AlgebraV3Adapter V2 vs Integral dispatch", () => {
  it("buildAddLiquidity without pool_deployer uses the Integral mint ABI", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY);
    const tx = await adapter.buildAddLiquidity({
      protocol: ENTRY.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      recipient: RECIPIENT,
    });
    // V2 ABI has 10 fields; Integral has 11 (extra `deployer`). The decoded
    // tuple field count tells us which encoder ran.
    const decoded = decodeFunctionData({ abi: integralMintAbi, data: tx.data as Hex });
    const params = decoded.args[0] as IntegralMintTuple;
    // Auto-sort: LOW < HIGH so token0=LOW, token1=HIGH (LOW=0x01..., HIGH=0xff...)
    expect(params.token0.toLowerCase()).toBe(LOW.toLowerCase());
    expect(params.token1.toLowerCase()).toBe(HIGH.toLowerCase());
    expect(params.amount0Min).toBe(995_000n);
    expect(params.amount1Min).toBe(1_990_000n);
  });

  it("buildAddLiquidity swaps amount{0,1}Min when token_a > token_b", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY);
    // Pass HIGH first → must sort to token0=LOW token1=HIGH, so amount_a
    // (=desired for HIGH) lands on amount1.
    const tx = await adapter.buildAddLiquidity({
      protocol: ENTRY.slug,
      token_a: HIGH,
      token_b: LOW,
      amount_a: 5_000_000n,
      amount_b: 3_000_000n,
      recipient: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: integralMintAbi, data: tx.data as Hex });
    const params = decoded.args[0] as IntegralMintTuple;
    expect(params.token0.toLowerCase()).toBe(LOW.toLowerCase());
    expect(params.token1.toLowerCase()).toBe(HIGH.toLowerCase());
    // amount_b (LOW, 3M) lands on amount0Min after 50bps slippage; amount_a (HIGH, 5M) on amount1Min.
    expect(params.amount0Min).toBe(2_985_000n);
    expect(params.amount1Min).toBe(4_975_000n);
  });
});

beforeEach(() => {
  callStub = null;
});

describe("AlgebraV3Adapter quote() — V2 single-hop quoter (pool_deployer set)", () => {
  const v2Entry: ProtocolEntry = {
    ...ENTRY,
    contracts: {
      ...(ENTRY.contracts as Record<string, Address>),
      pool_deployer: ("0x" + "05".repeat(20)) as Address,
    },
  };

  it("decodes amountOut from the single-quoter return tuple", async () => {
    // algebraSingleQuoterAbi returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceAfter)
    // ABI-encoded as 3 packed words. 42 = amountOut.
    callStub = async () => ({
      data: encodeAbiParameters(
        [
          { name: "amountOut", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "sqrtPriceX96After", type: "uint160" },
        ],
        [42n, 100n, 0n],
      ),
    });
    const adapter = new AlgebraV3Adapter(v2Entry, "https://rpc/example");
    const result = await adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    });
    expect(result.amount_out).toBe(42n);
  });

  it("throws 'quoter returned empty data' when the call returns 0x", async () => {
    callStub = async () => ({ data: "0x" as Hex });
    const adapter = new AlgebraV3Adapter(v2Entry, "https://rpc/example");
    await expect(adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    })).rejects.toThrow(/quoter returned empty data/);
  });
});

describe("AlgebraV3Adapter quote() — Integral multi-hop quoter (no pool_deployer)", () => {
  it("decodes amountOut + fee from the multi-hop tuple", async () => {
    // Integral abi returns (uint256[], uint256[], uint160[], uint32[], uint256, uint16[]).
    // Use single-element lists with amountOut=99 and fee=500 (5bps).
    callStub = async () => ({
      data: encodeAbiParameters(
        [
          { name: "amountOutList", type: "uint256[]" },
          { name: "amountInList", type: "uint256[]" },
          { name: "sqrtPriceX96AfterList", type: "uint160[]" },
          { name: "initializedTicksCrossedList", type: "uint32[]" },
          { name: "gasEstimate", type: "uint256" },
          { name: "feeList", type: "uint16[]" },
        ],
        [[99n], [100n], [0n], [0], 0n, [500]],
      ),
    });
    const adapter = new AlgebraV3Adapter(ENTRY, "https://rpc/example");
    const result = await adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    });
    expect(result.amount_out).toBe(99n);
    expect(result.fee_bps).toBe(50); // 500 / 10
  });

  it("throws when the multi-hop quoter returns short data", async () => {
    callStub = async () => ({ data: "0x1234" as Hex });
    const adapter = new AlgebraV3Adapter(ENTRY, "https://rpc/example");
    await expect(adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    })).rejects.toThrow(/quoter returned empty data/);
  });
});

describe("AlgebraV3Adapter quote() — guards", () => {
  it("throws when no rpcUrl is configured", async () => {
    const adapter = new AlgebraV3Adapter(ENTRY); // no rpcUrl
    await expect(adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    })).rejects.toThrow(/No RPC URL configured/);
  });

  it("throws when no quoter contract is configured", async () => {
    const noQuoterEntry: ProtocolEntry = {
      ...ENTRY,
      contracts: {
        router: ("0x" + "01".repeat(20)) as Address,
        position_manager: ("0x" + "03".repeat(20)) as Address,
        factory: ("0x" + "04".repeat(20)) as Address,
      },
    };
    const adapter = new AlgebraV3Adapter(noQuoterEntry, "https://rpc/example");
    await expect(adapter.quote({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
    })).rejects.toThrow(/No quoter contract configured/);
  });
});

describe("AlgebraV3Adapter buildSwap auto-quote (no amount_out_min override)", () => {
  it("derives amountOutMinimum from quote() and applies 50bps slippage", async () => {
    // Quoter returns 1000 → buildSwap default 50bps slippage → 995 min.
    callStub = async () => ({
      data: encodeAbiParameters(
        [
          { name: "amountOutList", type: "uint256[]" },
          { name: "amountInList", type: "uint256[]" },
          { name: "sqrtPriceX96AfterList", type: "uint160[]" },
          { name: "initializedTicksCrossedList", type: "uint32[]" },
          { name: "gasEstimate", type: "uint256" },
          { name: "feeList", type: "uint16[]" },
        ],
        [[1000n], [100n], [0n], [0], 0n, [500]],
      ),
    });
    const adapter = new AlgebraV3Adapter(ENTRY, "https://rpc/example");
    const tx = await adapter.buildSwap({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 100n,
      slippage: { bps: 50 },
      recipient: RECIPIENT,
    });
    const decoded = decodeFunctionData({ abi: swapAbi, data: tx.data as Hex });
    const params = decoded.args[0] as SwapTuple;
    expect(params.amountOutMinimum).toBe(995n);
  });
});
