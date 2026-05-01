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

/** How rewards are read for this protocol — informs which adapter the gauge layer uses */
export type RewardStrategy =
  | "on_chain_gauge"           // Solidly-style gauge.earned()
  | "on_chain_gauge_tokenid"   // Hybra/Aerodrome CL: gauge.earned(tokenId) or earned(addr,tokenId)
  | "on_chain_farming_center"  // Algebra eternal farming (KittenSwap)
  | "on_chain_masterchef"      // MasterChef (PancakeSwap V3)
  | "auto_stake"               // Ramses x(3,3) — emissions handled internally, no external claim
  | "lp_fee_only"              // V3 swap-only fork — LP earns trading fees via NPM.collect, no emissions
  | "off_chain_api"            // Nest — backend-signed claim tickets
  | "none";                    // No rewards at all (very rare; usually use lp_fee_only for V3 forks)

/** How native input (HYPE / ETH) is wrapped on this DEX (some forks use a non-standard pattern) */
export type NativeInputStyle = "algebra-native";

export interface ProtocolEntry {
  name: string;
  slug: string;
  category: ProtocolCategory;
  interface: string;
  chain: string;
  native?: boolean;
  /** Verified PASS via on-chain `cast call`. Setting to false hides the protocol (fail-closed). */
  verified?: boolean;
  /**
   * Whether this protocol should be exposed to runtime callers.
   * Defaults to true. Setting to false hides it from getProtocolsForChain()
   * even when verified=true (use this for protocols whose ABI/integration is incomplete).
   */
  is_active?: boolean;
  /** Non-standard native-input wrapping flow — only set when adapter needs special handling */
  native_input_style?: NativeInputStyle;
  /** How rewards are computed/claimed — drives reward strategy dispatch in factory.createGauge */
  reward_strategy?: RewardStrategy;
  /**
   * Concentrated-liquidity dialect for `interface = "uniswap_v3"` forks. Drives
   * adapter mint encoding & quoter selection.
   *   - undefined: standard Uniswap V3 (uint24 fee in MintParams)
   *   - "slipstream": Aerodrome/Velodrome Slipstream (int24 tickSpacing + sqrtPriceX96, 12-field MintParams)
   *   - "ramses": Ramses CL x(3,3) (auto-stake, tickSpacing-based quoter, NPM.getPeriodReward claim)
   */
  cl_style?: "slipstream" | "ramses";
  contracts?: Record<string, Address>;
  pools?: PoolInfo[];
  description?: string;
}
