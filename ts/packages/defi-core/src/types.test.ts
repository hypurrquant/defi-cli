import { describe, it, expect } from "vitest";
import {
  formatHuman,
  newSlippage,
  defaultSwapSlippage,
  applyMinSlippage,
  TxStatus,
  InterestRateMode,
} from "./types.js";
import type { TokenAmount } from "./types.js";

describe("formatHuman", () => {
  it("formats token amount with decimals", () => {
    const t: TokenAmount = {
      token: "0x0000000000000000000000000000000000000001",
      symbol: "USDC",
      amount: 1500000n, // 1.5 USDC (6 decimals)
      decimals: 6,
    };
    expect(formatHuman(t)).toBe("1.500000 USDC");
  });

  it("formats zero amount", () => {
    const t: TokenAmount = {
      token: "0x0000000000000000000000000000000000000001",
      symbol: "ETH",
      amount: 0n,
      decimals: 18,
    };
    expect(formatHuman(t)).toBe("0.000000000000000000 ETH");
  });

  it("formats large amounts (18 decimals)", () => {
    const t: TokenAmount = {
      token: "0x0000000000000000000000000000000000000001",
      symbol: "WETH",
      amount: 1000000000000000000n, // 1 WETH
      decimals: 18,
    };
    expect(formatHuman(t)).toBe("1.000000000000000000 WETH");
  });
});

describe("Slippage", () => {
  it("creates slippage with custom bps", () => {
    const s = newSlippage(100);
    expect(s.bps).toBe(100);
  });

  it("default swap slippage is 50 bps (0.5%)", () => {
    const s = defaultSwapSlippage();
    expect(s.bps).toBe(50);
  });

  it("applies minimum amount correctly", () => {
    const s = newSlippage(50); // 0.5%
    const amount = 10000n;
    const min = applyMinSlippage(s, amount);
    expect(min).toBe(9950n); // 10000 * (10000 - 50) / 10000
  });

  it("applies 0% slippage", () => {
    const s = newSlippage(0);
    expect(applyMinSlippage(s, 1000n)).toBe(1000n);
  });
});

describe("TxStatus enum", () => {
  it("matches Rust serde snake_case values", () => {
    expect(TxStatus.DryRun).toBe("dry_run");
    expect(TxStatus.Simulated).toBe("simulated");
    expect(TxStatus.SimulationFailed).toBe("simulation_failed");
    expect(TxStatus.Pending).toBe("pending");
    expect(TxStatus.Confirmed).toBe("confirmed");
    expect(TxStatus.Failed).toBe("failed");
  });
});

describe("InterestRateMode enum", () => {
  it("matches Rust serde snake_case values", () => {
    expect(InterestRateMode.Variable).toBe("variable");
    expect(InterestRateMode.Stable).toBe("stable");
  });
});
