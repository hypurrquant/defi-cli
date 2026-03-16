use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
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
            address _owner,
            uint256 _ownerIndex,
            uint256 _collAmount,
            uint256 _boldAmount,
            uint256 _upperHint,
            uint256 _lowerHint,
            uint256 _annualInterestRate,
            uint256 _maxUpfrontFee,
            address _addManager,
            address _removeManager,
            address _receiver
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

    #[sol(rpc)]
    interface IHintHelpers {
        // Liquity V2: first param is collateral index (0 for WHYPE branch)
        function getApproxHint(
            uint256 _collIndex,
            uint256 _interestRate,
            uint256 _numTrials,
            uint256 _inputRandomSeed
        ) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed);
    }

    #[sol(rpc)]
    interface ISortedTroves {
        function findInsertPosition(
            uint256 _annualInterestRate,
            uint256 _prevId,
            uint256 _nextId
        ) external view returns (uint256 prevId, uint256 nextId);
    }
}

#[allow(dead_code)]
pub struct Felix {
    name: String,
    borrower_operations: Address,
    trove_manager: Option<Address>,
    hint_helpers: Option<Address>,
    sorted_troves: Option<Address>,
    rpc_url: Option<String>,
}

impl Felix {
    pub fn new(name: String, borrower_operations: Address, trove_manager: Option<Address>) -> Self {
        Self {
            name,
            borrower_operations,
            trove_manager,
            hint_helpers: None,
            sorted_troves: None,
            rpc_url: None,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let borrower_operations =
            contracts
                .get("borrower_operations")
                .copied()
                .ok_or_else(|| {
                    DefiError::ContractError("Missing 'borrower_operations' contract".to_string())
                })?;
        let trove_manager = contracts.get("trove_manager").copied();
        let hint_helpers = contracts.get("hint_helpers").copied();
        let sorted_troves = contracts.get("sorted_troves").copied();
        Ok(Self {
            name,
            borrower_operations,
            trove_manager,
            hint_helpers,
            sorted_troves,
            rpc_url,
        })
    }

    /// Fetch optimal insertion hints via RPC.
    /// Returns (upperHint, lowerHint) for the sorted troves list.
    /// Falls back to (0, 0) if RPC or hint contracts unavailable.
    async fn get_hints(&self, interest_rate: U256) -> (U256, U256) {
        let (Some(hint_helpers_addr), Some(sorted_troves_addr), Some(rpc_url)) =
            (self.hint_helpers, self.sorted_troves, self.rpc_url.as_ref())
        else {
            return (U256::ZERO, U256::ZERO);
        };

        let Ok(url) = rpc_url.parse::<url::Url>() else {
            return (U256::ZERO, U256::ZERO);
        };

        let provider = ProviderBuilder::new().connect_http(url);

        // Step 1: getApproxHint — gives us a starting point near the correct position
        let hint_contract = IHintHelpers::new(hint_helpers_addr, &provider);
        // collIndex=0 for WHYPE branch (default)
        let approx = hint_contract
            .getApproxHint(U256::ZERO, interest_rate, U256::from(15), U256::from(42))
            .call()
            .await;

        let approx_hint = match approx {
            Ok(result) => result.hintId,
            Err(_) => return (U256::ZERO, U256::ZERO),
        };

        // Step 2: findInsertPosition — refines the hint to exact (prev, next)
        let sorted = ISortedTroves::new(sorted_troves_addr, &provider);
        match sorted
            .findInsertPosition(interest_rate, approx_hint, approx_hint)
            .call()
            .await
        {
            Ok(result) => (result.prevId, result.nextId),
            Err(_) => (U256::ZERO, U256::ZERO),
        }
    }
}

#[async_trait]
impl Cdp for Felix {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_open(&self, params: OpenCdpParams) -> Result<DeFiTx> {
        let interest_rate = U256::from(50000000000000000u64); // 5% default
        let (upper_hint, lower_hint) = self.get_hints(interest_rate).await;

        let has_hints = !upper_hint.is_zero() || !lower_hint.is_zero();

        let call = IBorrowerOperations::openTroveCall {
            _owner: params.recipient,
            _ownerIndex: U256::ZERO,
            _collAmount: params.collateral_amount,
            _boldAmount: params.debt_amount,
            _upperHint: upper_hint,
            _lowerHint: lower_hint,
            _annualInterestRate: interest_rate,
            _maxUpfrontFee: U256::MAX,
            _addManager: params.recipient,
            _removeManager: params.recipient,
            _receiver: params.recipient,
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Open trove: collateral={}, debt={} (hints={})",
                self.name,
                params.collateral_amount,
                params.debt_amount,
                if has_hints { "optimized" } else { "none" }
            ),
            to: self.borrower_operations,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(if has_hints { 500_000 } else { 5_000_000 }),
        })
    }

    async fn build_adjust(&self, params: AdjustCdpParams) -> Result<DeFiTx> {
        let coll_change = params.collateral_delta.unwrap_or(U256::ZERO);
        let debt_change = params.debt_delta.unwrap_or(U256::ZERO);

        // For adjust, hints are also needed but we'd need the new interest rate.
        // Use (0,0) for now — adjust gas is lower than open since the trove already exists.
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
