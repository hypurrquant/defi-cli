use alloy::primitives::Address;
use alloy::providers::ProviderBuilder;
use alloy::sol;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Oracle;
use defi_core::types::PriceData;

sol! {
    #[sol(rpc)]
    interface IFelixPriceFeed {
        function fetchPrice() external view returns (uint256 price, bool isNewOracleFailureDetected);
        function lastGoodPrice() external view returns (uint256);
    }
}

/// Felix price feed oracle (Liquity V2 style).
/// Returns the price of the collateral asset (WHYPE) in USD with 18 decimals.
pub struct FelixOracle {
    name: String,
    price_feed: Address,
    /// The collateral asset this price feed reports on (e.g. WHYPE)
    asset: Address,
    rpc_url: String,
}

impl FelixOracle {
    pub fn new(name: String, price_feed: Address, asset: Address, rpc_url: String) -> Self {
        Self {
            name,
            price_feed,
            asset,
            rpc_url,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        asset: Address,
        rpc_url: String,
    ) -> Result<Self> {
        let price_feed = contracts.get("price_feed").copied().ok_or_else(|| {
            DefiError::ContractError(format!("[{name}] Missing 'price_feed' contract address"))
        })?;
        Ok(Self {
            name,
            price_feed,
            asset,
            rpc_url,
        })
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }
}

#[async_trait]
impl Oracle for FelixOracle {
    fn name(&self) -> &str {
        &self.name
    }

    async fn get_price(&self, asset: Address) -> Result<PriceData> {
        if asset != self.asset {
            return Err(DefiError::Unsupported(format!(
                "[{}] Felix PriceFeed only supports asset {:?}",
                self.name, self.asset
            )));
        }

        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let feed = IFelixPriceFeed::new(self.price_feed, &provider);

        // Try fetchPrice first, fall back to lastGoodPrice
        let price_val = match feed.fetchPrice().call().await {
            Ok(result) => result.price,
            Err(_) => {
                // Fall back to lastGoodPrice
                feed.lastGoodPrice().call().await.map_err(|e| {
                    DefiError::RpcError(format!("[{}] lastGoodPrice failed: {e}", self.name))
                })?
            }
        };

        // Felix prices are already in 18-decimal USD
        let price_f64 = price_val.to::<u128>() as f64 / 1e18;

        Ok(PriceData {
            source: "Felix PriceFeed".to_string(),
            source_type: "oracle".to_string(),
            asset,
            price_usd: price_val,
            price_f64,
            block_number: None,
            timestamp: None,
        })
    }

    async fn get_prices(&self, assets: &[Address]) -> Result<Vec<PriceData>> {
        let mut results = Vec::new();
        for &asset in assets {
            match self.get_price(asset).await {
                Ok(price) => results.push(price),
                Err(_) => continue, // Skip unsupported assets
            }
        }
        Ok(results)
    }
}
