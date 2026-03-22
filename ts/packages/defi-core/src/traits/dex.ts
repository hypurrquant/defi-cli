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
}
