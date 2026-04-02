import type { Address } from "viem";

export enum ProtocolCategory {
  Dex = "dex",
  Lending = "lending",
  Cdp = "cdp",
  Bridge = "bridge",
  LiquidStaking = "liquid_staking",
  YieldSource = "yield_source",
  YieldAggregator = "yield_aggregator",
  Vault = "vault",
  Derivatives = "derivatives",
  Options = "options",
  LiquidityManager = "liquidity_manager",
  Nft = "nft",
  Other = "other",
}

export function protocolCategoryLabel(category: ProtocolCategory): string {
  switch (category) {
    case ProtocolCategory.Dex:
      return "DEX";
    case ProtocolCategory.Lending:
      return "Lending";
    case ProtocolCategory.Cdp:
      return "CDP";
    case ProtocolCategory.Bridge:
      return "Bridge";
    case ProtocolCategory.LiquidStaking:
      return "Liquid Staking";
    case ProtocolCategory.YieldSource:
      return "Yield Source";
    case ProtocolCategory.YieldAggregator:
      return "Yield Aggregator";
    case ProtocolCategory.Vault:
      return "Vault";
    case ProtocolCategory.Derivatives:
      return "Derivatives";
    case ProtocolCategory.Options:
      return "Options";
    case ProtocolCategory.LiquidityManager:
      return "Liquidity Manager";
    case ProtocolCategory.Nft:
      return "NFT";
    case ProtocolCategory.Other:
      return "Other";
  }
}

export interface PoolInfo {
  name: string;
  address: Address;
  token0: string;
  token1: string;
  tick_spacing?: number;
  gauge?: Address;
  stable?: boolean;
}

export interface ProtocolEntry {
  name: string;
  slug: string;
  category: ProtocolCategory;
  interface: string;
  chain: string;
  native?: boolean;
  verified?: boolean;
  contracts?: Record<string, Address>;
  pools?: PoolInfo[];
  description?: string;
}
