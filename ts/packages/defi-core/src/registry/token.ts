import type { Address } from "viem";

export interface TokenEntry {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  is_native_wrapper?: boolean;
  tags?: string[];
}
