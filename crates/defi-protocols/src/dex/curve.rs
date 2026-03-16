use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface ICurveRouter {
        function exchange(
            address[11] route,
            uint256[5][5] swapParams,
            uint256 amount,
            uint256 expected,
            address[5] pools
        ) external payable returns (uint256);
    }

    #[sol(rpc)]
    interface ICurvePool {
        function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);
        function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256);
        function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) external returns (uint256);
        function remove_liquidity(uint256 amount, uint256[2] min_amounts) external returns (uint256[2]);
    }
}

pub struct CurveStableSwap {
    name: String,
    router: Address,
}

impl CurveStableSwap {
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
impl Dex for CurveStableSwap {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        // Direct pool exchange: swap token at index 0 for token at index 1.
        // The `router` address is treated as the pool address for direct swaps.
        // Callers should set the pool address as the "router" contract in the registry
        // when targeting a specific Curve pool.
        // Without prior quote, set min output to 0. Use quote() first for slippage protection.
        let amount_out_min = U256::ZERO;

        let call = ICurvePool::exchangeCall {
            i: 0i128,
            j: 1i128,
            dx: params.amount_in,
            min_dy: amount_out_min,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Curve pool exchange {} tokens (index 0 -> 1)",
                self.name, params.amount_in
            ),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn quote(&self, _params: QuoteParams) -> Result<QuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC connection",
            self.name
        )))
    }

    async fn build_add_liquidity(&self, params: AddLiquidityParams) -> Result<DeFiTx> {
        // Add liquidity to a 2-token Curve pool
        let call = ICurvePool::add_liquidityCall {
            amounts: [params.amount_a, params.amount_b],
            min_mint_amount: U256::ZERO,
        };

        Ok(DeFiTx {
            description: format!("[{}] Curve add liquidity", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(400_000),
        })
    }

    async fn build_remove_liquidity(&self, params: RemoveLiquidityParams) -> Result<DeFiTx> {
        // Remove liquidity from a 2-token Curve pool
        let call = ICurvePool::remove_liquidityCall {
            amount: params.liquidity,
            min_amounts: [U256::ZERO, U256::ZERO],
        };

        Ok(DeFiTx {
            description: format!("[{}] Curve remove liquidity", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }
}
