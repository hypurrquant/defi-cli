use alloy::primitives::{Address, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Cdp;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IBorrowerOperations {
        function openTrove(
            address _collToken,
            uint256 _collAmount,
            uint256 _debtAmount,
            uint256 _upperHint,
            uint256 _lowerHint,
            uint256 _annualInterestRate,
            uint256 _maxUpfrontFee
        ) external returns (uint256);

        function adjustTrove(
            uint256 _troveId,
            uint256 _collChange,
            bool _isCollIncrease,
            uint256 _debtChange,
            bool _isDebtIncrease,
            uint256 _upperHint,
            uint256 _lowerHint,
            uint256 _maxUpfrontFee
        ) external;

        function closeTrove(uint256 _troveId) external;
    }

    #[sol(rpc)]
    interface ITroveManager {
        function getTroveDebt(uint256 _troveId) external view returns (uint256);
        function getTroveColl(uint256 _troveId) external view returns (uint256);
        function getTroveStatus(uint256 _troveId) external view returns (uint256);
    }
}

#[allow(dead_code)]
pub struct Felix {
    name: String,
    borrower_operations: Address,
    trove_manager: Option<Address>,
}

impl Felix {
    pub fn new(name: String, borrower_operations: Address, trove_manager: Option<Address>) -> Self {
        Self {
            name,
            borrower_operations,
            trove_manager,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let borrower_operations =
            contracts
                .get("borrower_operations")
                .copied()
                .ok_or_else(|| {
                    DefiError::ContractError("Missing 'borrower_operations' contract".to_string())
                })?;
        let trove_manager = contracts.get("trove_manager").copied();
        Ok(Self::new(name, borrower_operations, trove_manager))
    }
}

#[async_trait]
impl Cdp for Felix {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_open(&self, params: OpenCdpParams) -> Result<DeFiTx> {
        let call = IBorrowerOperations::openTroveCall {
            _collToken: params.collateral,
            _collAmount: params.collateral_amount,
            _debtAmount: params.debt_amount,
            _upperHint: U256::ZERO,
            _lowerHint: U256::ZERO,
            _annualInterestRate: U256::from(50000000000000000u64), // 5% default
            _maxUpfrontFee: U256::MAX,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Open trove: collateral={}, debt={}",
                self.name, params.collateral_amount, params.debt_amount
            ),
            to: self.borrower_operations,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(500_000),
        })
    }

    async fn build_adjust(&self, params: AdjustCdpParams) -> Result<DeFiTx> {
        let coll_change = params.collateral_delta.unwrap_or(U256::ZERO);
        let debt_change = params.debt_delta.unwrap_or(U256::ZERO);

        let call = IBorrowerOperations::adjustTroveCall {
            _troveId: params.cdp_id,
            _collChange: coll_change,
            _isCollIncrease: params.add_collateral,
            _debtChange: debt_change,
            _isDebtIncrease: params.add_debt,
            _upperHint: U256::ZERO,
            _lowerHint: U256::ZERO,
            _maxUpfrontFee: U256::MAX,
        };

        Ok(DeFiTx {
            description: format!("[{}] Adjust trove {}", self.name, params.cdp_id),
            to: self.borrower_operations,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(400_000),
        })
    }

    async fn build_close(&self, params: CloseCdpParams) -> Result<DeFiTx> {
        let call = IBorrowerOperations::closeTroveCall {
            _troveId: params.cdp_id,
        };

        Ok(DeFiTx {
            description: format!("[{}] Close trove {}", self.name, params.cdp_id),
            to: self.borrower_operations,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(350_000),
        })
    }

    async fn get_cdp_info(&self, _cdp_id: U256) -> Result<CdpInfo> {
        Err(DefiError::Unsupported(format!(
            "[{}] get_cdp_info requires RPC connection",
            self.name
        )))
    }
}
