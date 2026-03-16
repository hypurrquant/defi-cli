use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Derivatives;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IHlpVault {
        function deposit(uint256 amount) external returns (uint256);
        function withdraw(uint256 shares) external returns (uint256);
    }
}

pub struct HlpVault {
    name: String,
    vault: Address,
}

impl HlpVault {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let vault = contracts
            .get("vault")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'vault' contract".to_string()))?;
        Ok(Self { name, vault })
    }
}

#[async_trait]
impl Derivatives for HlpVault {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_open_position(&self, params: DerivativesPositionParams) -> Result<DeFiTx> {
        // HLP is a vault-style product, deposit = open position
        let call = IHlpVault::depositCall {
            amount: params.collateral,
        };
        Ok(DeFiTx {
            description: format!(
                "[{}] Deposit {} into HLP vault",
                self.name, params.collateral
            ),
            to: self.vault,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_close_position(&self, params: DerivativesPositionParams) -> Result<DeFiTx> {
        let call = IHlpVault::withdrawCall {
            shares: params.size,
        };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw {} from HLP vault", self.name, params.size),
            to: self.vault,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }
}
