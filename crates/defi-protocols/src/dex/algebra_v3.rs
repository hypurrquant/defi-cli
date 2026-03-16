#[allow(unused_imports)]
use alloy::primitives::Signed;
use alloy::primitives::{Address, U256, Uint};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IAlgebraRouter {
        struct ExactInputSingleParams {
            address tokenIn;
            address tokenOut;
            address recipient;
            uint256 deadline;
            uint256 amountIn;
            uint256 amountOutMinimum;
            uint160 limitSqrtPrice;
        }

        function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    }
}

pub struct AlgebraV3 {
    name: String,
    router: Address,
}

impl AlgebraV3 {
    pub fn new(name: String, router: Address) -> Self {
        Self { name, router }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let router = contracts.get("router").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'router' contract address".to_string())
        })?;
        Ok(Self::new(name, router))
    }
}

#[async_trait]
impl Dex for AlgebraV3 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        let deadline = params.deadline.unwrap_or(u64::MAX);
        let amount_out_min = params.slippage.apply_min(params.amount_in);

        let call = IAlgebraRouter::exactInputSingleCall {
            params: IAlgebraRouter::ExactInputSingleParams {
                tokenIn: params.token_in,
                tokenOut: params.token_out,
                recipient: params.recipient,
                deadline: U256::from(deadline),
                amountIn: params.amount_in,
                amountOutMinimum: amount_out_min,
                limitSqrtPrice: Uint::<160, 3>::ZERO,
            },
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Swap {} tokenIn for tokenOut",
                self.name, params.amount_in
            ),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn quote(&self, _params: QuoteParams) -> Result<QuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC connection",
            self.name
        )))
    }

    async fn build_add_liquidity(&self, _params: AddLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] add_liquidity not yet implemented",
            self.name
        )))
    }

    async fn build_remove_liquidity(&self, _params: RemoveLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] remove_liquidity not yet implemented",
            self.name
        )))
    }
}
