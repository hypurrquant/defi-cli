use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait YieldSource: Send + Sync {
    fn name(&self) -> &str;
    async fn get_yields(&self) -> Result<Vec<YieldInfo>>;
    async fn build_deposit(
        &self,
        pool: &str,
        amount: alloy::primitives::U256,
        recipient: alloy::primitives::Address,
    ) -> Result<DeFiTx>;
    async fn build_withdraw(
        &self,
        pool: &str,
        amount: alloy::primitives::U256,
        recipient: alloy::primitives::Address,
    ) -> Result<DeFiTx>;
}
