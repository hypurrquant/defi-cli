use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Lending;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IComet {
        function getUtilization() external view returns (uint256);
        function getSupplyRate(uint256 utilization) external view returns (uint64);
        function getBorrowRate(uint256 utilization) external view returns (uint64);
        function totalSupply() external view returns (uint256);
        function totalBorrow() external view returns (uint256);
        function supply(address asset, uint256 amount) external;
        function withdraw(address asset, uint256 amount) external;
    }
}

/// Seconds per year for rate conversion
const SECONDS_PER_YEAR: f64 = 365.25 * 24.0 * 3600.0;

pub struct CompoundV3 {
    name: String,
    comet: Address,
    rpc_url: Option<String>,
}

impl CompoundV3 {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let comet = contracts
            .get("comet_usdc")
            .or(contracts.get("comet"))
            .or(contracts.get("comet_weth"))
            .copied()
            .ok_or_else(|| {
                DefiError::ContractError("Missing 'comet_usdc' or 'comet' address".to_string())
            })?;
        Ok(Self {
            name,
            comet,
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
impl Lending for CompoundV3 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
        let call = IComet::supplyCall {
            asset: params.asset,
            amount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Supply {} to Comet", self.name, params.amount),
            to: self.comet,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx> {
        let call = IComet::withdrawCall {
            asset: params.asset,
            amount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Borrow {} from Comet", self.name, params.amount),
            to: self.comet,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx> {
        let call = IComet::supplyCall {
            asset: params.asset,
            amount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Repay {} to Comet", self.name, params.amount),
            to: self.comet,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx> {
        let call = IComet::withdrawCall {
            asset: params.asset,
            amount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw from Comet", self.name),
            to: self.comet,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn get_rates(&self, _asset: Address) -> Result<LendingRates> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let comet = IComet::new(self.comet, &provider);

        let utilization = comet.getUtilization().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] getUtilization failed: {e}", self.name))
        })?;

        let supply_rate = comet.getSupplyRate(utilization).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] getSupplyRate failed: {e}", self.name))
        })?;

        let borrow_rate = comet.getBorrowRate(utilization).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] getBorrowRate failed: {e}", self.name))
        })?;

        let total_supply = comet.totalSupply().call().await.unwrap_or(U256::ZERO);
        let total_borrow = comet.totalBorrow().call().await.unwrap_or(U256::ZERO);

        // Comet rates are per-second, scaled by 1e18
        let supply_per_sec = supply_rate as f64 / 1e18;
        let borrow_per_sec = borrow_rate as f64 / 1e18;
        let supply_apy = supply_per_sec * SECONDS_PER_YEAR * 100.0;
        let borrow_apy = borrow_per_sec * SECONDS_PER_YEAR * 100.0;
        let util_pct = utilization.to::<u128>() as f64 / 1e18 * 100.0;

        Ok(LendingRates {
            protocol: self.name.clone(),
            asset: _asset,
            supply_apy,
            borrow_variable_apy: borrow_apy,
            borrow_stable_apy: None,
            utilization: util_pct,
            total_supply,
            total_borrow,
        })
    }

    async fn get_user_position(&self, _user: Address) -> Result<UserPosition> {
        Err(DefiError::Unsupported(format!(
            "[{}] User position requires querying Comet balanceOf + borrowBalanceOf",
            self.name
        )))
    }
}
