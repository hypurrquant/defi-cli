use alloy::primitives::{Address, U256};
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::DeFiTx;

use super::OutputMode;

#[derive(Args)]
pub struct SwapArgs {
    /// Input token symbol (e.g., USDC)
    #[arg(long)]
    pub from: String,

    /// Output token symbol (e.g., WETH)
    #[arg(long)]
    pub to: String,

    /// Amount of input token
    #[arg(long)]
    pub amount: f64,

    /// Slippage tolerance percent
    #[arg(long, default_value = "0.5")]
    pub slippage: f64,
}

pub async fn run(
    args: SwapArgs,
    registry: &Registry,
    chain: &ChainConfig,
    broadcast: bool,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();
    let token_in = registry.resolve_token(&chain_key, &args.from)?;
    let token_out = registry.resolve_token(&chain_key, &args.to)?;
    let amount_raw = (args.amount * 10f64.powi(token_in.decimals as i32)) as u128;

    let user_addr = std::env::var("DEFI_WALLET_ADDRESS")
        .unwrap_or_else(|_| "0x0000000000000000000000000000000000000001".into());

    let client = reqwest::Client::new();

    let quote_body = serde_json::json!({
        "chainId": chain.chain_id,
        "inputTokens": [{"tokenAddress": format!("{:?}", token_in.address), "amount": format!("{}", amount_raw)}],
        "outputTokens": [{"tokenAddress": format!("{:?}", token_out.address), "proportion": 1}],
        "slippageLimitPercent": args.slippage,
        "userAddr": user_addr,
    });

    let quote: serde_json::Value = client
        .post("https://api.odos.xyz/sor/quote/v2")
        .json(&quote_body)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS quote failed: {e}")))?
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS parse failed: {e}")))?;

    if quote.get("pathId").is_none() {
        let msg = quote["detail"]
            .as_str()
            .or(quote["message"].as_str())
            .unwrap_or("No route found");
        return Err(DefiError::RpcError(format!("ODOS: {}", msg)));
    }

    let path_id = quote["pathId"].as_str().unwrap_or("");
    let out_raw = quote["outAmounts"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<u128>()
        .unwrap_or(0);
    let out_human = out_raw as f64 / 10f64.powi(token_out.decimals as i32);
    let gas_estimate = quote["gasEstimate"]
        .as_f64()
        .or(quote["gasEstimate"].as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0.0);
    let price_impact = quote["priceImpact"]
        .as_f64()
        .or(quote["percentDiff"].as_f64().map(|v| v.abs()));
    let effective_price = if args.amount > 0.0 {
        out_human / args.amount
    } else {
        0.0
    };

    let assemble: serde_json::Value = client
        .post("https://api.odos.xyz/sor/assemble")
        .json(&serde_json::json!({"userAddr": user_addr, "pathId": path_id, "simulate": false}))
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS assemble failed: {e}")))?
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS assemble parse failed: {e}")))?;

    let tx_to = assemble["transaction"]["to"]
        .as_str()
        .unwrap_or("0x0000000000000000000000000000000000000000");
    let tx_data = assemble["transaction"]["data"].as_str().unwrap_or("0x");
    let tx_value = assemble["transaction"]["value"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            assemble["transaction"]["value"]
                .as_u64()
                .map(|v| v.to_string())
                .unwrap_or_else(|| "0".to_string())
        });

    let to_addr: Address = tx_to
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid router: {e}")))?;
    let data_bytes =
        alloy::primitives::hex::decode(tx_data.trim_start_matches("0x")).unwrap_or_default();
    let value = tx_value.parse::<u128>().unwrap_or(0);

    let mut result = serde_json::json!({
        "chain": "Mantle", "aggregator": "ODOS",
        "from": args.from, "to": args.to,
        "amount_in": args.amount, "amount_out": round6(out_human),
        "effective_price": round6(effective_price),
        "price_impact_pct": price_impact,
        "gas_estimate": gas_estimate, "slippage_pct": args.slippage,
        "router": tx_to,
    });

    let executor = defi_core_executor(broadcast, &chain.effective_rpc_url());
    let tx = DeFiTx {
        description: format!(
            "ODOS swap: {} {} → {} {}",
            args.amount,
            args.from,
            round6(out_human),
            args.to
        ),
        to: to_addr,
        data: data_bytes.into(),
        value: U256::from(value),
        gas_estimate: Some(gas_estimate as u64),
    };
    let exec_result = executor.execute(tx).await?;
    result["tx"] = serde_json::json!({
        "status": format!("{:?}", exec_result.status),
        "gas_used": exec_result.gas_used,
        "tx_hash": exec_result.tx_hash,
    });

    output.print(&result)
}

/// Minimal executor (same logic as defi-cli executor but self-contained)
fn defi_core_executor(broadcast: bool, rpc_url: &str) -> Executor {
    Executor {
        dry_run: !broadcast,
        rpc_url: Some(rpc_url.to_string()),
    }
}

use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::TransactionRequest;
use alloy::signers::local::PrivateKeySigner;
use defi_core::types::{ActionResult, TxStatus};

pub struct Executor {
    pub dry_run: bool,
    pub rpc_url: Option<String>,
}

impl Executor {
    pub async fn execute(&self, tx: DeFiTx) -> Result<ActionResult> {
        if self.dry_run {
            if let Some(ref rpc_url) = self.rpc_url {
                let url: url::Url = rpc_url
                    .parse()
                    .map_err(|e| DefiError::RpcError(format!("Invalid RPC: {e}")))?;
                let provider = ProviderBuilder::new().connect_http(url);
                let sender = std::env::var("DEFI_PRIVATE_KEY")
                    .ok()
                    .and_then(|k| k.parse::<PrivateKeySigner>().ok())
                    .map(|s| s.address())
                    .unwrap_or(Address::with_last_byte(1));
                let tx_req = TransactionRequest::default()
                    .to(tx.to)
                    .input(alloy::primitives::Bytes::copy_from_slice(&tx.data).into())
                    .from(sender);
                match provider.call(tx_req).await {
                    Ok(_) => {
                        return Ok(ActionResult {
                            tx_hash: None,
                            status: TxStatus::Simulated,
                            gas_used: tx.gas_estimate,
                            description: tx.description,
                            details: serde_json::json!({"mode": "simulated", "result": "success"}),
                        });
                    }
                    Err(e) => {
                        return Ok(ActionResult {
                            tx_hash: None,
                            status: TxStatus::SimulationFailed,
                            gas_used: tx.gas_estimate,
                            description: tx.description,
                            details: serde_json::json!({"mode": "simulated", "result": "revert", "error": e.to_string()}),
                        });
                    }
                }
            }
            return Ok(ActionResult {
                tx_hash: None,
                status: TxStatus::DryRun,
                gas_used: tx.gas_estimate,
                description: tx.description,
                details: serde_json::json!({"mode": "dry_run"}),
            });
        }
        Err(DefiError::InvalidParam(
            "Broadcast requires DEFI_PRIVATE_KEY".into(),
        ))
    }
}

fn round6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}
