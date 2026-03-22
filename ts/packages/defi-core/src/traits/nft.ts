import type { Address } from "viem";

export interface NftCollectionInfo {
  address: Address;
  name: string;
  symbol: string;
  total_supply?: bigint;
  floor_price?: bigint;
  floor_price_currency?: string;
}

export interface NftTokenInfo {
  collection: Address;
  token_id: bigint;
  owner: Address;
  token_uri?: string;
}

export interface INft {
  name(): string;
  getCollectionInfo(collection: Address): Promise<NftCollectionInfo>;
  getTokenInfo(collection: Address, tokenId: bigint): Promise<NftTokenInfo>;
  getBalance(owner: Address, collection: Address): Promise<bigint>;
}
