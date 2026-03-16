use alloy::primitives::Address;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProtocolCategory {
    Dex,
    Lending,
    Cdp,
    Bridge,
    LiquidStaking,
    YieldSource,
    YieldAggregator,
    Vault,
    Derivatives,
    Options,
    LiquidityManager,
    Other,
}

impl std::fmt::Display for ProtocolCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Dex => write!(f, "DEX"),
            Self::Lending => write!(f, "Lending"),
            Self::Cdp => write!(f, "CDP"),
            Self::Bridge => write!(f, "Bridge"),
            Self::LiquidStaking => write!(f, "Liquid Staking"),
            Self::YieldSource => write!(f, "Yield Source"),
            Self::YieldAggregator => write!(f, "Yield Aggregator"),
            Self::Vault => write!(f, "Vault"),
            Self::Derivatives => write!(f, "Derivatives"),
            Self::Options => write!(f, "Options"),
            Self::LiquidityManager => write!(f, "Liquidity Manager"),
            Self::Other => write!(f, "Other"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolEntry {
    pub name: String,
    pub slug: String,
    pub category: ProtocolCategory,
    pub interface: String,
    pub chain: String,
    #[serde(default)]
    pub native: bool,
    #[serde(default)]
    pub contracts: HashMap<String, Address>,
    #[serde(default)]
    pub description: String,
}
