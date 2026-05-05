// Slippage-protection regression test for BalancerV3Adapter (SSOT 7.3).
import { ProtocolCategory } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { BalancerV3Adapter } from "./balancer_v3.js";

const LOW = ("0x" + "01".repeat(20)) as Address;
const HIGH = ("0x" + "ff".repeat(20)) as Address;
const RECIPIENT = ("0x" + "be".repeat(20)) as Address;

const ENTRY: ProtocolEntry = {
  name: "test_balancer_v3",
  slug: "test-balancer-v3",
  category: ProtocolCategory.Dex,
  interface: "balancer_v3",
  chain: "test",
  contracts: { router: ("0x" + "01".repeat(20)) as Address },
};

const swapAbi = parseAbi([
  "function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes userData) returns (uint256)",
]);

describe("BalancerV3Adapter slippage protection (SSOT 7.3)", () => {
  it("buildSwap refuses to ship without amount_out_min", async () => {
    const adapter = new BalancerV3Adapter(ENTRY);
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
    const adapter = new BalancerV3Adapter(ENTRY);
    const tx = await adapter.buildSwap({
      protocol: ENTRY.slug,
      token_in: LOW,
      token_out: HIGH,
      amount_in: 1_000_000n,
      slippage: { bps: 50 },
      recipient: RECIPIENT,
      amount_out_min: 99_999n,
    });
    const decoded = decodeFunctionData({ abi: swapAbi, data: tx.data as Hex });
    // args order: pool, tokenIn, tokenOut, exactAmountIn, minAmountOut, ...
    expect((decoded.args as readonly unknown[])[4]).toBe(99_999n);
    expect((decoded.args as readonly unknown[])[4]).not.toBe(0n);
  });
});
