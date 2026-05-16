// Unit tests for erc20.ts — the two builder helpers used everywhere a CLI
// command emits an ERC20 approve or transfer. Pure encoding tests; no RPC.
import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi, type Address } from "viem";

import { buildApprove, buildTransfer, erc20Abi } from "./erc20.js";

const TOKEN = ("0x" + "11".repeat(20)) as Address;
const SPENDER = ("0x" + "22".repeat(20)) as Address;
const RECIPIENT = ("0x" + "33".repeat(20)) as Address;

const approveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const transferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

describe("erc20 builders", () => {
  it("buildApprove encodes spender + amount into approve() calldata", () => {
    const tx = buildApprove(TOKEN, SPENDER, 1_000n);
    expect(tx.to.toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(tx.value).toBe(0n);
    expect(tx.gas_estimate).toBe(60_000);
    const decoded = decodeFunctionData({ abi: approveAbi, data: tx.data });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args[0].toLowerCase()).toBe(SPENDER.toLowerCase());
    expect(decoded.args[1]).toBe(1_000n);
    expect(tx.description).toContain(SPENDER);
    expect(tx.description).toContain("1000");
  });

  it("buildTransfer encodes recipient + amount into transfer() calldata", () => {
    const tx = buildTransfer(TOKEN, RECIPIENT, 9_876_543n);
    expect(tx.to.toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(tx.value).toBe(0n);
    expect(tx.gas_estimate).toBe(65_000);
    const decoded = decodeFunctionData({ abi: transferAbi, data: tx.data });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args[0].toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(decoded.args[1]).toBe(9_876_543n);
  });

  it("buildApprove handles MaxUint256 (infinite approval value) without overflow", () => {
    const MAX = (1n << 256n) - 1n;
    const tx = buildApprove(TOKEN, SPENDER, MAX);
    const decoded = decodeFunctionData({ abi: approveAbi, data: tx.data });
    expect(decoded.args[1]).toBe(MAX);
  });

  it("erc20Abi re-export covers the standard read + write surface", () => {
    // Sanity check that the public re-export matches the surface every
    // adapter depends on — losing one of these would silently break
    // multiple call sites.
    const fnNames = erc20Abi
      .filter((e): e is Extract<typeof erc20Abi[number], { type: "function" }> => e.type === "function")
      .map((e) => e.name)
      .sort();
    expect(fnNames).toEqual(
      [
        "allowance",
        "approve",
        "balanceOf",
        "decimals",
        "name",
        "symbol",
        "totalSupply",
        "transfer",
        "transferFrom",
      ].sort(),
    );
  });
});
