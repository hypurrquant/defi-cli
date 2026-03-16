use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Lending;
use defi_core::types::*;

// Aave V3 Pool ABI (key functions only)
sol! {
    #[sol(rpc)]
    interface IPool {
        function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
        function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
        function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
        function withdraw(address asset, uint256 amount, address to) external returns (uint256);
        function getUserAccountData(address user) external view returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
    }

    // NOTE: This is IPool.getReserveData, NOT IPoolDataProvider.getReserveData
    // HyperLend uses this directly on the Pool contract
    #[sol(rpc)]
    interface IPoolReserveData {
        function getReserveData(address asset) external view returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 currentLiquidityRate,
            uint128 variableBorrowIndex,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            uint16 id,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint128 accruedToTreasury,
            uint128 unbacked,
            uint128 isolationModeTotalDebt
        );
    }
}

#[allow(dead_code)]
pub struct AaveV3 {
    name: String,
    pool: Address,
    data_provider: Option<Address>,
    rpc_url: Option<String>,
}

impl AaveV3 {
    pub fn new(name: String, pool: Address, data_provider: Option<Address>) -> Self {
        Self {
            name,
            pool,
            data_provider,
            rpc_url: None,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let pool = contracts.get("pool").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'pool' contract address".to_string())
        })?;
        let data_provider = contracts.get("pool_data_provider").copied();
        Ok(Self {
            name,
            pool,
            data_provider,
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
}

#[async_trait]
impl Lending for AaveV3 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
        let call = IPool::supplyCall {
            asset: params.asset,
            amount: params.amount,
            onBehalfOf: params.on_behalf_of,
            referralCode: 0,
        };
        Ok(DeFiTx {
            description: format!("[{}] Supply {} to pool", self.name, params.amount),
            to: self.pool,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx> {
        let rate_mode = match params.interest_rate_mode {
            InterestRateMode::Stable => U256::from(1),
            InterestRateMode::Variable => U256::from(2),
        };
        let call = IPool::borrowCall {
            asset: params.asset,
            amount: params.amount,
            interestRateMode: rate_mode,
            referralCode: 0,
            onBehalfOf: params.on_behalf_of,
        };
        Ok(DeFiTx {
            description: format!("[{}] Borrow {} from pool", self.name, params.amount),
            to: self.pool,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx> {
        let rate_mode = match params.interest_rate_mode {
            InterestRateMode::Stable => U256::from(1),
            InterestRateMode::Variable => U256::from(2),
        };
        let call = IPool::repayCall {
            asset: params.asset,
            amount: params.amount,
            interestRateMode: rate_mode,
            onBehalfOf: params.on_behalf_of,
        };
        Ok(DeFiTx {
            description: format!("[{}] Repay {} to pool", self.name, params.amount),
            to: self.pool,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx> {
        let call = IPool::withdrawCall {
            asset: params.asset,
            amount: params.amount,
            to: params.to,
        };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw {} from pool", self.name, params.amount),
            to: self.pool,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn get_rates(&self, asset: Address) -> Result<LendingRates> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);

        // Call getReserveData on the Pool contract directly
        let pool = IPoolReserveData::new(self.pool, &provider);
        let result = pool.getReserveData(asset).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] getReserveData failed: {e}", self.name))
        })?;

        // Rates are in RAY (1e27)
        let ray = 1e27_f64;
        let supply_rate = result.currentLiquidityRate as f64 / ray * 100.0;
        let variable_rate = result.currentVariableBorrowRate as f64 / ray * 100.0;
        let stable_rate = result.currentStableBorrowRate as f64 / ray * 100.0;

        Ok(LendingRates {
            protocol: self.name.clone(),
            asset,
            supply_apy: supply_rate,
            borrow_variable_apy: variable_rate,
            borrow_stable_apy: Some(stable_rate),
            utilization: 0.0, // Needs separate totalSupply/totalBorrow query
            total_supply: U256::ZERO,
            total_borrow: U256::ZERO,
        })
    }

    async fn get_user_position(&self, user: Address) -> Result<UserPosition> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let pool_contract = IPool::new(self.pool, &provider);
        let result = pool_contract
            .getUserAccountData(user)
            .call()
            .await
            .map_err(|e| {
                DefiError::RpcError(format!("[{}] getUserAccountData failed: {e}", self.name))
            })?;

        let hf_raw = u256_to_f64(result.healthFactor) / 1e18;
        // Aave returns uint256.max for health factor when there's no debt
        let hf = if hf_raw.is_infinite() || hf_raw > 1e18 {
            None // No debt — health factor is effectively infinite
        } else {
            Some(hf_raw)
        };

        // Collateral and debt in base currency (USD with 8 decimals in Aave V3)
        let collateral_usd = u256_to_f64(result.totalCollateralBase) / 1e8;
        let debt_usd = u256_to_f64(result.totalDebtBase) / 1e8;
        let ltv_bps = u256_to_f64(result.ltv);

        // Build summary supply/borrow entries from aggregate data
        let supplies = if collateral_usd > 0.0 {
            vec![PositionAsset {
                asset: Address::ZERO,
                symbol: "Total Collateral".to_string(),
                amount: result.totalCollateralBase,
                value_usd: Some(collateral_usd),
            }]
        } else {
            vec![]
        };

        let borrows = if debt_usd > 0.0 {
            vec![PositionAsset {
                asset: Address::ZERO,
                symbol: "Total Debt".to_string(),
                amount: result.totalDebtBase,
                value_usd: Some(debt_usd),
            }]
        } else {
            vec![]
        };

        Ok(UserPosition {
            protocol: self.name.clone(),
            user,
            supplies,
            borrows,
            health_factor: hf,
            net_apy: Some(ltv_bps / 100.0), // LTV in percent
        })
    }
}

fn u256_to_f64(v: U256) -> f64 {
    // U256::MAX doesn't fit in u128; handle gracefully
    if v > U256::from(u128::MAX) {
        f64::INFINITY
    } else {
        v.to::<u128>() as f64
    }
}
