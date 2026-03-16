use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IBalancerRouter {
        struct SwapSingleTokenExactInParams {
            address pool;
            address tokenIn;
            address tokenOut;
            uint256 exactAmountIn;
            uint256 minAmountOut;
            uint256 deadline;
            bool wethIsEth;
            bytes userData;
        }

        function swapSingleTokenExactIn(
            address pool,
            address tokenIn,
            address tokenOut,
            uint256 exactAmountIn,
            uint256 minAmountOut,
            uint256 deadline,
            bool wethIsEth,
            bytes calldata userData
        ) external returns (uint256 amountOut);
    }
}

pub struct BalancerV3 {
    name: String,
    router: Address,
}

impl BalancerV3 {
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
impl Dex for BalancerV3 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        let amount_out_min = params.slippage.apply_min(params.amount_in);
        let deadline = U256::from(params.deadline.unwrap_or(u64::MAX));

        // Balancer V3 requires a pool address. For now use a simplified single-pool swap.
        // In production, the pool would be resolved from the registry or an on-chain query.
        let call = IBalancerRouter::swapSingleTokenExactInCall {
            pool: Address::ZERO, // TODO: resolve pool from registry
            tokenIn: params.token_in,
            tokenOut: params.token_out,
            exactAmountIn: params.amount_in,
            minAmountOut: amount_out_min,
            deadline,
            wethIsEth: false,
            userData: Default::default(),
        };

        Ok(DeFiTx {
            description: format!("[{}] Swap {} via Balancer V3", self.name, params.amount_in),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
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
            "[{}] add_liquidity requires pool-specific params",
            self.name
        )))
    }

    async fn build_remove_liquidity(&self, _params: RemoveLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] remove_liquidity requires pool-specific params",
            self.name
        )))
    }
}
