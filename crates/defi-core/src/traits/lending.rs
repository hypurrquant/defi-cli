use alloy::primitives::Address;
use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait Lending: Send + Sync {
    fn name(&self) -> &str;
    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx>;
    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx>;
    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx>;
    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx>;
    async fn get_rates(&self, asset: Address) -> Result<LendingRates>;
    async fn get_user_position(&self, user: Address) -> Result<UserPosition>;
}
