use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::LiquidStaking;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IKinetiq {
        function stake() external payable returns (uint256);
        function requestUnstake(uint256 amount) external returns (uint256);
        function exchangeRate() external view returns (uint256);
        function totalStaked() external view returns (uint256);
    }
}

pub struct Kinetiq {
    name: String,
    staking: Address,
    liquid_token: Address,
    rpc_url: Option<String>,
}

impl Kinetiq {
    pub fn new(name: String, staking: Address, liquid_token: Address) -> Self {
        Self {
            name,
            staking,
            liquid_token,
            rpc_url: None,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let staking = contracts.get("staking").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'staking' contract address".to_string())
        })?;
        // kHYPE token address (same as staking contract for Kinetiq)
        let liquid_token = staking;
        Ok(Self {
            name,
            staking,
            liquid_token,
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
impl LiquidStaking for Kinetiq {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_stake(&self, params: StakeParams) -> Result<DeFiTx> {
        let call = IKinetiq::stakeCall {};

        Ok(DeFiTx {
            description: format!("[{}] Stake {} HYPE for kHYPE", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: params.amount, // Native HYPE sent as value
            gas_estimate: Some(200_000),
        })
    }

    async fn build_unstake(&self, params: UnstakeParams) -> Result<DeFiTx> {
        let call = IKinetiq::requestUnstakeCall {
            amount: params.amount,
        };

        Ok(DeFiTx {
            description: format!("[{}] Request unstake {} kHYPE", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn get_info(&self) -> Result<StakingInfo> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let contract = IKinetiq::new(self.staking, &provider);

        let exchange_rate = contract.exchangeRate().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] exchangeRate failed: {e}", self.name))
        })?;

        let total_staked =
            contract.totalStaked().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalStaked failed: {e}", self.name))
            })?;

        // Exchange rate is in 1e18 scale
        let rate_f64 = exchange_rate.to::<u128>() as f64 / 1e18;

        Ok(StakingInfo {
            protocol: self.name.clone(),
            staked_token: Address::ZERO, // Native HYPE
            liquid_token: self.liquid_token,
            exchange_rate: rate_f64,
            apy: None,
            total_staked,
        })
    }
}
