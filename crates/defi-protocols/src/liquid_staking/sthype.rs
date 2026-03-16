use alloy::primitives::{Address, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::LiquidStaking;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IStHype {
        function submit(address referral) external payable returns (uint256);
        function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds);
    }

    #[sol(rpc)]
    interface IERC20 {
        function totalSupply() external view returns (uint256);
    }
}

pub struct StHype {
    name: String,
    staking: Address,
    sthype_token: Option<Address>,
    rpc_url: Option<String>,
}

impl StHype {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let staking = contracts
            .get("staking")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'staking' contract".to_string()))?;
        let sthype_token = contracts.get("sthype_token").copied();
        Ok(Self {
            name,
            staking,
            sthype_token,
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
impl LiquidStaking for StHype {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_stake(&self, params: StakeParams) -> Result<DeFiTx> {
        let call = IStHype::submitCall {
            referral: Address::ZERO,
        };
        Ok(DeFiTx {
            description: format!("[{}] Stake {} HYPE for stHYPE", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: params.amount,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_unstake(&self, params: UnstakeParams) -> Result<DeFiTx> {
        let call = IStHype::requestWithdrawalsCall {
            amounts: vec![params.amount],
            owner: params.recipient,
        };
        Ok(DeFiTx {
            description: format!("[{}] Request unstake {} stHYPE", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn get_info(&self) -> Result<StakingInfo> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);

        let token_addr = self.sthype_token.unwrap_or(self.staking);
        let token = IERC20::new(token_addr, &provider);

        // Total stHYPE supply
        let total_supply =
            token.totalSupply().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalSupply failed: {e}", self.name))
            })?;

        // ETH balance held by staking contract
        let staking_balance = provider
            .get_balance(self.staking)
            .await
            .unwrap_or(U256::ZERO);

        // Approximate exchange rate from staking contract ETH balance
        // Note: actual pooled ETH may be in validators, so this is a lower bound
        let rate_f64 = if !total_supply.is_zero() && !staking_balance.is_zero() {
            staking_balance.to::<u128>() as f64 / total_supply.to::<u128>() as f64
        } else {
            1.0 // Default 1:1 if we can't determine
        };

        Ok(StakingInfo {
            protocol: self.name.clone(),
            staked_token: Address::ZERO, // Native HYPE
            liquid_token: token_addr,
            exchange_rate: rate_f64,
            apy: None,
            total_staked: total_supply,
        })
    }
}
