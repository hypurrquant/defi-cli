import type { Address, Hex } from "viem";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "viem";
import type { DeFiTx } from "./types.js";
import { getProvider } from "./provider.js";

export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) returns (Result[] returnData)",
]);

export function buildMulticall(calls: Array<[Address, Hex]>): DeFiTx {
  const mcCalls = calls.map(([target, callData]) => ({
    target,
    allowFailure: true,
    callData,
  }));

  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [mcCalls],
  });

  return {
    description: `Multicall3 batch (${calls.length} calls)`,
    to: MULTICALL3_ADDRESS,
    data,
    value: 0n,
  };
}

export async function multicallRead(
  rpcUrl: string,
  calls: Array<[Address, Hex]>,
): Promise<(Hex | null)[]> {
  const client = getProvider(rpcUrl);

  const mcCalls = calls.map(([target, callData]) => ({
    target,
    allowFailure: true,
    callData,
  }));

  const result = await client.call({
    to: MULTICALL3_ADDRESS,
    data: encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [mcCalls],
    }),
  });

  if (!result.data) return calls.map(() => null);

  const decoded = decodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: result.data,
  }) as Array<{ success: boolean; returnData: Hex }>;

  return decoded.map((r) => (r.success ? r.returnData : null));
}

export function decodeU256(data: Hex | null): bigint {
  if (!data || data.length < 66) return 0n;
  return BigInt(data.slice(0, 66));
}

export function decodeU128(data: Hex | null): bigint {
  if (!data || data.length < 66) return 0n;
  const val = BigInt(data.slice(0, 66));
  return val & ((1n << 128n) - 1n);
}
