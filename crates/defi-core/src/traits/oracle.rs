use alloy::primitives::Address;
use async_trait::async_trait;

use crate::error::Result;
use crate::types::PriceData;

/// Oracle price feed — reads prices from lending protocol oracles or price feeds
#[async_trait]
pub trait Oracle: Send + Sync {
    fn name(&self) -> &str;
    /// Get price for an asset from this oracle
    async fn get_price(&self, asset: Address) -> Result<PriceData>;
    /// Get prices for multiple assets
    async fn get_prices(&self, assets: &[Address]) -> Result<Vec<PriceData>>;
}
