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
        function totalStaked() external view returns (uint256);
    }

    #[sol(rpc)]
    interface IERC20 {
        function totalSupply() external view returns (uint256);
    }

    #[sol(rpc)]
    interface IAaveOracle {
        function getAssetPrice(address asset) external view returns (uint256);
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
        // kHYPE token is a separate contract from the staking manager
        let liquid_token = contracts.get("khype_token").copied().unwrap_or(staking);
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

/// WHYPE address on HyperEVM (used for oracle price comparison)
const WHYPE: Address = Address::new([
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55,
]);

/// HyperLend oracle address (Aave V3 compatible)
const HYPERLEND_ORACLE: Address = Address::new([
    0xc9, 0xfb, 0x4f, 0xbe, 0x84, 0x2d, 0x57, 0xea, 0xc1, 0xdf, 0x3e, 0x64, 0x1a, 0x28, 0x18, 0x27,
    0x49, 0x3a, 0x63, 0x0e,
]);

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
            gas_estimate: Some(300_000),
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
            gas_estimate: Some(300_000),
        })
    }

    async fn get_info(&self) -> Result<StakingInfo> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let staking = IKinetiq::new(self.staking, &provider);

        // Total HYPE staked across the entire protocol
        let total_staked =
            staking.totalStaked().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalStaked failed: {e}", self.name))
            })?;

        // Exchange rate: kHYPE oracle price / HYPE oracle price
        // This gives the accurate HYPE-per-kHYPE ratio
        let oracle = IAaveOracle::new(HYPERLEND_ORACLE, &provider);

        let khype_price = oracle
            .getAssetPrice(self.liquid_token)
            .call()
            .await
            .unwrap_or(U256::ZERO);

        let hype_price = oracle
            .getAssetPrice(WHYPE)
            .call()
            .await
            .unwrap_or(U256::ZERO);

        let rate_f64 = if !hype_price.is_zero() && !khype_price.is_zero() {
            khype_price.to::<u128>() as f64 / hype_price.to::<u128>() as f64
        } else {
            1.0
        };

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
