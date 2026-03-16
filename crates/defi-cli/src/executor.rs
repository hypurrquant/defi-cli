use alloy::primitives::{Address, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::TransactionRequest;
use alloy::signers::local::PrivateKeySigner;

use defi_core::error::{DefiError, Result};
use defi_core::types::{ActionResult, DeFiTx, TxStatus};

/// Gas buffer multiplier: 20% headroom over estimated gas to prevent out-of-gas.
const GAS_BUFFER_BPS: u64 = 12000; // 120% in basis points

/// Default max priority fee (tip) in wei — 0.1 gwei.
const DEFAULT_PRIORITY_FEE_WEI: u128 = 100_000_000;

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

    /// Apply 20% buffer to a gas estimate.
    fn apply_gas_buffer(gas: u64) -> u64 {
        (gas as u128 * GAS_BUFFER_BPS as u128 / 10000) as u64
    }

    /// Fetch EIP-1559 fee parameters from the network.
    /// Returns (max_fee_per_gas, max_priority_fee_per_gas).
    async fn fetch_eip1559_fees<P: Provider>(
        provider: &P,
    ) -> Result<(u128, u128)> {
        // Get current base fee from latest block
        let base_fee = provider
            .get_gas_price()
            .await
            .map_err(|e| DefiError::RpcError(format!("Failed to fetch gas price: {e}")))?;

        // Try to get priority fee from the node
        let priority_fee = provider
            .get_max_priority_fee_per_gas()
            .await
            .unwrap_or(DEFAULT_PRIORITY_FEE_WEI);

        // max_fee = 2 * base_fee + priority_fee (accounts for base fee volatility)
        let max_fee = base_fee.saturating_mul(2).saturating_add(priority_fee);

        Ok((max_fee, priority_fee))
    }

    /// Estimate gas dynamically with buffer, falling back to hardcoded estimate.
    async fn estimate_gas_with_buffer<P: Provider>(
        provider: &P,
        tx_request: &TransactionRequest,
        fallback: Option<u64>,
    ) -> u64 {
        let mut est_req = tx_request.clone();
        est_req.gas = None; // Clear gas_limit so estimateGas can run
        let estimated = provider
            .estimate_gas(est_req)
            .await
            .unwrap_or(fallback.unwrap_or(0));

        if estimated > 0 {
            Self::apply_gas_buffer(estimated)
        } else {
            fallback.unwrap_or(0)
        }
    }

    /// Simulate a transaction via eth_call + eth_estimateGas.
    async fn simulate(&self, tx: &DeFiTx) -> Result<ActionResult> {
        let rpc_url = self.rpc_url.as_ref().ok_or_else(|| {
            DefiError::RpcError("No RPC URL — cannot simulate. Set HYPEREVM_RPC_URL.".to_string())
        })?;

        let url: url::Url = rpc_url
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;

        let provider = ProviderBuilder::new().connect_http(url);

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
                // 2. Estimate gas with buffer
                let gas_estimate =
                    Self::estimate_gas_with_buffer(&provider, &tx_request, tx.gas_estimate).await;

                // 3. Fetch EIP-1559 fees
                let (max_fee, priority_fee) =
                    Self::fetch_eip1559_fees(&provider).await.unwrap_or((0, 0));

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
                        "max_fee_per_gas_gwei": format!("{:.4}", max_fee as f64 / 1e9),
                        "max_priority_fee_gwei": format!("{:.4}", priority_fee as f64 / 1e9),
                        "mode": "simulated",
                        "result": "success",
                    }),
                })
            }
            Err(e) => {
                let err_msg = e.to_string();
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

        let provider = ProviderBuilder::new()
            .wallet(alloy::network::EthereumWallet::from(signer))
            .connect_http(url);

        let mut tx_request = Self::build_tx_request(&tx).from(sender);

        // Dynamic gas estimation with buffer
        let gas_limit =
            Self::estimate_gas_with_buffer(&provider, &tx_request, tx.gas_estimate).await;
        if gas_limit > 0 {
            tx_request = tx_request.gas_limit(gas_limit);
        }

        // EIP-1559 gas pricing
        if let Ok((max_fee, priority_fee)) = Self::fetch_eip1559_fees(&provider).await
            && max_fee > 0
        {
            tx_request = tx_request
                .max_fee_per_gas(max_fee)
                .max_priority_fee_per_gas(priority_fee);
        }

        eprintln!("Broadcasting transaction to {}...", rpc_url);
        if gas_limit > 0 {
            eprintln!("  Gas limit: {} (with 20% buffer)", gas_limit);
        }

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
            gas_used: Some(receipt.gas_used),
            description: tx.description,
            details: serde_json::json!({
                "to": tx.to.to_string(),
                "from": sender.to_string(),
                "block_number": receipt.block_number,
                "gas_limit": gas_limit,
                "gas_used": receipt.gas_used,
                "mode": "broadcast",
            }),
        })
    }
}

/// Extract a human-readable revert reason from an RPC error message.
fn extract_revert_reason(err: &str) -> String {
    if let Some(pos) = err.find("execution reverted:") {
        return err[pos..].to_string();
    }
    if let Some(pos) = err.find("revert:") {
        return err[pos..].to_string();
    }
    if let Some(pos) = err.find("Error(") {
        return err[pos..].to_string();
    }
    if err.len() > 200 {
        format!("{}...", &err[..200])
    } else {
        err.to_string()
    }
}
