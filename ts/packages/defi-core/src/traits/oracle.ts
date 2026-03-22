import type { Address } from "viem";
import type { PriceData } from "../types.js";

/** Oracle price feed — reads prices from lending protocol oracles or price feeds */
export interface IOracle {
  name(): string;
  /** Get price for an asset from this oracle */
  getPrice(asset: Address): Promise<PriceData>;
  /** Get prices for multiple assets */
  getPrices(assets: Address[]): Promise<PriceData[]>;
}
