import { DefiError } from "@hypurrquant/defi-core";
import type { ProtocolEntry } from "@hypurrquant/defi-core";
import type { Address } from "viem";

// DEX adapters
import { UniswapV3Adapter } from "./dex/uniswap_v3.js";
import { UniswapV2Adapter } from "./dex/uniswap_v2.js";
import { AlgebraV3Adapter } from "./dex/algebra_v3.js";
import { BalancerV3Adapter } from "./dex/balancer_v3.js";
import { CurveStableSwapAdapter } from "./dex/curve.js";
import { SolidlyAdapter } from "./dex/solidly.js";
import { WooFiAdapter } from "./dex/woofi.js";
import { SolidlyGaugeAdapter } from "./dex/solidly_gauge.js";
import { MasterChefAdapter } from "./dex/masterchef.js";
import { MerchantMoeLBAdapter } from "./dex/merchant_moe_lb.js";

// Trait interfaces
import type { IDex } from "@hypurrquant/defi-core";
import type { ILending } from "@hypurrquant/defi-core";
import type { ICdp } from "@hypurrquant/defi-core";
import type { IVault } from "@hypurrquant/defi-core";
import type { ILiquidStaking } from "@hypurrquant/defi-core";
import type { IGaugeSystem } from "@hypurrquant/defi-core";
import type { IGauge } from "@hypurrquant/defi-core";
import type { IYieldSource } from "@hypurrquant/defi-core";
import type { IDerivatives } from "@hypurrquant/defi-core";
import type { IOptions } from "@hypurrquant/defi-core";
import type { IOracle } from "@hypurrquant/defi-core";
import type { INft } from "@hypurrquant/defi-core";

// Lending adapters
import { AaveV3Adapter } from "./lending/aave_v3.js";
import { AaveV2Adapter } from "./lending/aave_v2.js";
import { AaveOracleAdapter } from "./lending/aave_oracle.js";
import { CompoundV2Adapter } from "./lending/compound_v2.js";
import { CompoundV3Adapter } from "./lending/compound_v3.js";
import { EulerV2Adapter } from "./lending/euler_v2.js";
import { MorphoBlueAdapter } from "./lending/morpho.js";

// CDP adapters
import { FelixCdpAdapter } from "./cdp/felix.js";
import { FelixOracleAdapter } from "./cdp/felix_oracle.js";

// Vault adapters
import { ERC4626VaultAdapter } from "./vault/erc4626.js";

// Liquid staking adapters
import { GenericLstAdapter } from "./liquid_staking/generic_lst.js";
import { StHypeAdapter } from "./liquid_staking/sthype.js";
import { KinetiqAdapter } from "./liquid_staking/kinetiq.js";

// Yield source adapters
import { PendleAdapter } from "./yield_source/pendle.js";
import { GenericYieldAdapter } from "./yield_source/generic_yield.js";

// Derivatives adapters
import { HlpVaultAdapter } from "./derivatives/hlp.js";
import { GenericDerivativesAdapter } from "./derivatives/generic_derivatives.js";

// Options adapters
import { RyskAdapter } from "./options/rysk.js";
import { GenericOptionsAdapter } from "./options/generic_options.js";

// NFT adapters
import { ERC721Adapter } from "./nft/erc721.js";

// ============================================================
// DEX
// ============================================================

/** Create a Dex implementation from a protocol registry entry */
export function createDex(entry: ProtocolEntry, rpcUrl?: string): IDex {
  switch (entry.interface) {
    case "uniswap_v3":
      return new UniswapV3Adapter(entry, rpcUrl);
    case "uniswap_v4":
      throw DefiError.unsupported(
        `[${entry.name}] Uniswap V4 (singleton PoolManager) is not yet supported — use HyperSwap V3 or another V3-compatible DEX for quotes`,
      );
    case "algebra_v3":
      return new AlgebraV3Adapter(entry, rpcUrl);
    case "uniswap_v2":
      return new UniswapV2Adapter(entry, rpcUrl);
    case "solidly_v2":
    case "solidly_cl":
      return new SolidlyAdapter(entry, rpcUrl);
    case "curve_stableswap":
      return new CurveStableSwapAdapter(entry);
    case "balancer_v3":
      return new BalancerV3Adapter(entry);
    case "woofi":
      return new WooFiAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`DEX interface '${entry.interface}' not yet implemented`);
  }
}

// ============================================================
// Lending
// ============================================================

/** Create a Lending implementation from a protocol registry entry */
export function createLending(entry: ProtocolEntry, rpcUrl?: string): ILending {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveV3Adapter(entry, rpcUrl);
    case "aave_v2":
      return new AaveV2Adapter(entry, rpcUrl);
    case "morpho_blue":
      return new MorphoBlueAdapter(entry, rpcUrl);
    case "euler_v2":
      return new EulerV2Adapter(entry, rpcUrl);
    case "compound_v2":
      return new CompoundV2Adapter(entry, rpcUrl);
    case "compound_v3":
      return new CompoundV3Adapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Lending interface '${entry.interface}' not yet implemented`);
  }
}

// ============================================================
// CDP
// ============================================================

/** Create a CDP implementation from a protocol registry entry */
export function createCdp(entry: ProtocolEntry, rpcUrl?: string): ICdp {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixCdpAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`CDP interface '${entry.interface}' not yet implemented`);
  }
}

// ============================================================
// Vault
// ============================================================

/** Create a Vault implementation from a protocol registry entry */
export function createVault(entry: ProtocolEntry, rpcUrl?: string): IVault {
  switch (entry.interface) {
    case "erc4626":
    case "beefy_vault":
      return new ERC4626VaultAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Vault interface '${entry.interface}' not yet implemented`);
  }
}

// ============================================================
// Liquid Staking
// ============================================================

/** Create a LiquidStaking implementation from a protocol registry entry */
export function createLiquidStaking(entry: ProtocolEntry, rpcUrl?: string): ILiquidStaking {
  switch (entry.interface) {
    case "kinetiq_staking":
      return new KinetiqAdapter(entry, rpcUrl);
    case "sthype_staking":
      return new StHypeAdapter(entry, rpcUrl);
    case "hyperbeat_lst":
    case "kintsu":
      return new GenericLstAdapter(entry, rpcUrl);
    default:
      return new GenericLstAdapter(entry, rpcUrl);
  }
}

// ============================================================
// Gauge
// ============================================================

/** Create a GaugeSystem implementation from a protocol registry entry */
export function createGauge(entry: ProtocolEntry, rpcUrl?: string): IGaugeSystem {
  switch (entry.interface) {
    case "solidly_v2":
    case "solidly_cl":
    case "algebra_v3":
    case "hybra":
      return new SolidlyGaugeAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Gauge interface '${entry.interface}' not supported`);
  }
}

/** Create a MasterChef IGauge implementation from a protocol registry entry */
export function createMasterChef(entry: ProtocolEntry, rpcUrl?: string): IGauge {
  return new MasterChefAdapter(entry, rpcUrl);
}

// ============================================================
// Yield Source (fallback to GenericYield)
// ============================================================

/** Create a YieldSource implementation — falls back to GenericYield for unknown interfaces */
export function createYieldSource(entry: ProtocolEntry, rpcUrl?: string): IYieldSource {
  switch (entry.interface) {
    case "pendle_v2":
      return new PendleAdapter(entry, rpcUrl);
    default:
      return new GenericYieldAdapter(entry, rpcUrl);
  }
}

// ============================================================
// Derivatives (fallback to GenericDerivatives)
// ============================================================

/** Create a Derivatives implementation — falls back to GenericDerivatives for unknown interfaces */
export function createDerivatives(entry: ProtocolEntry, rpcUrl?: string): IDerivatives {
  switch (entry.interface) {
    case "hlp_vault":
      return new HlpVaultAdapter(entry, rpcUrl);
    default:
      return new GenericDerivativesAdapter(entry, rpcUrl);
  }
}

// ============================================================
// Options (fallback to GenericOptions)
// ============================================================

/** Create an Options implementation — falls back to GenericOptions for unknown interfaces */
export function createOptions(entry: ProtocolEntry, rpcUrl?: string): IOptions {
  switch (entry.interface) {
    case "rysk":
      return new RyskAdapter(entry, rpcUrl);
    default:
      return new GenericOptionsAdapter(entry, rpcUrl);
  }
}

// ============================================================
// NFT
// ============================================================

/** Create an NFT implementation from a protocol registry entry */
export function createNft(entry: ProtocolEntry, rpcUrl?: string): INft {
  switch (entry.interface) {
    case "erc721":
      return new ERC721Adapter(entry, rpcUrl);
    case "marketplace":
      throw DefiError.unsupported(`NFT marketplace '${entry.name}' is not queryable as ERC-721. Use a specific collection address.`);
    default:
      throw DefiError.unsupported(`NFT interface '${entry.interface}' not supported`);
  }
}

// ============================================================
// Oracle from Lending
// ============================================================

/** Create an Oracle from a lending protocol entry (Aave V3 forks have an oracle contract) */
export function createOracleFromLending(entry: ProtocolEntry, rpcUrl: string): IOracle {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Oracle not available for lending interface '${entry.interface}'`);
  }
}

// ============================================================
// Oracle from CDP
// ============================================================

/** Create an Oracle from a CDP protocol entry (Felix has its own PriceFeed contract) */
export function createOracleFromCdp(entry: ProtocolEntry, _asset: Address, rpcUrl: string): IOracle {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Oracle not available for CDP interface '${entry.interface}'`);
  }
}

// ============================================================
// Merchant Moe LB
// ============================================================

/** Create a MerchantMoeLBAdapter for Liquidity Book operations */
export function createMerchantMoeLB(entry: ProtocolEntry, rpcUrl?: string): MerchantMoeLBAdapter {
  return new MerchantMoeLBAdapter(entry, rpcUrl);
}
