use alloy::primitives::{Address, Bytes, U256};
use alloy::sol;

use crate::error::Result;
use crate::types::DeFiTx;

sol! {
    #[sol(rpc)]
    interface IMulticall3 {
        struct Call3 {
            address target;
            bool allowFailure;
            bytes callData;
        }

        struct Result {
            bool success;
            bytes returnData;
        }

        function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData);
    }
}

/// Default Multicall3 address (same on all EVM chains)
pub const MULTICALL3_ADDRESS: Address =
    alloy::primitives::address!("cA11bde05977b3631167028862bE2a173976CA11");

pub fn build_multicall(calls: Vec<(Address, Bytes)>) -> Result<DeFiTx> {
    let mc_calls: Vec<IMulticall3::Call3> = calls
        .into_iter()
        .map(|(target, call_data)| IMulticall3::Call3 {
            target,
            allowFailure: false,
            callData: call_data,
        })
        .collect();

    let call = IMulticall3::aggregate3Call { calls: mc_calls };
    Ok(DeFiTx {
        description: "Multicall3 batch".to_string(),
        to: MULTICALL3_ADDRESS,
        data: alloy::sol_types::SolCall::abi_encode(&call).into(),
        value: U256::ZERO,
        gas_estimate: None,
    })
}
