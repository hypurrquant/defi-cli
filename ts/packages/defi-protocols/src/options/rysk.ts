import { parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import type { IOptions } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type OptionParams,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const RYSK_ABI = parseAbi([
  "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
  "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)",
]);

export class RyskAdapter implements IOptions {
  private readonly protocolName: string;
  private readonly controller: Address;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const controller = entry.contracts?.["controller"];
    if (!controller) throw DefiError.contractError("Missing 'controller' contract");
    this.controller = controller;
  }

  name(): string {
    return this.protocolName;
  }

  async buildBuy(params: OptionParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: RYSK_ABI,
      functionName: "openOption",
      args: [
        params.underlying,
        params.strike_price,
        BigInt(params.expiry),
        params.is_call,
        params.amount,
      ],
    });
    return {
      description: `[${this.protocolName}] Buy ${params.is_call ? "call" : "put"} ${params.amount} option, strike=${params.strike_price}, expiry=${params.expiry}`,
      to: this.controller,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildSell(params: OptionParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: RYSK_ABI,
      functionName: "closeOption",
      args: [
        params.underlying,
        params.strike_price,
        BigInt(params.expiry),
        params.is_call,
        params.amount,
      ],
    });
    return {
      description: `[${this.protocolName}] Sell/close ${params.is_call ? "call" : "put"} ${params.amount} option`,
      to: this.controller,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }
}
