use alloy::primitives::{Address, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::TransactionRequest;
use alloy::signers::local::PrivateKeySigner;

use defi_core::error::{DefiError, Result};
use defi_core::types::{ActionResult, DeFiTx, TxStatus};

pub struct Executor {
    pub dry_run: bool,
    pub rpc_url: Option<String>,
}

impl Executor {
    pub fn new(broadcast: bool, rpc_url: Option<String>) -> Self {
        Self {
            dry_run: !broadcast,
            rpc_url,
        }
    }

    fn build_tx_request(tx: &DeFiTx) -> TransactionRequest {
        let mut req = TransactionRequest::default()
            .to(tx.to)
            .input(alloy::primitives::Bytes::copy_from_slice(&tx.data).into());

        if tx.value > U256::ZERO {
            req = req.value(tx.value);
        }

        if let Some(gas) = tx.gas_estimate {
            req = req.gas_limit(gas);
        }

        req
    }

    /// Simulate a transaction via eth_call + eth_estimateGas.
    /// Returns (success, gas_estimate, revert_reason).
    async fn simulate(&self, tx: &DeFiTx) -> Result<ActionResult> {
        let rpc_url = self.rpc_url.as_ref().ok_or_else(|| {
            DefiError::RpcError("No RPC URL — cannot simulate. Set HYPEREVM_RPC_URL.".to_string())
        })?;

        let url: url::Url = rpc_url
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;

        let provider = ProviderBuilder::new().connect_http(url);

        // Use a dummy sender for simulation (address(1) has no special meaning)
        let sender = std::env::var("DEFI_PRIVATE_KEY")
            .ok()
            .and_then(|k| k.parse::<PrivateKeySigner>().ok())
            .map(|s| s.address())
            .unwrap_or(Address::with_last_byte(1));

        let tx_request = Self::build_tx_request(tx).from(sender);

        // 1. eth_call — check if TX would revert
        let call_result = provider.call(tx_request.clone()).await;

        match call_result {
            Ok(_output) => {
                // Success — now estimate gas
                let est_request = tx_request.clone().gas_limit(0);
                let gas_estimate = provider
                    .estimate_gas(est_request)
                    .await
                    .unwrap_or(tx.gas_estimate.unwrap_or(0));

                Ok(ActionResult {
                    tx_hash: None,
                    status: TxStatus::Simulated,
                    gas_used: Some(gas_estimate),
                    description: tx.description.clone(),
                    details: serde_json::json!({
                        "to": tx.to.to_string(),
                        "from": sender.to_string(),
                        "data": tx.data.to_string(),
                        "value": tx.value.to_string(),
                        "gas_estimate": gas_estimate,
                        "mode": "simulated",
                        "result": "success",
                    }),
                })
            }
            Err(e) => {
                let err_msg = e.to_string();
                // Parse revert reason if available
                let revert_reason = if err_msg.contains("revert") {
                    extract_revert_reason(&err_msg)
                } else {
                    err_msg.clone()
                };

                Ok(ActionResult {
                    tx_hash: None,
                    status: TxStatus::SimulationFailed,
                    gas_used: tx.gas_estimate,
                    description: tx.description.clone(),
                    details: serde_json::json!({
                        "to": tx.to.to_string(),
                        "from": sender.to_string(),
                        "data": tx.data.to_string(),
                        "value": tx.value.to_string(),
                        "mode": "simulated",
                        "result": "revert",
                        "revert_reason": revert_reason,
                    }),
                })
            }
        }
    }

    pub async fn execute(&self, tx: DeFiTx) -> Result<ActionResult> {
        if self.dry_run {
            // If RPC is available, simulate; otherwise just return calldata
            if self.rpc_url.is_some() {
                return self.simulate(&tx).await;
            }

            return Ok(ActionResult {
                tx_hash: None,
                status: TxStatus::DryRun,
                gas_used: tx.gas_estimate,
                description: tx.description,
                details: serde_json::json!({
                    "to": tx.to.to_string(),
                    "data": tx.data.to_string(),
                    "value": tx.value.to_string(),
                    "mode": "dry_run",
                }),
            });
        }

        // === Broadcast mode ===
        let private_key = std::env::var("DEFI_PRIVATE_KEY").map_err(|_| {
            DefiError::InvalidParam(
                "DEFI_PRIVATE_KEY environment variable not set. Required for --broadcast."
                    .to_string(),
            )
        })?;

        let signer: PrivateKeySigner = private_key
            .parse()
            .map_err(|e| DefiError::InvalidParam(format!("Invalid private key: {e}")))?;

        let sender = signer.address();

        let rpc_url = self.rpc_url.as_ref().ok_or_else(|| {
            DefiError::RpcError("No RPC URL configured for broadcasting".to_string())
        })?;

        let url: url::Url = rpc_url
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;

        eprintln!("Broadcasting transaction to {}...", rpc_url);

        let provider = ProviderBuilder::new()
            .wallet(alloy::network::EthereumWallet::from(signer))
            .connect_http(url);

        let tx_request = Self::build_tx_request(&tx);

        let pending = provider
            .send_transaction(tx_request)
            .await
            .map_err(|e| DefiError::ContractError(format!("Transaction send failed: {e}")))?;

        let tx_hash = format!("{:?}", pending.tx_hash());

        eprintln!("Transaction sent: {tx_hash}");
        eprintln!("Waiting for confirmation...");

        let receipt = pending
            .get_receipt()
            .await
            .map_err(|e| DefiError::ContractError(format!("Failed to get receipt: {e}")))?;

        let status = if receipt.status() {
            TxStatus::Confirmed
        } else {
            TxStatus::Failed
        };

        Ok(ActionResult {
            tx_hash: Some(tx_hash),
            status,
            gas_used: Some(receipt.gas_used as u64),
            description: tx.description,
            details: serde_json::json!({
                "to": tx.to.to_string(),
                "from": sender.to_string(),
                "block_number": receipt.block_number,
                "mode": "broadcast",
            }),
        })
    }
}

/// Extract a human-readable revert reason from an RPC error message.
fn extract_revert_reason(err: &str) -> String {
    // Common patterns: "execution reverted: Some reason" or "revert: reason"
    if let Some(pos) = err.find("execution reverted:") {
        return err[pos..].to_string();
    }
    if let Some(pos) = err.find("revert:") {
        return err[pos..].to_string();
    }
    if let Some(pos) = err.find("Error(") {
        return err[pos..].to_string();
    }
    // Return shortened error
    if err.len() > 200 {
        format!("{}...", &err[..200])
    } else {
        err.to_string()
    }
}
