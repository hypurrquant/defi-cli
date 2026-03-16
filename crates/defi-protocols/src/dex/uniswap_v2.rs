use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IUniswapV2Router02 {
        function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            address[] calldata path,
            address to,
            uint256 deadline
        ) external returns (uint256[] memory amounts);

        function addLiquidity(
            address tokenA,
            address tokenB,
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
            uint256 liquidity,
            uint256 amountAMin,
            uint256 amountBMin,
            address to,
            uint256 deadline
        ) external returns (uint256 amountA, uint256 amountB);

        function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    }
}

pub struct UniswapV2 {
    name: String,
    router: Address,
}

impl UniswapV2 {
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
impl Dex for UniswapV2 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        let amount_out_min = params.slippage.apply_min(params.amount_in);
        let deadline = U256::from(params.deadline.unwrap_or(u64::MAX));
        let path = vec![params.token_in, params.token_out];

        let call = IUniswapV2Router02::swapExactTokensForTokensCall {
            amountIn: params.amount_in,
            amountOutMin: amount_out_min,
            path,
            to: params.recipient,
            deadline,
        };

        Ok(DeFiTx {
            description: format!("[{}] Swap {} tokens via V2", self.name, params.amount_in),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(150_000),
        })
    }

    async fn quote(&self, _params: QuoteParams) -> Result<QuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] quote requires RPC connection",
            self.name
        )))
    }

    async fn build_add_liquidity(&self, params: AddLiquidityParams) -> Result<DeFiTx> {
        let call = IUniswapV2Router02::addLiquidityCall {
            tokenA: params.token_a,
            tokenB: params.token_b,
            amountADesired: params.amount_a,
            amountBDesired: params.amount_b,
            amountAMin: U256::ZERO,
            amountBMin: U256::ZERO,
            to: params.recipient,
            deadline: U256::from(u64::MAX),
        };

        Ok(DeFiTx {
            description: format!("[{}] Add liquidity V2", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_remove_liquidity(&self, params: RemoveLiquidityParams) -> Result<DeFiTx> {
        let call = IUniswapV2Router02::removeLiquidityCall {
            tokenA: params.token_a,
            tokenB: params.token_b,
            liquidity: params.liquidity,
            amountAMin: U256::ZERO,
            amountBMin: U256::ZERO,
            to: params.recipient,
            deadline: U256::from(u64::MAX),
        };

        Ok(DeFiTx {
            description: format!("[{}] Remove liquidity V2", self.name),
            to: self.router,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }
}
