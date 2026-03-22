import type { DerivativesPositionParams, DeFiTx } from "../types.js";

export interface IDerivatives {
  name(): string;
  buildOpenPosition(params: DerivativesPositionParams): Promise<DeFiTx>;
  buildClosePosition(params: DerivativesPositionParams): Promise<DeFiTx>;
}
