use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Options: Send + Sync {
    fn name(&self) -> &str;
    async fn build_buy(&self, params: OptionParams) -> Result<DeFiTx>;
    async fn build_sell(&self, params: OptionParams) -> Result<DeFiTx>;
}
