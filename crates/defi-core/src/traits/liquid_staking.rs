use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait LiquidStaking: Send + Sync {
    fn name(&self) -> &str;
    async fn build_stake(&self, params: StakeParams) -> Result<DeFiTx>;
    async fn build_unstake(&self, params: UnstakeParams) -> Result<DeFiTx>;
    async fn get_info(&self) -> Result<StakingInfo>;
}
