use alloy::primitives::{Address, U256};
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
}

pub struct StHype {
    name: String,
    staking: Address,
}

impl StHype {
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
        Err(DefiError::Unsupported(format!(
            "[{}] get_info requires RPC",
            self.name
        )))
    }
}
