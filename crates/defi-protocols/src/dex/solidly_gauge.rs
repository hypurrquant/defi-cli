use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::gauge::{Gauge, VoteEscrow, Voter};
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IGauge {
        function deposit(uint256 amount) external;
        function depositFor(uint256 amount, uint256 tokenId) external;
        function withdraw(uint256 amount) external;
        function getReward(address account) external;
        function earned(address account) external view returns (uint256);
        function rewardRate() external view returns (uint256);
        function totalSupply() external view returns (uint256);
    }

    #[sol(rpc)]
    interface IVotingEscrow {
        function create_lock(uint256 value, uint256 lock_duration) external returns (uint256);
        function increase_amount(uint256 tokenId, uint256 value) external;
        function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external;
        function withdraw(uint256 tokenId) external;
        function balanceOfNFT(uint256 tokenId) external view returns (uint256);
        function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end);
    }

    #[sol(rpc)]
    interface IVoter {
        function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external;
        function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external;
        function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external;
        function gauges(address pool) external view returns (address);
    }
}

pub struct SolidlyGauge {
    name: String,
    voter: Address,
    ve_token: Address,
}

impl SolidlyGauge {
    pub fn new(name: String, voter: Address, ve_token: Address) -> Self {
        Self {
            name,
            voter,
            ve_token,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let voter = contracts
            .get("voter")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 'voter' contract".to_string()))?;
        let ve_token = contracts
            .get("ve_token")
            .copied()
            .ok_or_else(|| DefiError::ContractError("Missing 've_token' contract".to_string()))?;
        Ok(Self::new(name, voter, ve_token))
    }
}

#[async_trait]
impl Gauge for SolidlyGauge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_deposit(
        &self,
        gauge: Address,
        amount: U256,
        token_id: Option<U256>,
    ) -> Result<DeFiTx> {
        let (data, desc) = if let Some(tid) = token_id {
            let call = IGauge::depositForCall {
                amount,
                tokenId: tid,
            };
            (
                call.abi_encode(),
                format!(
                    "[{}] Deposit {} LP to gauge (boost veNFT #{})",
                    self.name, amount, tid
                ),
            )
        } else {
            let call = IGauge::depositCall { amount };
            (
                call.abi_encode(),
                format!("[{}] Deposit {} LP to gauge", self.name, amount),
            )
        };

        Ok(DeFiTx {
            description: desc,
            to: gauge,
            data: data.into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_withdraw(&self, gauge: Address, amount: U256) -> Result<DeFiTx> {
        let call = IGauge::withdrawCall { amount };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw {} LP from gauge", self.name, amount),
            to: gauge,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_claim_rewards(&self, gauge: Address) -> Result<DeFiTx> {
        // account param will be overridden by msg.sender in most gauge implementations
        let call = IGauge::getRewardCall {
            account: Address::ZERO,
        };
        Ok(DeFiTx {
            description: format!("[{}] Claim gauge rewards", self.name),
            to: gauge,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn get_pending_rewards(
        &self,
        _gauge: Address,
        _user: Address,
    ) -> Result<Vec<RewardInfo>> {
        Err(DefiError::Unsupported(format!(
            "[{}] get_pending_rewards requires RPC",
            self.name
        )))
    }
}

#[async_trait]
impl VoteEscrow for SolidlyGauge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_create_lock(&self, amount: U256, lock_duration: u64) -> Result<DeFiTx> {
        let call = IVotingEscrow::create_lockCall {
            value: amount,
            lock_duration: U256::from(lock_duration),
        };
        Ok(DeFiTx {
            description: format!(
                "[{}] Create veNFT lock: {} tokens for {}s",
                self.name, amount, lock_duration
            ),
            to: self.ve_token,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_increase_amount(&self, token_id: U256, amount: U256) -> Result<DeFiTx> {
        let call = IVotingEscrow::increase_amountCall {
            tokenId: token_id,
            value: amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Increase veNFT #{} by {}", self.name, token_id, amount),
            to: self.ve_token,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_increase_unlock_time(
        &self,
        token_id: U256,
        lock_duration: u64,
    ) -> Result<DeFiTx> {
        let call = IVotingEscrow::increase_unlock_timeCall {
            tokenId: token_id,
            lock_duration: U256::from(lock_duration),
        };
        Ok(DeFiTx {
            description: format!(
                "[{}] Extend veNFT #{} lock by {}s",
                self.name, token_id, lock_duration
            ),
            to: self.ve_token,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_withdraw_expired(&self, token_id: U256) -> Result<DeFiTx> {
        let call = IVotingEscrow::withdrawCall { tokenId: token_id };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw expired veNFT #{}", self.name, token_id),
            to: self.ve_token,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }
}

#[async_trait]
impl Voter for SolidlyGauge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_vote(
        &self,
        token_id: U256,
        pools: Vec<Address>,
        weights: Vec<U256>,
    ) -> Result<DeFiTx> {
        let call = IVoter::voteCall {
            tokenId: token_id,
            pools,
            weights,
        };
        Ok(DeFiTx {
            description: format!("[{}] Vote with veNFT #{}", self.name, token_id),
            to: self.voter,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(500_000),
        })
    }

    async fn build_claim_bribes(&self, bribes: Vec<Address>, token_id: U256) -> Result<DeFiTx> {
        // claimBribes needs token arrays per bribe contract — simplified version
        let tokens_per_bribe: Vec<Vec<Address>> = bribes.iter().map(|_| vec![]).collect();
        let call = IVoter::claimBribesCall {
            bribes,
            tokens: tokens_per_bribe,
            tokenId: token_id,
        };
        Ok(DeFiTx {
            description: format!("[{}] Claim bribes for veNFT #{}", self.name, token_id),
            to: self.voter,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_claim_fees(&self, fees: Vec<Address>, token_id: U256) -> Result<DeFiTx> {
        let tokens_per_fee: Vec<Vec<Address>> = fees.iter().map(|_| vec![]).collect();
        let call = IVoter::claimFeesCall {
            fees,
            tokens: tokens_per_fee,
            tokenId: token_id,
        };
        Ok(DeFiTx {
            description: format!("[{}] Claim trading fees for veNFT #{}", self.name, token_id),
            to: self.voter,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }
}
