use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Derivatives: Send + Sync {
    fn name(&self) -> &str;
    async fn build_open_position(&self, params: DerivativesPositionParams) -> Result<DeFiTx>;
    async fn build_close_position(&self, params: DerivativesPositionParams) -> Result<DeFiTx>;
}
