use alloy::primitives::Address;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEntry {
    pub symbol: String,
    pub name: String,
    pub address: Address,
    pub decimals: u8,
    #[serde(default)]
    pub is_native_wrapper: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}
