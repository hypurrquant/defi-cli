use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface ISolidlyRouter {
        struct Route {
            address from;
            address to;
            bool stable;
        }

        function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            Route[] calldata routes,
            address to,
            uint256 deadline
        ) external returns (uint256[] memory amounts);

        function addLiquidity(
            address tokenA,
            address tokenB,
            bool stable,
            uint256 amountADesired,
            uint256 amountBDesired,
            uint256 amountAMin,
            uint256 amountBMin,
            address to,
            uint256 deadline
        ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

        function removeLiquidity(
            address tokenA,
            address tokenB,
            bool stable,
            uint256 liquidity,
            uint256 amountAMin,
            uint256 amountBMin,
            address to,
            uint256 deadline
        ) external returns (uint256 amountA, uint256 amountB);
    }
}

pub struct Solidly {
    name: String,
    router: Address,
    /// Default to volatile (false). True for stablecoin pairs.
    default_stable: bool,
}

impl Solidly {
    pub fn new(name: String, router: Address) -> Self {
        Self {
            name,
            router,
            default_stable: false,
        }
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
impl Dex for Solidly {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        // Without prior quote, set min output to 0. Use quote() first for slippage protection.
        let amount_out_min = U256::ZERO;
        let deadline = U256::from(params.deadline.unwrap_or(u64::MAX));

        let routes = vec![ISolidlyRouter::Route {
            from: params.token_in,
            to: params.token_out,
            stable: self.default_stable,
        }];

        let call = ISolidlyRouter::swapExactTokensForTokensCall {
            amountIn: params.amount_in,
            amountOutMin: amount_out_min,
            routes,
            to: params.recipient,
            deadline,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Swap {} tokens via Solidly",
                self.name, params.amount_in
            ),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn quote(&self, _params: QuoteParams) -> Result<QuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC connection",
            self.name
        )))
    }

    async fn build_add_liquidity(&self, params: AddLiquidityParams) -> Result<DeFiTx> {
        let call = ISolidlyRouter::addLiquidityCall {
            tokenA: params.token_a,
            tokenB: params.token_b,
            stable: self.default_stable,
            amountADesired: params.amount_a,
            amountBDesired: params.amount_b,
            amountAMin: U256::ZERO,
            amountBMin: U256::ZERO,
            to: params.recipient,
            deadline: U256::from(u64::MAX),
        };

        Ok(DeFiTx {
            description: format!("[{}] Add liquidity (Solidly)", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn build_remove_liquidity(&self, params: RemoveLiquidityParams) -> Result<DeFiTx> {
        let call = ISolidlyRouter::removeLiquidityCall {
            tokenA: params.token_a,
            tokenB: params.token_b,
            stable: self.default_stable,
            liquidity: params.liquidity,
            amountAMin: U256::ZERO,
            amountBMin: U256::ZERO,
            to: params.recipient,
            deadline: U256::from(u64::MAX),
        };

        Ok(DeFiTx {
            description: format!("[{}] Remove liquidity (Solidly)", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }
}
