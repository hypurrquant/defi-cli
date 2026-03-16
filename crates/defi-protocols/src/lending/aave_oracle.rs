use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Oracle;
use defi_core::types::PriceData;

sol! {
    #[sol(rpc)]
    interface IAaveOracle {
        function getAssetPrice(address asset) external view returns (uint256);
        function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory);
        function BASE_CURRENCY_UNIT() external view returns (uint256);
    }
}

pub struct AaveOracle {
    name: String,
    oracle: Address,
    rpc_url: String,
}

impl AaveOracle {
    pub fn new(name: String, oracle: Address, rpc_url: String) -> Self {
        Self {
            name,
            oracle,
            rpc_url,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: String,
    ) -> Result<Self> {
        let oracle = contracts.get("oracle").copied().ok_or_else(|| {
            DefiError::ContractError(format!("[{name}] Missing 'oracle' contract address"))
        })?;
        Ok(Self {
            name,
            oracle,
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
impl Oracle for AaveOracle {
    fn name(&self) -> &str {
        &self.name
    }

    async fn get_price(&self, asset: Address) -> Result<PriceData> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let oracle = IAaveOracle::new(self.oracle, &provider);

        // Fetch the base currency unit (typically 1e8 for USD)
        let base_unit_val = oracle.BASE_CURRENCY_UNIT().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] BASE_CURRENCY_UNIT failed: {e}", self.name))
        })?;

        let price_val = oracle.getAssetPrice(asset).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] getAssetPrice failed: {e}", self.name))
        })?;

        let price_f64 = if base_unit_val > U256::ZERO {
            price_val.to::<u128>() as f64 / base_unit_val.to::<u128>() as f64
        } else {
            0.0
        };

        // Normalize to 18-decimal USD representation
        let price_usd = if base_unit_val > U256::ZERO {
            price_val * U256::from(10u64).pow(U256::from(18)) / base_unit_val
        } else {
            U256::ZERO
        };

        Ok(PriceData {
            source: format!("{} Oracle", self.name),
            source_type: "oracle".to_string(),
            asset,
            price_usd,
            price_f64,
            block_number: None,
            timestamp: None,
        })
    }

    async fn get_prices(&self, assets: &[Address]) -> Result<Vec<PriceData>> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let oracle = IAaveOracle::new(self.oracle, &provider);

        let base_unit_val = oracle.BASE_CURRENCY_UNIT().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] BASE_CURRENCY_UNIT failed: {e}", self.name))
        })?;

        let prices_raw = oracle
            .getAssetsPrices(assets.to_vec())
            .call()
            .await
            .map_err(|e| {
                DefiError::RpcError(format!("[{}] getAssetsPrices failed: {e}", self.name))
            })?;

        let mut results = Vec::with_capacity(assets.len());
        for (i, price_val) in prices_raw.iter().enumerate() {
            let price_f64 = if base_unit_val > U256::ZERO {
                price_val.to::<u128>() as f64 / base_unit_val.to::<u128>() as f64
            } else {
                0.0
            };

            let price_usd = if base_unit_val > U256::ZERO {
                *price_val * U256::from(10u64).pow(U256::from(18)) / base_unit_val
            } else {
                U256::ZERO
            };

            results.push(PriceData {
                source: format!("{} Oracle", self.name),
                source_type: "oracle".to_string(),
                asset: assets[i],
                price_usd,
                price_f64,
                block_number: None,
                timestamp: None,
            });
        }

        Ok(results)
    }
}
