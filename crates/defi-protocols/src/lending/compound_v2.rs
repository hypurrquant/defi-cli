use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Lending;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface ICToken {
        function supplyRatePerBlock() external view returns (uint256);
        function borrowRatePerBlock() external view returns (uint256);
        function totalSupply() external view returns (uint256);
        function totalBorrows() external view returns (uint256);
        function underlying() external view returns (address);
        function mint(uint256 mintAmount) external returns (uint256);
        function redeem(uint256 redeemTokens) external returns (uint256);
        function borrow(uint256 borrowAmount) external returns (uint256);
        function repayBorrow(uint256 repayAmount) external returns (uint256);
    }
}

/// Blocks per year estimate for the chain
const BSC_BLOCKS_PER_YEAR: u64 = 10_512_000; // ~3s blocks

pub struct CompoundV2 {
    name: String,
    /// Default vToken address for rate queries
    default_vtoken: Address,
    rpc_url: Option<String>,
}

impl CompoundV2 {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        // Use first vToken found as default
        let default_vtoken = contracts
            .get("vusdt")
            .or(contracts.get("vusdc"))
            .or(contracts.get("vbnb"))
            .or(contracts.get("comptroller"))
            .copied()
            .ok_or_else(|| {
                DefiError::ContractError("Missing vToken or comptroller address".to_string())
            })?;
        Ok(Self {
            name,
            default_vtoken,
            rpc_url,
        })
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .as_ref()
            .ok_or_else(|| DefiError::RpcError("No RPC URL configured".to_string()))?
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }
}

#[async_trait]
impl Lending for CompoundV2 {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_supply(&self, params: SupplyParams) -> Result<DeFiTx> {
        let call = ICToken::mintCall {
            mintAmount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Supply {} to Venus", self.name, params.amount),
            to: self.default_vtoken,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_borrow(&self, params: BorrowParams) -> Result<DeFiTx> {
        let call = ICToken::borrowCall {
            borrowAmount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Borrow {} from Venus", self.name, params.amount),
            to: self.default_vtoken,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn build_repay(&self, params: RepayParams) -> Result<DeFiTx> {
        let call = ICToken::repayBorrowCall {
            repayAmount: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Repay {} to Venus", self.name, params.amount),
            to: self.default_vtoken,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(300_000),
        })
    }

    async fn build_withdraw(&self, params: WithdrawParams) -> Result<DeFiTx> {
        let call = ICToken::redeemCall {
            redeemTokens: params.amount,
        };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw from Venus", self.name),
            to: self.default_vtoken,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(250_000),
        })
    }

    async fn get_rates(&self, _asset: Address) -> Result<LendingRates> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vtoken = ICToken::new(self.default_vtoken, &provider);

        let supply_rate = vtoken.supplyRatePerBlock().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] supplyRatePerBlock failed: {e}", self.name))
        })?;

        let borrow_rate = vtoken.borrowRatePerBlock().call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] borrowRatePerBlock failed: {e}", self.name))
        })?;

        let total_supply = vtoken.totalSupply().call().await.unwrap_or(U256::ZERO);
        let total_borrows = vtoken.totalBorrows().call().await.unwrap_or(U256::ZERO);

        // Convert per-block rate to APY
        let supply_per_block = supply_rate.to::<u128>() as f64 / 1e18;
        let borrow_per_block = borrow_rate.to::<u128>() as f64 / 1e18;
        let supply_apy = supply_per_block * BSC_BLOCKS_PER_YEAR as f64 * 100.0;
        let borrow_apy = borrow_per_block * BSC_BLOCKS_PER_YEAR as f64 * 100.0;

        let supply_f = total_supply.to::<u128>() as f64;
        let borrow_f = total_borrows.to::<u128>() as f64;
        let utilization = if supply_f > 0.0 {
            borrow_f / supply_f * 100.0
        } else {
            0.0
        };

        Ok(LendingRates {
            protocol: self.name.clone(),
            asset: _asset,
            supply_apy,
            borrow_variable_apy: borrow_apy,
            borrow_stable_apy: None,
            utilization,
            total_supply,
            total_borrow: total_borrows,
        })
    }

    async fn get_user_position(&self, _user: Address) -> Result<UserPosition> {
        Err(DefiError::Unsupported(format!(
            "[{}] User position requires querying individual vToken balances",
            self.name
        )))
    }
}
