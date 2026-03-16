use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::LiquidStaking;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IGenericLST {
        function stake() external payable returns (uint256);
        function unstake(uint256 amount) external returns (uint256);
    }
}

pub struct GenericLst {
    name: String,
    staking: Address,
}

impl GenericLst {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let staking = contracts
            .get("staking")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'staking' contract".to_string()))?;
        Ok(Self { name, staking })
    }
}

#[async_trait]
impl LiquidStaking for GenericLst {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_stake(&self, params: StakeParams) -> Result<DeFiTx> {
        let call = IGenericLST::stakeCall {};
        Ok(DeFiTx {
            description: format!("[{}] Stake {} HYPE", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: params.amount,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_unstake(&self, params: UnstakeParams) -> Result<DeFiTx> {
        let call = IGenericLST::unstakeCall {
            amount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Unstake {}", self.name, params.amount),
            to: self.staking,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn get_info(&self) -> Result<StakingInfo> {
        Err(DefiError::Unsupported(format!(
            "[{}] get_info requires RPC",
            self.name
        )))
    }
}
