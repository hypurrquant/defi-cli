use alloy::primitives::{Address, FixedBytes, U256};
use alloy::providers::ProviderBuilder;
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

        function market(bytes32 id) external view returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        );

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
    }

    #[sol(rpc)]
    interface IMetaMorpho {
        function supplyQueueLength() external view returns (uint256);
        function supplyQueue(uint256 index) external view returns (bytes32);
        function totalAssets() external view returns (uint256);
        function totalSupply() external view returns (uint256);
    }
}

pub struct MorphoBlue {
    name: String,
    morpho: Address,
    /// Default MetaMorpho vault (e.g., feHYPE) for rate queries
    default_vault: Option<Address>,
    rpc_url: Option<String>,
}

impl MorphoBlue {
    pub fn new(name: String, morpho: Address, rpc_url: Option<String>) -> Self {
        Self {
            name,
            morpho,
            default_vault: None,
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
        // Use fehype as default vault, or first vault found
        let default_vault = contracts
            .get("fehype")
            .or(contracts.get("vault"))
            .or(contracts.get("feusdc"))
            .copied();
        Ok(Self {
            name,
            morpho,
            default_vault,
            rpc_url,
        })
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .as_ref()
            .ok_or_else(|| DefiError::RpcError("No RPC URL configured".to_string()))?
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }

    fn default_market_params() -> IMorpho::MarketParams {
        IMorpho::MarketParams {
            loanToken: Address::ZERO,
            collateralToken: Address::ZERO,
            oracle: Address::ZERO,
            irm: Address::ZERO,
            lltv: U256::ZERO,
        }
    }

    /// Find a vault address for the given asset from known vaults
    fn vault_for_asset(
        &self,
        asset: Address,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Option<Address> {
        // Map known token addresses to vault names
        let whype = Address::new([0x55; 20]);
        let usdc: Address = "0xb88339CB7199b77E23DB6E890353E22632Ba630f"
            .parse()
            .unwrap_or(Address::ZERO);

        if asset == whype {
            contracts.get("fehype").copied()
        } else if asset == usdc {
            contracts.get("feusdc").copied()
        } else {
            None
        }
    }
}

#[async_trait]
impl Lending for MorphoBlue {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
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
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);

        let vault_addr = self.default_vault.ok_or_else(|| {
            DefiError::ContractError(format!(
                "[{}] No MetaMorpho vault configured for rate query",
                self.name
            ))
        })?;

        let vault = IMetaMorpho::new(vault_addr, &provider);

        // Get the first market in the vault's supply queue
        let queue_len = vault.supplyQueueLength().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] supplyQueueLength failed: {e}", self.name))
        })?;

        if queue_len.is_zero() {
            return Ok(LendingRates {
                protocol: self.name.clone(),
                asset: _asset,
                supply_apy: 0.0,
                borrow_variable_apy: 0.0,
                borrow_stable_apy: None,
                utilization: 0.0,
                total_supply: U256::ZERO,
                total_borrow: U256::ZERO,
            });
        }

        // Query the first market for aggregate stats
        let market_id: FixedBytes<32> =
            vault.supplyQueue(U256::ZERO).call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] supplyQueue(0) failed: {e}", self.name))
            })?;

        let morpho = IMorpho::new(self.morpho, &provider);
        let mkt =
            morpho.market(market_id).call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] market() failed: {e}", self.name))
            })?;

        let supply = mkt.totalSupplyAssets as f64;
        let borrow = mkt.totalBorrowAssets as f64;
        let util = if supply > 0.0 { borrow / supply } else { 0.0 };

        // Morpho Blue rate estimation: borrow rate ≈ util * base_rate_at_target
        // Simplified: we report utilization and let consumers derive rates
        // A more accurate approach would call the IRM contract
        let borrow_apy = util * 15.0; // rough approximation
        let supply_apy = borrow_apy * util * (1.0 - mkt.fee as f64 / 1e18);

        Ok(LendingRates {
            protocol: self.name.clone(),
            asset: _asset,
            supply_apy,
            borrow_variable_apy: borrow_apy,
            borrow_stable_apy: None,
            utilization: util * 100.0,
            total_supply: U256::from(mkt.totalSupplyAssets),
            total_borrow: U256::from(mkt.totalBorrowAssets),
        })
    }

    async fn get_user_position(&self, _user: Address) -> Result<UserPosition> {
        Err(DefiError::Unsupported(format!(
            "[{}] Morpho Blue user positions are per-market — use vault deposit/withdraw instead",
            self.name
        )))
    }
}
