// Slippage-protection regression tests for ThenaCLAdapter (SSOT 7.3).
import { ProtocolCategory } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { ThenaCLAdapter } from "./thena_cl.js";

const LOW = ("0x" + "01".repeat(20)) as Address;
const HIGH = ("0x" + "ff".repeat(20)) as Address;
const RECIPIENT = ("0x" + "be".repeat(20)) as Address;

const ENTRY: ProtocolEntry = {
  name: "test_thena_cl",
  slug: "test-thena-cl",
  category: ProtocolCategory.Dex,
  interface: "thena_cl",
  chain: "test",
  contracts: {
    router: ("0x" + "01".repeat(20)) as Address,
    position_manager: ("0x" + "03".repeat(20)) as Address,
    pool_factory: ("0x" + "04".repeat(20)) as Address,
  },
};

const swapAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) returns (uint256)",
]);

const decreaseAbi = parseAbi([
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint256, uint256)",
]);

const multicallAbi = parseAbi(["function multicall(bytes[] data) returns (bytes[])"]);

interface SwapTuple { amountOutMinimum: bigint; amountIn: bigint }
interface DecreaseTuple { amount0Min: bigint; amount1Min: bigint }

describe("ThenaCLAdapter slippage protection (SSOT 7.3)", () => {
  it("buildSwap refuses to ship without amount_out_min (no quoter wired)", async () => {
    const adapter = new ThenaCLAdapter(ENTRY);
    await expect(
      adapter.buildSwap({
        protocol: ENTRY.slug,
        token_in: LOW,
        token_out: HIGH,
        amount_in: 1_000_000n,
        slippage: { bps: 50 },
        recipient: RECIPIENT,
      }),
    ).rejects.toThrow(/amount_out_min/);
  });

  it("buildSwap forwards amount_out_min override verbatim", async () => {
    const adapter = new ThenaCLAdapter(ENTRY);
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

  it("buildRemoveLiquidity refuses to ship without amount_{a,b}_min", async () => {
    const adapter = new ThenaCLAdapter(ENTRY);
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
    const adapter = new ThenaCLAdapter(ENTRY);
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
