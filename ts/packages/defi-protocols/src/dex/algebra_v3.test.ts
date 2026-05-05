// Slippage-protection regression tests for AlgebraV3Adapter (SSOT 7.3).
//
// The buildSwap auto-quote path is exercised against a live RPC in
// integration tests; here we cover the explicit override path and the
// LP-side guards that don't require an RPC.
import { ProtocolCategory } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { AlgebraV3Adapter } from "./algebra_v3.js";

const LOW = ("0x" + "01".repeat(20)) as Address;
const HIGH = ("0x" + "ff".repeat(20)) as Address;
const RECIPIENT = ("0x" + "be".repeat(20)) as Address;

const ENTRY: ProtocolEntry = {
  name: "test_algebra_v3",
  slug: "test-algebra-v3",
  category: ProtocolCategory.Dex,
  interface: "algebra_v3",
  chain: "test",
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
