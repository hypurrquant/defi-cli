use defi_core::error::{DefiError, Result};
use defi_core::registry::ProtocolEntry;
use defi_core::traits::*;

use crate::bridge::{GenericBridge, HyperlaneBridge, HyperliquidBridge};
use crate::cdp::Felix;
use crate::derivatives::{GenericDerivatives, HlpVault};
use crate::dex::{
    AlgebraV3, BalancerV3, CurveStableSwap, Solidly, SolidlyGauge, UniswapV2, UniswapV3, WooFi,
};
use crate::lending::{AaveV3, EulerV2, MorphoBlue};
use crate::liquid_staking::{GenericLst, Kinetiq, StHype};
use crate::options::{GenericOptions, Rysk};
use crate::vault::Erc4626Vault;
use crate::yield_source::{GenericYield, Pendle};

/// Create a Dex implementation from a protocol registry entry
pub fn create_dex(entry: &ProtocolEntry) -> Result<Box<dyn Dex>> {
    create_dex_with_rpc(entry, None)
}

/// Create a Dex implementation with an RPC URL for live on-chain reads (quotes).
pub fn create_dex_with_rpc(entry: &ProtocolEntry, rpc_url: Option<&str>) -> Result<Box<dyn Dex>> {
    match entry.interface.as_str() {
        "uniswap_v3" => Ok(Box::new(UniswapV3::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        "algebra_v3" => Ok(Box::new(AlgebraV3::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "uniswap_v2" => Ok(Box::new(UniswapV2::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "solidly_v2" | "solidly_cl" => Ok(Box::new(Solidly::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "curve_stableswap" => Ok(Box::new(CurveStableSwap::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "balancer_v3" => Ok(Box::new(BalancerV3::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "woofi" => Ok(Box::new(WooFi::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Err(DefiError::Unsupported(format!(
            "DEX interface '{other}' not yet implemented"
        ))),
    }
}

/// Create a Lending implementation from a protocol registry entry.
/// Pass an optional RPC URL to enable on-chain read operations (get_rates, get_user_position).
pub fn create_lending(entry: &ProtocolEntry) -> Result<Box<dyn Lending>> {
    create_lending_with_rpc(entry, None)
}

/// Create a Lending implementation with an RPC URL for live on-chain reads.
pub fn create_lending_with_rpc(
    entry: &ProtocolEntry,
    rpc_url: Option<&str>,
) -> Result<Box<dyn Lending>> {
    match entry.interface.as_str() {
        "aave_v3" | "aave_v3_isolated" => Ok(Box::new(AaveV3::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        "morpho_blue" => Ok(Box::new(MorphoBlue::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        "euler_v2" => Ok(Box::new(EulerV2::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        other => Err(DefiError::Unsupported(format!(
            "Lending interface '{other}' not yet implemented"
        ))),
    }
}

/// Create a Cdp implementation from a protocol registry entry
pub fn create_cdp(entry: &ProtocolEntry) -> Result<Box<dyn Cdp>> {
    match entry.interface.as_str() {
        "liquity_v2" => Ok(Box::new(Felix::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Err(DefiError::Unsupported(format!(
            "CDP interface '{other}' not yet implemented"
        ))),
    }
}

/// Create a Bridge implementation from a protocol registry entry
pub fn create_bridge(entry: &ProtocolEntry) -> Result<Box<dyn Bridge>> {
    match entry.interface.as_str() {
        "native_bridge" => Ok(Box::new(HyperliquidBridge::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "hyperlane" => Ok(Box::new(HyperlaneBridge::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Ok(Box::new(GenericBridge::from_entry(
            entry.name.clone(),
            other.to_string(),
        ))),
    }
}

/// Create a Vault implementation from a protocol registry entry
pub fn create_vault(entry: &ProtocolEntry) -> Result<Box<dyn Vault>> {
    create_vault_with_rpc(entry, None)
}

/// Create a Vault implementation with an RPC URL for live on-chain reads.
pub fn create_vault_with_rpc(
    entry: &ProtocolEntry,
    rpc_url: Option<&str>,
) -> Result<Box<dyn Vault>> {
    match entry.interface.as_str() {
        "erc4626" | "beefy_vault" => Ok(Box::new(Erc4626Vault::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        other => Err(DefiError::Unsupported(format!(
            "Vault interface '{other}' not yet implemented"
        ))),
    }
}

/// Create a LiquidStaking implementation from a protocol registry entry
pub fn create_liquid_staking(entry: &ProtocolEntry) -> Result<Box<dyn LiquidStaking>> {
    create_liquid_staking_with_rpc(entry, None)
}

/// Create a LiquidStaking implementation with an RPC URL for live on-chain reads.
pub fn create_liquid_staking_with_rpc(
    entry: &ProtocolEntry,
    rpc_url: Option<&str>,
) -> Result<Box<dyn LiquidStaking>> {
    match entry.interface.as_str() {
        "kinetiq_staking" => Ok(Box::new(Kinetiq::from_contracts(
            entry.name.clone(),
            &entry.contracts,
            rpc_url.map(|s| s.to_string()),
        )?)),
        "sthype_staking" => Ok(Box::new(StHype::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        "hyperbeat_lst" | "kintsu" => Ok(Box::new(GenericLst::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Err(DefiError::Unsupported(format!(
            "LiquidStaking interface '{other}' not yet implemented"
        ))),
    }
}

/// Create a YieldSource implementation from a protocol registry entry
pub fn create_yield_source(entry: &ProtocolEntry) -> Result<Box<dyn YieldSource>> {
    match entry.interface.as_str() {
        "pendle_v2" => Ok(Box::new(Pendle::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Ok(Box::new(GenericYield::from_entry(
            entry.name.clone(),
            other.to_string(),
        ))),
    }
}

/// Create a Derivatives implementation from a protocol registry entry
pub fn create_derivatives(entry: &ProtocolEntry) -> Result<Box<dyn Derivatives>> {
    match entry.interface.as_str() {
        "hlp_vault" => Ok(Box::new(HlpVault::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Ok(Box::new(GenericDerivatives::from_entry(
            entry.name.clone(),
            other.to_string(),
        ))),
    }
}

/// Create an Options implementation from a protocol registry entry
pub fn create_options(entry: &ProtocolEntry) -> Result<Box<dyn Options>> {
    match entry.interface.as_str() {
        "rysk" => Ok(Box::new(Rysk::from_contracts(
            entry.name.clone(),
            &entry.contracts,
        )?)),
        other => Ok(Box::new(GenericOptions::from_entry(
            entry.name.clone(),
            other.to_string(),
        ))),
    }
}

/// Create a GaugeSystem implementation from a protocol registry entry.
/// Returns a combined Gauge + VoteEscrow + Voter implementation.
pub fn create_gauge(entry: &ProtocolEntry) -> Result<Box<dyn GaugeSystem>> {
    match entry.interface.as_str() {
        "solidly_v2" | "solidly_cl" | "algebra_v3" | "hybra" => Ok(Box::new(
            SolidlyGauge::from_contracts(entry.name.clone(), &entry.contracts)?,
        )),
        other => Err(DefiError::Unsupported(format!(
            "Gauge interface '{other}' not supported"
        ))),
    }
}
