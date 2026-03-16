use alloy::primitives::{Address, U256};
use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

#[async_trait]
pub trait YieldAggregator: Send + Sync {
    fn name(&self) -> &str;
    async fn get_vaults(&self) -> Result<Vec<VaultInfo>>;
    async fn build_deposit(
        &self,
        vault: Address,
        amount: U256,
        recipient: Address,
    ) -> Result<DeFiTx>;
    async fn build_withdraw(
        &self,
        vault: Address,
        amount: U256,
        recipient: Address,
        owner: Address,
    ) -> Result<DeFiTx>;
}
