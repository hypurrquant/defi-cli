use alloy::primitives::{Address, U256};
use alloy::sol;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::YieldSource;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IPendleRouter {
        struct ApproxParams {
            uint256 guessMin;
            uint256 guessMax;
            uint256 guessOffchain;
            uint256 maxIteration;
            uint256 eps;
        }

        struct TokenInput {
            address tokenIn;
            uint256 netTokenIn;
            address tokenMintSy;
            address pendleSwap;
            bytes swapData;
        }

        struct TokenOutput {
            address tokenOut;
            uint256 minTokenOut;
            address tokenRedeemSy;
            address pendleSwap;
            bytes swapData;
        }

        function addLiquiditySingleToken(
            address receiver,
            address market,
            uint256 minLpOut,
            ApproxParams calldata guessPtReceivedFromSy,
            TokenInput calldata input
        ) external returns (uint256 netLpOut, uint256 netSyFee);

        function removeLiquiditySingleToken(
            address receiver,
            address market,
            uint256 netLpToRemove,
            TokenOutput calldata output
        ) external returns (uint256 netTokenOut, uint256 netSyFee);

        function swapExactTokenForPt(
            address receiver,
            address market,
            uint256 minPtOut,
            ApproxParams calldata guessPtOut,
            TokenInput calldata input
        ) external returns (uint256 netPtOut, uint256 netSyFee);
    }
}

#[allow(dead_code)]
pub struct Pendle {
    name: String,
    router: Address,
}

impl Pendle {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let router = contracts
            .get("router")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'router' contract".to_string()))?;
        Ok(Self { name, router })
    }
}

#[async_trait]
impl YieldSource for Pendle {
    fn name(&self) -> &str {
        &self.name
    }

    async fn get_yields(&self) -> Result<Vec<YieldInfo>> {
        Err(DefiError::Unsupported(format!(
            "[{}] get_yields requires RPC",
            self.name
        )))
    }

    async fn build_deposit(
        &self,
        _pool: &str,
        _amount: U256,
        _recipient: Address,
    ) -> Result<DeFiTx> {
        // Pendle deposits require market address and complex routing
        Err(DefiError::Unsupported(format!(
            "[{}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.",
            self.name
        )))
    }

    async fn build_withdraw(
        &self,
        _pool: &str,
        _amount: U256,
        _recipient: Address,
    ) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Pendle withdraw requires market-specific params",
            self.name
        )))
    }
}
