use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IWooRouterV2 {
        function swap(
            address fromToken,
            address toToken,
            uint256 fromAmount,
            uint256 minToAmount,
            address to,
            address rebateTo
        ) external payable returns (uint256 realToAmount);
    }
}

pub struct WooFi {
    name: String,
    router: Address,
}

impl WooFi {
    pub fn new(name: String, router: Address) -> Self {
        Self { name, router }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let router = contracts
            .get("router")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'router' contract".to_string()))?;
        Ok(Self::new(name, router))
    }
}

#[async_trait]
impl Dex for WooFi {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        // Without prior quote, set min output to 0. Use quote() first for slippage protection.
        let amount_out_min = U256::ZERO;

        let call = IWooRouterV2::swapCall {
            fromToken: params.token_in,
            toToken: params.token_out,
            fromAmount: params.amount_in,
            minToAmount: amount_out_min,
            to: params.recipient,
            rebateTo: Address::ZERO,
        };

        Ok(DeFiTx {
            description: format!("[{}] Swap {} via WOOFi", self.name, params.amount_in),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn quote(&self, _params: QuoteParams) -> Result<QuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC",
            self.name
        )))
    }

    async fn build_add_liquidity(&self, _params: AddLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] WOOFi does not support LP positions via router",
            self.name
        )))
    }

    async fn build_remove_liquidity(&self, _params: RemoveLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] WOOFi does not support LP positions via router",
            self.name
        )))
    }
}
