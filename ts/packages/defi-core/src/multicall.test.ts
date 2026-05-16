// Unit tests for multicall.ts — buildMulticall encoding, multicallRead RPC
// round-trip (mocked), and the small decode helpers used by every adapter
// that walks a multicall return.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, parseAbi, type Address, type Hex } from "viem";

import {
  MULTICALL3_ADDRESS,
  buildMulticall,
  decodeU128,
  decodeU256,
  multicallRead,
} from "./multicall.js";
import { clearProviderCache } from "./provider.js";

const TARGET_A = ("0x" + "aa".repeat(20)) as Address;
const TARGET_B = ("0x" + "bb".repeat(20)) as Address;
const CALL_A: Hex = "0xdeadbeef";
const CALL_B: Hex = "0xbaadf00d";

interface Call3Tuple {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
}

const aggregate3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "function aggregate3(Call3[] calls) returns (Result[] returnData)",
  "struct Result { bool success; bytes returnData; }",
]);

describe("buildMulticall encoding", () => {
  it("emits aggregate3 calldata targeting Multicall3 with allowFailure=true on every call", () => {
    const tx = buildMulticall([
      [TARGET_A, CALL_A],
      [TARGET_B, CALL_B],
    ]);
    expect(tx.to).toBe(MULTICALL3_ADDRESS);
    expect(tx.value).toBe(0n);
    expect(tx.description).toContain("2 calls");

    const decoded = decodeFunctionData({ abi: aggregate3Abi, data: tx.data });
    expect(decoded.functionName).toBe("aggregate3");
    const calls = decoded.args[0] as readonly Call3Tuple[];
    expect(calls).toHaveLength(2);
    expect(calls[0].target.toLowerCase()).toBe(TARGET_A.toLowerCase());
    expect(calls[0].callData).toBe(CALL_A);
    expect(calls[0].allowFailure).toBe(true);
    expect(calls[1].target.toLowerCase()).toBe(TARGET_B.toLowerCase());
    expect(calls[1].allowFailure).toBe(true);
  });

  it("handles an empty calls array (still emits valid aggregate3 calldata)", () => {
    const tx = buildMulticall([]);
    expect(tx.to).toBe(MULTICALL3_ADDRESS);
    expect(tx.description).toContain("0 calls");
    const decoded = decodeFunctionData({ abi: aggregate3Abi, data: tx.data });
    expect((decoded.args[0] as readonly Call3Tuple[])).toHaveLength(0);
  });
});

describe("decodeU256 / decodeU128", () => {
  function u256(n: bigint): Hex {
    return `0x${n.toString(16).padStart(64, "0")}` as Hex;
  }

  it("decodeU256 returns the full u256 from valid 32-byte data", () => {
    expect(decodeU256(u256(0n))).toBe(0n);
    expect(decodeU256(u256(42n))).toBe(42n);
    const MAX = (1n << 256n) - 1n;
    expect(decodeU256(u256(MAX))).toBe(MAX);
  });

  it("decodeU256 returns 0n for null or short data (defensive guard)", () => {
    expect(decodeU256(null)).toBe(0n);
    expect(decodeU256("0x" as Hex)).toBe(0n);
    expect(decodeU256("0x1234" as Hex)).toBe(0n); // too short
  });

  it("decodeU128 masks the high 128 bits even when the source word is wider", () => {
    // (2^200) in 256 bits → after & ((1<<128)-1) → 0.
    const wide = u256(1n << 200n);
    expect(decodeU128(wide)).toBe(0n);
    // (1 << 128) - 1 stays as itself.
    const max128 = (1n << 128n) - 1n;
    expect(decodeU128(u256(max128))).toBe(max128);
    // A small value (e.g. 7) survives unchanged.
    expect(decodeU128(u256(7n))).toBe(7n);
  });

  it("decodeU128 returns 0n for null or short data", () => {
    expect(decodeU128(null)).toBe(0n);
    expect(decodeU128("0x12" as Hex)).toBe(0n);
  });
});

const callStub = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("viem");
  return {
    ...real,
    createPublicClient: () => ({
      call: callStub,
    }),
  };
});

beforeEach(() => {
  callStub.mockReset();
  clearProviderCache();
});
afterEach(() => {
  clearProviderCache();
});

describe("multicallRead RPC behaviour (mocked viem)", () => {
  function encodeResults(rs: Array<{ success: boolean; returnData: Hex }>): Hex {
    return encodeAbiParameters(
      [
        {
          name: "results",
          type: "tuple[]",
          components: [
            { name: "success", type: "bool" },
            { name: "returnData", type: "bytes" },
          ],
        },
      ],
      [rs],
    );
  }

  it("decodes per-call success+returnData into the same-order Hex array", async () => {
    callStub.mockResolvedValueOnce({
      data: encodeResults([
        { success: true, returnData: "0xa1" as Hex },
        { success: true, returnData: "0xb2" as Hex },
      ]),
    });
    const out = await multicallRead("https://rpc/example", [
      [TARGET_A, CALL_A],
      [TARGET_B, CALL_B],
    ]);
    expect(out).toEqual(["0xa1", "0xb2"]);
  });

  it("returns null entries for sub-calls reporting success=false", async () => {
    callStub.mockResolvedValueOnce({
      data: encodeResults([
        { success: false, returnData: "0x" as Hex },
        { success: true, returnData: "0xdeadbeef" as Hex },
      ]),
    });
    const out = await multicallRead("https://rpc/example", [
      [TARGET_A, CALL_A],
      [TARGET_B, CALL_B],
    ]);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe("0xdeadbeef");
  });

  it("returns an all-null array of correct length when the RPC returns no data", async () => {
    callStub.mockResolvedValueOnce({ data: undefined });
    const out = await multicallRead("https://rpc/example", [
      [TARGET_A, CALL_A],
      [TARGET_B, CALL_B],
    ]);
    expect(out).toEqual([null, null]);
  });
});
