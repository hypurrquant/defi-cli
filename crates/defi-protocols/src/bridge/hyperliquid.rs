use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Bridge;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IHyperliquidBridge {
        function bridgeToL1(address token, uint256 amount, address recipient) external;
    }
}

pub struct HyperliquidBridge {
    name: String,
    bridge: Address,
}

impl HyperliquidBridge {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let bridge = contracts
            .get("bridge")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'bridge' contract".to_string()))?;
        Ok(Self { name, bridge })
    }
}

#[async_trait]
impl Bridge for HyperliquidBridge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_send(&self, params: BridgeSendParams) -> Result<DeFiTx> {
        let call = IHyperliquidBridge::bridgeToL1Call {
            token: params.token,
            amount: params.amount,
            recipient: params.recipient,
        };
        Ok(DeFiTx {
            description: format!(
                "[{}] Bridge {} tokens to {}",
                self.name, params.amount, params.destination_chain
            ),
            to: self.bridge,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn quote(&self, _params: BridgeSendParams) -> Result<BridgeQuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC",
            self.name
        )))
    }
}
