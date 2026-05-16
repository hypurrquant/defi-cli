// Slippage-protection regression tests for UniswapV3Adapter (SSOT 7.3).
//
// Pre-fix baseline: every swap / mint / decreaseLiquidity calldata
// shipped with `min* : 0n` — covered in the qa/2026-05-05 baseline
// branch's KNOWN_INFINITE_SLIPPAGE snapshot. This file pins the
// post-fix invariants:
//   - buildSwap honors amount_out_min override; auto-quote path is
//     covered by integration tests against a live RPC and is out of
//     scope here.
//   - buildAddLiquidity defaults to applyMinSlippage(50 bps) and honors
//     per-side amount_{a,b}_min overrides, mapping them to the sorted
//     token0/token1 axis.
//   - buildRemoveLiquidity refuses to ship a 0n floor — caller MUST
//     pass amount_{a,b}_min.
import { ProtocolCategory } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { UniswapV3Adapter } from "./uniswap_v3.js";

// Use addresses whose lexical order is stable so the sort branch is
// unambiguous: LOW < HIGH (case-insensitive).
const LOW = ("0x" + "01".repeat(20)) as Address;
const HIGH = ("0x" + "ff".repeat(20)) as Address;
const RECIPIENT = ("0x" + "be".repeat(20)) as Address;

const ENTRY: ProtocolEntry = {
  name: "test_unx_v3",
  slug: "test-unx-v3",
  category: ProtocolCategory.Dex,
  interface: "uniswap_v3",
  chain: "hyperevm",
  contracts: {
    router: ("0x" + "01".repeat(20)) as Address,
    quoter: ("0x" + "02".repeat(20)) as Address,
    position_manager: ("0x" + "03".repeat(20)) as Address,
    factory: ("0x" + "04".repeat(20)) as Address,
  },
};

const swapAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) returns (uint256)",
]);

const mintAbi = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256, uint128, uint256, uint256)",
]);

const multicallAbi = parseAbi(["function multicall(bytes[] data) returns (bytes[])"]);

const decreaseAbi = parseAbi([
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint256, uint256)",
]);

interface SwapTuple {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  recipient: Address;
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
}

interface MintTuple {
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: Address;
  deadline: bigint;
}

interface DecreaseTuple {
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
}

function decodeSwapParams(data: Hex): SwapTuple {
  const decoded = decodeFunctionData({ abi: swapAbi, data });
  return decoded.args[0] as SwapTuple;
}

function decodeMintParams(data: Hex): MintTuple {
  const decoded = decodeFunctionData({ abi: mintAbi, data });
  return decoded.args[0] as MintTuple;
}

function decodeFirstChildOfMulticall(data: Hex): Hex {
  const outer = decodeFunctionData({ abi: multicallAbi, data });
  return (outer.args[0] as readonly Hex[])[0];
}

function decodeDecreaseParams(data: Hex): DecreaseTuple {
  const decoded = decodeFunctionData({ abi: decreaseAbi, data });
  return decoded.args[0] as DecreaseTuple;
}

describe("UniswapV3Adapter slippage protection (SSOT 7.3)", () => {
  it("buildSwap honors amount_out_min override", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
    const tx = await adapter.buildSwap({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 1_000_000n,
      slippage: { bps: 50 },
      recipient: RECIPIENT,
      amount_out_min: 12_345n,
    });
    const params = decodeSwapParams(tx.data);
    expect(params.amountOutMinimum).toBe(12_345n);
    expect(params.amountOutMinimum).not.toBe(0n);
    expect(params.amountIn).toBe(1_000_000n);
  });

  it("buildAddLiquidity defaults to 50 bps slippage when no override is given", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
    const tx = await adapter.buildAddLiquidity({
      protocol: ENTRY.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      recipient: RECIPIENT,
    });
    const params = decodeMintParams(tx.data);
    // 50 bps = 0.5% → minimum = desired * 9950 / 10000.
    expect(params.amount0Min).toBe(995_000n);
    expect(params.amount1Min).toBe(1_990_000n);
    expect(params.amount0Min).not.toBe(0n);
    expect(params.amount1Min).not.toBe(0n);
  });

  it("buildAddLiquidity honors amount_{a,b}_min when token_a < token_b", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
    const tx = await adapter.buildAddLiquidity({
      protocol: ENTRY.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      amount_a_min: 900_000n,
      amount_b_min: 1_900_000n,
      recipient: RECIPIENT,
    });
    const params = decodeMintParams(tx.data);
    // token0 = token_a = LOW, token1 = token_b = HIGH.
    expect(params.amount0Min).toBe(900_000n);
    expect(params.amount1Min).toBe(1_900_000n);
  });

  it("buildAddLiquidity remaps amount_{a,b}_min when token_a > token_b (sorted swap)", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
    const tx = await adapter.buildAddLiquidity({
      protocol: ENTRY.slug,
      token_a: HIGH, // higher → token1
      token_b: LOW,  // lower  → token0
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      amount_a_min: 900_000n,
      amount_b_min: 1_900_000n,
      recipient: RECIPIENT,
    });
    const params = decodeMintParams(tx.data);
    // sorted axis: token0 = LOW = token_b, token1 = HIGH = token_a.
    expect(params.amount0Min).toBe(1_900_000n);
    expect(params.amount1Min).toBe(900_000n);
  });

  it("buildRemoveLiquidity refuses to ship without amount_{a,b}_min", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
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

  it("buildRemoveLiquidity sorts amount_{a,b}_min onto amount{0,1}Min when token_a < token_b", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
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
    const decreaseData = decodeFirstChildOfMulticall(tx.data);
    const params = decodeDecreaseParams(decreaseData);
    expect(params.tokenId).toBe(7n);
    expect(params.liquidity).toBe(100n);
    expect(params.amount0Min).toBe(11n);
    expect(params.amount1Min).toBe(22n);
  });

  it("buildRemoveLiquidity remaps amount_{a,b}_min when token_a > token_b", async () => {
    const adapter = new UniswapV3Adapter(ENTRY);
    const tx = await adapter.buildRemoveLiquidity({
      protocol: ENTRY.slug,
      token_a: HIGH,
      token_b: LOW,
      liquidity: 100n,
      recipient: RECIPIENT,
      token_id: 7n,
      amount_a_min: 11n,
      amount_b_min: 22n,
    });
    const decreaseData = decodeFirstChildOfMulticall(tx.data);
    const params = decodeDecreaseParams(decreaseData);
    // sorted: token0 = LOW = token_b → amount0Min = amount_b_min = 22n.
    expect(params.amount0Min).toBe(22n);
    expect(params.amount1Min).toBe(11n);
  });
});

// Ramses CL mint = 11-field, no sqrtPriceX96, third field is tickSpacing (int24).
const ramsesMintAbi = parseAbi([
  "function mint((address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256, uint128, uint256, uint256)",
]);

// Slipstream mint = 12-field, includes trailing sqrtPriceX96 (uint160).
const slipstreamMintAbi = parseAbi([
  "function mint((address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline, uint160 sqrtPriceX96) params) returns (uint256, uint128, uint256, uint256)",
]);

interface CLMintTuple {
  token0: Address;
  token1: Address;
  tickSpacing: number;
  amount0Min: bigint;
  amount1Min: bigint;
}

interface SlipstreamMintTuple extends CLMintTuple {
  sqrtPriceX96: bigint;
}

describe("UniswapV3Adapter CL-style mint dispatch (ramses / slipstream)", () => {
  it("cl_style='ramses' emits the 11-field Ramses MintParams (no sqrtPriceX96)", async () => {
    const ramsesEntry: ProtocolEntry = {
      ...ENTRY,
      cl_style: "ramses",
    };
    const adapter = new UniswapV3Adapter(ramsesEntry);
    const tx = await adapter.buildAddLiquidity({
      protocol: ramsesEntry.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      recipient: RECIPIENT,
      // tick_lower/upper must be explicit for ramses without slot0() RPC.
      tick_lower: -887_220,
      tick_upper: 887_220,
    });
    const decoded = decodeFunctionData({ abi: ramsesMintAbi, data: tx.data as Hex });
    const params = decoded.args[0] as CLMintTuple;
    expect(params.token0.toLowerCase()).toBe(LOW.toLowerCase());
    expect(params.token1.toLowerCase()).toBe(HIGH.toLowerCase());
    expect(params.amount0Min).toBe(995_000n);
    expect(params.amount1Min).toBe(1_990_000n);
    // Decoding through the slipstream ABI would also succeed but pick up an
    // extra trailing zero; the byte-length difference proves we hit the
    // 11-field encoder, not the 12-field one.
    expect(() =>
      decodeFunctionData({ abi: slipstreamMintAbi, data: tx.data as Hex }),
    ).toThrow();
  });

  it("cl_style='slipstream' emits the 12-field Slipstream MintParams (with sqrtPriceX96=0)", async () => {
    const slipstreamEntry: ProtocolEntry = {
      ...ENTRY,
      cl_style: "slipstream",
    };
    const adapter = new UniswapV3Adapter(slipstreamEntry);
    const tx = await adapter.buildAddLiquidity({
      protocol: slipstreamEntry.slug,
      token_a: LOW,
      token_b: HIGH,
      amount_a: 1_000_000n,
      amount_b: 2_000_000n,
      recipient: RECIPIENT,
      tick_lower: -887_220,
      tick_upper: 887_220,
    });
    const decoded = decodeFunctionData({ abi: slipstreamMintAbi, data: tx.data as Hex });
    const params = decoded.args[0] as SlipstreamMintTuple;
    expect(params.token0.toLowerCase()).toBe(LOW.toLowerCase());
    expect(params.token1.toLowerCase()).toBe(HIGH.toLowerCase());
    expect(params.amount0Min).toBe(995_000n);
    expect(params.amount1Min).toBe(1_990_000n);
    expect(params.sqrtPriceX96).toBe(0n);
  });
});
