import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import type { DeFiTx } from "./types.js";

const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

export { erc20Abi };

export function buildApprove(
  token: Address,
  spender: Address,
  amount: bigint,
): DeFiTx {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  return {
    description: `Approve ${spender} to spend ${amount} of token ${token}`,
    to: token,
    data,
    value: 0n,
    gas_estimate: 60_000,
  };
}

export function buildTransfer(
  token: Address,
  to: Address,
  amount: bigint,
): DeFiTx {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
  return {
    description: `Transfer ${amount} of token ${token} to ${to}`,
    to: token,
    data,
    value: 0n,
    gas_estimate: 65_000,
  };
}
