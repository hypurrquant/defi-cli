use alloy::primitives::{Address, Bytes, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::TransactionRequest;
use alloy::sol;
use alloy::sol_types::SolCall;

use crate::error::{DefiError, Result};
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

/// Build a multicall TX (for broadcast)
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
        data: SolCall::abi_encode(&call).into(),
        value: U256::ZERO,
        gas_estimate: None,
    })
}

/// Execute a batch of read-only calls via Multicall3 in a single eth_call.
/// Returns Vec<Option<Bytes>> — None for failed calls (allowFailure=true).
pub async fn multicall_read(
    rpc_url: &str,
    calls: Vec<(Address, Vec<u8>)>,
) -> Result<Vec<Option<Bytes>>> {
    let url: url::Url = rpc_url
        .parse()
        .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;
    let provider = ProviderBuilder::new().connect_http(url);

    let mc_calls: Vec<IMulticall3::Call3> = calls
        .into_iter()
        .map(|(target, call_data)| IMulticall3::Call3 {
            target,
            allowFailure: true,
            callData: call_data.into(),
        })
        .collect();

    let calldata = IMulticall3::aggregate3Call { calls: mc_calls }.abi_encode();

    let tx = TransactionRequest::default()
        .to(MULTICALL3_ADDRESS)
        .input(alloy::primitives::Bytes::copy_from_slice(&calldata).into());

    let output = provider
        .call(tx)
        .await
        .map_err(|e| DefiError::RpcError(format!("Multicall3 eth_call failed: {e}")))?;

    // Decode aggregate3 return: Result[]
    // The return type is Vec<IMulticall3::Result> ABI-encoded
    let return_data =
        <alloy::sol_types::sol_data::Array<IMulticall3::Result> as alloy::sol_types::SolType>::abi_decode(&output)
            .map_err(|e| DefiError::RpcError(format!("Multicall3 decode failed: {e}")))?;

    Ok(return_data
        .into_iter()
        .map(|r| {
            if r.success {
                Some(Bytes::from(r.returnData.to_vec()))
            } else {
                None
            }
        })
        .collect())
}

/// Helper: decode a uint256 from multicall return data
pub fn decode_u256(data: &Option<Bytes>) -> U256 {
    match data {
        Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]),
        _ => U256::ZERO,
    }
}

/// Helper: decode a uint128 from multicall return data (right-aligned in 32 bytes)
pub fn decode_u128(data: &Option<Bytes>) -> u128 {
    match data {
        Some(b) if b.len() >= 32 => {
            let val = U256::from_be_slice(&b[..32]);
            val.to::<u128>()
        }
        _ => 0,
    }
}
