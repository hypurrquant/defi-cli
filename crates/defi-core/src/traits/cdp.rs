use alloy::primitives::U256;
use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Cdp: Send + Sync {
    fn name(&self) -> &str;
    async fn build_open(&self, params: OpenCdpParams) -> Result<DeFiTx>;
    async fn build_adjust(&self, params: AdjustCdpParams) -> Result<DeFiTx>;
    async fn build_close(&self, params: CloseCdpParams) -> Result<DeFiTx>;
    async fn get_cdp_info(&self, cdp_id: U256) -> Result<CdpInfo>;
}
