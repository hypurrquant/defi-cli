use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Lending;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IMorpho {
        struct MarketParams {
            address loanToken;
            address collateralToken;
            address oracle;
            address irm;
            uint256 lltv;
        }

        function supply(
            MarketParams memory marketParams,
            uint256 assets,
            uint256 shares,
            address onBehalf,
            bytes memory data
        ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

        function borrow(
            MarketParams memory marketParams,
            uint256 assets,
            uint256 shares,
            address onBehalf,
            address receiver
        ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

        function repay(
            MarketParams memory marketParams,
            uint256 assets,
            uint256 shares,
            address onBehalf,
            bytes memory data
        ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

        function withdraw(
            MarketParams memory marketParams,
            uint256 assets,
            uint256 shares,
            address onBehalf,
            address receiver
        ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

        function supplyCollateral(
            MarketParams memory marketParams,
            uint256 assets,
            address onBehalf,
            bytes memory data
        ) external;
    }
}

pub struct MorphoBlue {
    name: String,
    morpho: Address,
    rpc_url: Option<String>,
}

impl MorphoBlue {
    pub fn new(name: String, morpho: Address, rpc_url: Option<String>) -> Self {
        Self {
            name,
            morpho,
            rpc_url,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let morpho = contracts.get("morpho_blue").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'morpho_blue' contract address".to_string())
        })?;
        Ok(Self::new(name, morpho, rpc_url))
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .as_ref()
            .ok_or_else(|| DefiError::RpcError("No RPC URL configured".to_string()))?
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }

    /// Create default market params (user should override for specific markets)
    fn default_market_params() -> IMorpho::MarketParams {
        IMorpho::MarketParams {
            loanToken: Address::ZERO,
            collateralToken: Address::ZERO,
            oracle: Address::ZERO,
            irm: Address::ZERO,
            lltv: U256::ZERO,
        }
    }
}

#[async_trait]
impl Lending for MorphoBlue {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
        // For Morpho Blue, supply is to a specific market
        // We use a simplified version where asset = loanToken
        let mut market = Self::default_market_params();
        market.loanToken = params.asset;

        let call = IMorpho::supplyCall {
            marketParams: market,
            assets: params.amount,
            shares: U256::ZERO,
            onBehalf: params.on_behalf_of,
            data: Default::default(),
        };

        Ok(DeFiTx {
            description: format!("[{}] Supply {} to Morpho market", self.name, params.amount),
            to: self.morpho,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx> {
        let mut market = Self::default_market_params();
        market.loanToken = params.asset;

        let call = IMorpho::borrowCall {
            marketParams: market,
            assets: params.amount,
            shares: U256::ZERO,
            onBehalf: params.on_behalf_of,
            receiver: params.on_behalf_of,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Borrow {} from Morpho market",
                self.name, params.amount
            ),
            to: self.morpho,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx> {
        let mut market = Self::default_market_params();
        market.loanToken = params.asset;

        let call = IMorpho::repayCall {
            marketParams: market,
            assets: params.amount,
            shares: U256::ZERO,
            onBehalf: params.on_behalf_of,
            data: Default::default(),
        };

        Ok(DeFiTx {
            description: format!("[{}] Repay {} to Morpho market", self.name, params.amount),
            to: self.morpho,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx> {
        let mut market = Self::default_market_params();
        market.loanToken = params.asset;

        let call = IMorpho::withdrawCall {
            marketParams: market,
            assets: params.amount,
            shares: U256::ZERO,
            onBehalf: params.to,
            receiver: params.to,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Withdraw {} from Morpho market",
                self.name, params.amount
            ),
            to: self.morpho,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn get_rates(&self, _asset: Address) -> Result<LendingRates> {
        // Verify RPC is configured (even though we can't fully query without a market ID)
        let _url = self.rpc_url()?;

        // Morpho Blue uses a market-based architecture where each market is identified
        // by a hash of (loanToken, collateralToken, oracle, irm, lltv).
        // Querying rates requires a specific market ID. The asset address alone is
        // insufficient — there can be multiple markets for the same loan token.
        Err(DefiError::Unsupported(format!(
            "[{}] Morpho Blue rates require a specific market ID (bytes32). \
             Markets are identified by hash(loanToken, collateralToken, oracle, irm, lltv). \
             Use a Morpho Blue indexer or the Morpho API to discover market IDs for a given asset.",
            self.name
        )))
    }

    async fn get_user_position(&self, _user: Address) -> Result<UserPosition> {
        let _url = self.rpc_url()?;

        // Similar to get_rates, user positions in Morpho Blue are per-market.
        // A full position query requires iterating over all markets the user
        // has interacted with, which needs an off-chain indexer.
        Err(DefiError::Unsupported(format!(
            "[{}] Morpho Blue user positions are per-market. \
             Querying a full position requires knowing which market IDs the user has interacted with. \
             Use a Morpho Blue indexer or the Morpho API to discover user markets.",
            self.name
        )))
    }
}
