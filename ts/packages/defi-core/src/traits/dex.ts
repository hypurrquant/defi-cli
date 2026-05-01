import type { Address } from "viem";
import type {
  SwapParams,
  QuoteParams,
  QuoteResult,
  AddLiquidityParams,
  RemoveLiquidityParams,
  DeFiTx,
} from "../types.js";

export interface IDex {
  name(): string;
  buildSwap(params: SwapParams): Promise<DeFiTx>;
  quote(params: QuoteParams): Promise<QuoteResult>;
  buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
  buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
  /** Optional: collect accrued LP fees and re-add as liquidity (V3 fee-only protocols) */
  buildCompound?(tokenId: bigint, recipient: Address, opts?: { slippageBps?: number }): Promise<DeFiTx>;
  /** Optional: collect LP fees only (V3 NPM.collect for fee-only / non-gauged positions) */
  buildCollectFees?(tokenId: bigint, recipient: Address): Promise<DeFiTx>;
}
