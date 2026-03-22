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
  "function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes calldata userData) external returns (uint256 amountOut)",
]);

export class BalancerV3Adapter implements IDex {
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
    const minAmountOut = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);

    // Balancer V3 requires a pool address. For now use a simplified single-pool swap.
    // In production, the pool would be resolved from the registry or an on-chain query.
    const data = encodeFunctionData({
      abi,
      functionName: "swapSingleTokenExactIn",
      args: [
        zeroAddress, // TODO: resolve pool from registry
        params.token_in,
        params.token_out,
        params.amount_in,
        minAmountOut,
        deadline,
        false,
        "0x",
      ],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via Balancer V3`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC`);
  }

  async buildAddLiquidity(_params: AddLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] add_liquidity requires pool-specific params`);
  }

  async buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] remove_liquidity requires pool-specific params`);
  }
}
