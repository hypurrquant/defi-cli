import type { OptionParams, DeFiTx } from "../types.js";

export interface IOptions {
  name(): string;
  buildBuy(params: OptionParams): Promise<DeFiTx>;
  buildSell(params: OptionParams): Promise<DeFiTx>;
}
