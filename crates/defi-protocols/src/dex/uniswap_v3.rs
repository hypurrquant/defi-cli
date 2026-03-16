use alloy::primitives::{Address, Signed, U256, Uint};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Dex;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface ISwapRouter {
        struct ExactInputSingleParams {
            address tokenIn;
            address tokenOut;
            uint24 fee;
            address recipient;
            uint256 deadline;
            uint256 amountIn;
            uint256 amountOutMinimum;
            uint160 sqrtPriceLimitX96;
        }

        function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

        struct ExactInputParams {
            bytes path;
            address recipient;
            uint256 deadline;
            uint256 amountIn;
            uint256 amountOutMinimum;
        }

        function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
    }

    #[sol(rpc)]
    interface IQuoterV2 {
        struct QuoteExactInputSingleParams {
            address tokenIn;
            address tokenOut;
            uint256 amountIn;
            uint24 fee;
            uint160 sqrtPriceLimitX96;
        }

        function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
            external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
    }

    #[sol(rpc)]
    interface INonfungiblePositionManager {
        struct MintParams {
            address token0;
            address token1;
            uint24 fee;
            int24 tickLower;
            int24 tickUpper;
            uint256 amount0Desired;
            uint256 amount1Desired;
            uint256 amount0Min;
            uint256 amount1Min;
            address recipient;
            uint256 deadline;
        }

        function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

        struct DecreaseLiquidityParams {
            uint256 tokenId;
            uint128 liquidity;
            uint256 amount0Min;
            uint256 amount1Min;
            uint256 deadline;
        }

        function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
    }
}

/// Default fee tier (0.3%)
const DEFAULT_FEE: u32 = 3000;

pub struct UniswapV3 {
    name: String,
    router: Address,
    quoter: Option<Address>,
    position_manager: Option<Address>,
    fee: u32,
    rpc_url: Option<String>,
}

impl UniswapV3 {
    pub fn new(
        name: String,
        router: Address,
        quoter: Option<Address>,
        position_manager: Option<Address>,
    ) -> Self {
        Self {
            name,
            router,
            quoter,
            position_manager,
            fee: DEFAULT_FEE,
            rpc_url: None,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let router = contracts.get("router").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'router' contract address".to_string())
        })?;
        let quoter = contracts.get("quoter").copied();
        let position_manager = contracts.get("position_manager").copied();
        Ok(Self {
            name,
            router,
            quoter,
            position_manager,
            fee: DEFAULT_FEE,
            rpc_url,
        })
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .as_ref()
            .ok_or_else(|| DefiError::RpcError("No RPC URL configured".to_string()))?
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }
}

#[async_trait]
impl Dex for UniswapV3 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx> {
        let deadline = params.deadline.unwrap_or(u64::MAX);
        let amount_out_min = params.slippage.apply_min(params.amount_in); // simplified — real impl needs quote first

        let call = ISwapRouter::exactInputSingleCall {
            params: ISwapRouter::ExactInputSingleParams {
                tokenIn: params.token_in,
                tokenOut: params.token_out,
                fee: self.fee.try_into().unwrap(),
                recipient: params.recipient,
                deadline: U256::from(deadline),
                amountIn: params.amount_in,
                amountOutMinimum: amount_out_min,
                sqrtPriceLimitX96: Uint::<160, 3>::ZERO,
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
            gas_estimate: Some(200_000),
        })
    }

    async fn quote(&self, params: QuoteParams) -> Result<QuoteResult> {
        let quoter_addr = self.quoter.ok_or_else(|| {
            DefiError::Unsupported(format!(
                "[{}] quote not available — no quoter contract configured",
                self.name
            ))
        })?;
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let quoter = IQuoterV2::new(quoter_addr, &provider);

        let result = quoter
            .quoteExactInputSingle(IQuoterV2::QuoteExactInputSingleParams {
                tokenIn: params.token_in,
                tokenOut: params.token_out,
                amountIn: params.amount_in,
                fee: self.fee.try_into().unwrap(),
                sqrtPriceLimitX96: Uint::<160, 3>::ZERO,
            })
            .call()
            .await
            .map_err(|e| {
                DefiError::RpcError(format!("[{}] quoteExactInputSingle failed: {e}", self.name))
            })?;

        Ok(QuoteResult {
            protocol: self.name.clone(),
            amount_out: result.amountOut,
            price_impact_bps: None,
            fee_bps: Some(self.fee as u16 / 10), // Convert from 1/1_000_000 to bps
            route: vec![format!("{} -> {}", params.token_in, params.token_out)],
        })
    }

    async fn build_add_liquidity(&self, params: AddLiquidityParams) -> Result<DeFiTx> {
        let pm = self.position_manager.ok_or_else(|| {
            DefiError::ContractError("Position manager address not configured".to_string())
        })?;

        // Sort tokens (Uniswap V3 requires token0 < token1)
        let (token0, token1, amount0, amount1) = if params.token_a < params.token_b {
            (
                params.token_a,
                params.token_b,
                params.amount_a,
                params.amount_b,
            )
        } else {
            (
                params.token_b,
                params.token_a,
                params.amount_b,
                params.amount_a,
            )
        };

        let call = INonfungiblePositionManager::mintCall {
            params: INonfungiblePositionManager::MintParams {
                token0,
                token1,
                fee: self.fee.try_into().unwrap(),
                tickLower: Signed::<24, 1>::try_from(-887220i32).unwrap(), // full range
                tickUpper: Signed::<24, 1>::try_from(887220i32).unwrap(),
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: U256::ZERO,
                amount1Min: U256::ZERO,
                recipient: params.recipient,
                deadline: U256::from(u64::MAX),
            },
        };

        Ok(DeFiTx {
            description: format!("[{}] Add liquidity", self.name),
            to: pm,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(500_000),
        })
    }

    async fn build_remove_liquidity(&self, _params: RemoveLiquidityParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] remove_liquidity requires tokenId — use NFT position manager directly",
            self.name
        )))
    }
}
