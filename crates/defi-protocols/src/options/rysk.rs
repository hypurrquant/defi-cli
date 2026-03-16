use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Options;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IRyskController {
        function openOption(
            address underlying,
            uint256 strikePrice,
            uint256 expiry,
            bool isCall,
            uint256 amount
        ) external returns (uint256 premium);

        function closeOption(
            address underlying,
            uint256 strikePrice,
            uint256 expiry,
            bool isCall,
            uint256 amount
        ) external returns (uint256 payout);
    }
}

pub struct Rysk {
    name: String,
    controller: Address,
}

impl Rysk {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let controller = contracts
            .get("controller")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'controller' contract".to_string()))?;
        Ok(Self { name, controller })
    }
}

#[async_trait]
impl Options for Rysk {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_buy(&self, params: OptionParams) -> Result<DeFiTx> {
        let call = IRyskController::openOptionCall {
            underlying: params.underlying,
            strikePrice: params.strike_price,
            expiry: U256::from(params.expiry),
            isCall: params.is_call,
            amount: params.amount,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Buy {} {} option, strike={}, expiry={}",
                self.name,
                if params.is_call { "call" } else { "put" },
                params.amount,
                params.strike_price,
                params.expiry
            ),
            to: self.controller,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_sell(&self, params: OptionParams) -> Result<DeFiTx> {
        let call = IRyskController::closeOptionCall {
            underlying: params.underlying,
            strikePrice: params.strike_price,
            expiry: U256::from(params.expiry),
            isCall: params.is_call,
            amount: params.amount,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Sell/close {} {} option",
                self.name,
                if params.is_call { "call" } else { "put" },
                params.amount
            ),
            to: self.controller,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }
}
