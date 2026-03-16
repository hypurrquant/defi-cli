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
    interface IEulerVault {
        function deposit(uint256 amount, address receiver) external returns (uint256);
        function withdraw(uint256 amount, address receiver, address owner) external returns (uint256);
        function borrow(uint256 amount, address receiver) external returns (uint256);
        function repay(uint256 amount, address receiver) external returns (uint256);
        function totalSupply() external view returns (uint256);
        function totalBorrows() external view returns (uint256);
        function interestRate() external view returns (uint256);
    }
}

pub struct EulerV2 {
    name: String,
    euler: Address,
    rpc_url: Option<String>,
}

impl EulerV2 {
    pub fn new(name: String, euler: Address, rpc_url: Option<String>) -> Self {
        Self {
            name,
            euler,
            rpc_url,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let euler = contracts
            .get("euler")
            .or_else(|| contracts.get("markets"))
            .copied()
            .ok_or_else(|| {
                DefiError::ContractError(
                    "Missing 'euler' or 'markets' contract address".to_string(),
                )
            })?;
        Ok(Self::new(name, euler, rpc_url))
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
impl Lending for EulerV2 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
        let call = IEulerVault::depositCall {
            amount: params.amount,
            receiver: params.on_behalf_of,
        };

        Ok(DeFiTx {
            description: format!("[{}] Deposit {} into Euler vault", self.name, params.amount),
            to: self.euler,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx> {
        let call = IEulerVault::borrowCall {
            amount: params.amount,
            receiver: params.on_behalf_of,
        };

        Ok(DeFiTx {
            description: format!("[{}] Borrow {} from Euler vault", self.name, params.amount),
            to: self.euler,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx> {
        let call = IEulerVault::repayCall {
            amount: params.amount,
            receiver: params.on_behalf_of,
        };

        Ok(DeFiTx {
            description: format!("[{}] Repay {} to Euler vault", self.name, params.amount),
            to: self.euler,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx> {
        let call = IEulerVault::withdrawCall {
            amount: params.amount,
            receiver: params.to,
            owner: params.to,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Withdraw {} from Euler vault",
                self.name, params.amount
            ),
            to: self.euler,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn get_rates(&self, _asset: Address) -> Result<LendingRates> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vault = IEulerVault::new(self.euler, &provider);

        let total_supply =
            vault.totalSupply().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalSupply failed: {e}", self.name))
            })?;
        let total_borrows = vault.totalBorrows().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] totalBorrows failed: {e}", self.name))
        })?;
        let interest_rate = vault.interestRate().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] interestRate failed: {e}", self.name))
        })?;

        // Euler V2 interest rates are per-second rates scaled by 1e27
        let rate_f64 = interest_rate.to::<u128>() as f64 / 1e27;
        let seconds_per_year = 365.25 * 24.0 * 3600.0;
        let borrow_apy = rate_f64 * seconds_per_year * 100.0;

        // Calculate utilization
        let supply_f64 = total_supply.to::<u128>() as f64;
        let borrows_f64 = total_borrows.to::<u128>() as f64;
        let utilization = if supply_f64 > 0.0 {
            borrows_f64 / supply_f64 * 100.0
        } else {
            0.0
        };

        // Supply APY is approximately borrow_apy * utilization_ratio
        let supply_apy = borrow_apy * (borrows_f64 / supply_f64.max(1.0));

        Ok(LendingRates {
            protocol: self.name.clone(),
            asset: _asset,
            supply_apy,
            borrow_variable_apy: borrow_apy,
            borrow_stable_apy: None,
            utilization,
            total_supply,
            total_borrow: total_borrows,
        })
    }

    async fn get_user_position(&self, _user: Address) -> Result<UserPosition> {
        let _url = self.rpc_url()?;

        // Euler V2 user positions are per-vault. A full position query would require
        // iterating over all vaults the user has interacted with.
        // The vault contract address (self.euler) represents a single vault.
        Err(DefiError::Unsupported(format!(
            "[{}] Euler V2 user positions require querying individual vault balances. \
             Use the vault address directly to check balanceOf(user) for supply positions.",
            self.name
        )))
    }
}
