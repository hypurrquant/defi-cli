import { encodeFunctionData, parseAbi, zeroAddress } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
import type {
  IDex,
  ProtocolEntry,
  SwapParams,
  QuoteParams,
  QuoteResult,
  AddLiquidityParams,
  RemoveLiquidityParams,
  DeFiTx,
} from "@hypurrquant/defi-core";

const abi = parseAbi([
  "function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) external payable returns (uint256 realToAmount)",
]);

export class WooFiAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: `0x${string}`;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const minToAmount = 0n;

    const data = encodeFunctionData({
      abi,
      functionName: "swap",
      args: [
        params.token_in,
        params.token_out,
        params.amount_in,
        minToAmount,
        params.recipient,
        zeroAddress,
      ],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via WOOFi`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC`);
  }

  async buildAddLiquidity(_params: AddLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }

  async buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
}
