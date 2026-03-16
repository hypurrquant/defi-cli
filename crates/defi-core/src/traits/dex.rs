use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Dex: Send + Sync {
    fn name(&self) -> &str;
    async fn build_swap(&self, params: SwapParams) -> Result<DeFiTx>;
    async fn quote(&self, params: QuoteParams) -> Result<QuoteResult>;
    async fn build_add_liquidity(&self, params: AddLiquidityParams) -> Result<DeFiTx>;
    async fn build_remove_liquidity(&self, params: RemoveLiquidityParams) -> Result<DeFiTx>;
}
