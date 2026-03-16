use alloy::primitives::U256;
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

    pub async fn execute(&self, tx: DeFiTx) -> Result<ActionResult> {
        if self.dry_run {
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

        // Get private key from environment
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

        // Build transaction request
        let mut tx_request = TransactionRequest::default()
            .to(tx.to)
            .input(tx.data.into());

        if tx.value > U256::ZERO {
            tx_request = tx_request.value(tx.value);
        }

        if let Some(gas) = tx.gas_estimate {
            tx_request = tx_request.gas_limit(gas);
        }

        // Send transaction
        let pending = provider
            .send_transaction(tx_request)
            .await
            .map_err(|e| DefiError::ContractError(format!("Transaction send failed: {e}")))?;

        let tx_hash = format!("{:?}", pending.tx_hash());

        eprintln!("Transaction sent: {tx_hash}");
        eprintln!("Waiting for confirmation...");

        // Wait for receipt
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
