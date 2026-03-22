import { encodeFunctionData, parseAbi } from "viem";

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

const poolAbi = parseAbi([
  "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) external returns (uint256)",
  "function remove_liquidity(uint256 amount, uint256[2] min_amounts) external returns (uint256[2])",
]);

export class CurveStableSwapAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: `0x${string}`;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    // Direct pool exchange: swap token at index 0 for token at index 1.
    // The `router` address is treated as the pool address for direct swaps.
    // Callers should set the pool address as the "router" contract in the registry
    // when targeting a specific Curve pool.
    // Without prior quote, set min output to 0. Use quote() first for slippage protection.
    const minDy = 0n;

    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "exchange",
      args: [0n, 1n, params.amount_in, minDy],
    });

    return {
      description: `[${this.protocolName}] Curve pool exchange ${params.amount_in} tokens (index 0 -> 1)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC connection`);
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    // Add liquidity to a 2-token Curve pool
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "add_liquidity",
      args: [[params.amount_a, params.amount_b], 0n],
    });

    return {
      description: `[${this.protocolName}] Curve add liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 400_000,
    };
  }

  async buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx> {
    // Remove liquidity from a 2-token Curve pool
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "remove_liquidity",
      args: [params.liquidity, [0n, 0n]],
    });

    return {
      description: `[${this.protocolName}] Curve remove liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }
}
