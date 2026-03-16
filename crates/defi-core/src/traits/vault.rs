use alloy::primitives::{Address, U256};
use async_trait::async_trait;

use crate::error::Result;
use crate::types::*;

/// ERC-4626 Vault trait -- covers Capital Allocators, Yield Aggregators, and Yield vaults
#[async_trait]
pub trait Vault: Send + Sync {
    fn name(&self) -> &str;
    async fn build_deposit(&self, assets: U256, receiver: Address) -> Result<DeFiTx>;
    async fn build_withdraw(
        &self,
        assets: U256,
        receiver: Address,
        owner: Address,
    ) -> Result<DeFiTx>;
    async fn total_assets(&self) -> Result<U256>;
    async fn convert_to_shares(&self, assets: U256) -> Result<U256>;
    async fn convert_to_assets(&self, shares: U256) -> Result<U256>;
    async fn get_vault_info(&self) -> Result<VaultInfo>;
}
