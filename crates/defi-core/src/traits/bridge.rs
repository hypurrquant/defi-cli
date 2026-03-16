use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Bridge: Send + Sync {
    fn name(&self) -> &str;
    async fn build_send(&self, params: BridgeSendParams) -> Result<DeFiTx>;
    async fn quote(&self, params: BridgeSendParams) -> Result<BridgeQuoteResult>;
}
