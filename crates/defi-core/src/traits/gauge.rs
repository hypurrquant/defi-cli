use alloy::primitives::{Address, U256};
use async_trait::async_trait;

use crate::error::Result;
use crate::types::{DeFiTx, RewardInfo};

/// ve(3,3) Gauge operations — stake LP tokens to earn emissions
#[async_trait]
pub trait Gauge: Send + Sync {
    fn name(&self) -> &str;

    /// Deposit LP tokens into gauge
    async fn build_deposit(
        &self,
        gauge: Address,
        amount: U256,
        token_id: Option<U256>,
    ) -> Result<DeFiTx>;

    /// Withdraw LP tokens from gauge
    async fn build_withdraw(&self, gauge: Address, amount: U256) -> Result<DeFiTx>;

    /// Claim earned rewards from gauge
    async fn build_claim_rewards(&self, gauge: Address) -> Result<DeFiTx>;

    /// Get pending rewards for a user
    async fn get_pending_rewards(&self, gauge: Address, user: Address) -> Result<Vec<RewardInfo>>;
}

/// ve(3,3) Vote-escrow operations — lock tokens for veNFT
#[async_trait]
pub trait VoteEscrow: Send + Sync {
    fn name(&self) -> &str;

    /// Create a new veNFT lock
    async fn build_create_lock(&self, amount: U256, lock_duration: u64) -> Result<DeFiTx>;

    /// Increase lock amount
    async fn build_increase_amount(&self, token_id: U256, amount: U256) -> Result<DeFiTx>;

    /// Increase lock duration
    async fn build_increase_unlock_time(
        &self,
        token_id: U256,
        lock_duration: u64,
    ) -> Result<DeFiTx>;

    /// Withdraw after lock expires
    async fn build_withdraw_expired(&self, token_id: U256) -> Result<DeFiTx>;
}

/// ve(3,3) Voter operations — vote on gauge emissions
#[async_trait]
pub trait Voter: Send + Sync {
    fn name(&self) -> &str;

    /// Vote for gauges with veNFT
    async fn build_vote(
        &self,
        token_id: U256,
        pools: Vec<Address>,
        weights: Vec<U256>,
    ) -> Result<DeFiTx>;

    /// Claim bribes for voted pools
    async fn build_claim_bribes(&self, bribes: Vec<Address>, token_id: U256) -> Result<DeFiTx>;

    /// Claim trading fees
    async fn build_claim_fees(&self, fees: Vec<Address>, token_id: U256) -> Result<DeFiTx>;
}

/// Combined ve(3,3) system — gauge staking + vote-escrow + voter
///
/// Implementors of this trait provide the full ve(3,3) stack.
/// The trait is auto-implemented for any type implementing all three sub-traits.
pub trait GaugeSystem: Gauge + VoteEscrow + Voter {}

impl<T: Gauge + VoteEscrow + Voter> GaugeSystem for T {}
