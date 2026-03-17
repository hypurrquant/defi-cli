use alloy::primitives::{Address, U256};
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::DeFiTx;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct SwapArgs {
    /// Input token symbol (e.g., USDC)
    #[arg(long)]
    pub from: String,

    /// Output token symbol (e.g., WETH)
    #[arg(long)]
    pub to: String,

    /// Amount of input token (human-readable, e.g., 100.0)
    #[arg(long)]
    pub amount: f64,

    /// Slippage tolerance percent (default: 0.5)
    #[arg(long, default_value = "0.5")]
    pub slippage: f64,

    /// Wallet address (for quote; uses DEFI_WALLET_ADDRESS if not set)
    #[arg(long)]
    pub address: Option<String>,
}

pub async fn run(
    args: SwapArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();

    // Resolve tokens
    let token_in = registry.resolve_token(&chain_key, &args.from)?;
    let token_out = registry.resolve_token(&chain_key, &args.to)?;

    // Calculate raw amount
    let amount_raw = (args.amount * 10f64.powi(token_in.decimals as i32)) as u128;

    // User address
    let user_addr = args
        .address
        .as_deref()
        .or(std::env::var("DEFI_WALLET_ADDRESS").ok().as_deref())
        .unwrap_or("0x0000000000000000000000000000000000000001")
        .to_string();

    let client = reqwest::Client::new();

    // Step 1: Get quote from ODOS
    let quote_body = serde_json::json!({
        "chainId": chain.chain_id,
        "inputTokens": [{
            "tokenAddress": format!("{:?}", token_in.address),
            "amount": format!("{}", amount_raw),
        }],
        "outputTokens": [{
            "tokenAddress": format!("{:?}", token_out.address),
            "proportion": 1,
        }],
        "slippageLimitPercent": args.slippage,
        "userAddr": user_addr,
    });

    let quote_resp = client
        .post("https://api.odos.xyz/sor/quote/v2")
        .json(&quote_body)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS quote failed: {e}")))?;

    let quote: serde_json::Value = quote_resp
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS quote parse failed: {e}")))?;

    if quote.get("pathId").is_none() {
        let msg = quote["detail"]
            .as_str()
            .or(quote["message"].as_str())
            .unwrap_or("No route found");
        return Err(DefiError::RpcError(format!("ODOS: {}", msg)));
    }

    let path_id = quote["pathId"].as_str().unwrap_or("");

    // Parse quote result
    let out_amounts = quote["outAmounts"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("0");
    let out_raw = out_amounts.parse::<u128>().unwrap_or(0);
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

    // Step 2: Assemble transaction (if not dry-run quote only)
    let assemble_body = serde_json::json!({
        "userAddr": user_addr,
        "pathId": path_id,
        "simulate": false,
    });

    let assemble_resp = client
        .post("https://api.odos.xyz/sor/assemble")
        .json(&assemble_body)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("ODOS assemble failed: {e}")))?;

    let assemble: serde_json::Value = assemble_resp
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
        .map_err(|e| DefiError::InvalidParam(format!("Invalid router address: {e}")))?;
    let data_bytes =
        alloy::primitives::hex::decode(tx_data.trim_start_matches("0x")).unwrap_or_default();
    let value = tx_value.parse::<u128>().unwrap_or(0);

    // Build quote output
    let mut result = serde_json::json!({
        "chain": chain.name,
        "aggregator": "ODOS",
        "from": args.from,
        "to": args.to,
        "amount_in": args.amount,
        "amount_out": round6(out_human),
        "effective_price": round6(effective_price),
        "price_impact_pct": price_impact,
        "gas_estimate": gas_estimate,
        "slippage_pct": args.slippage,
        "router": tx_to,
    });

    // Execute or simulate
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

    output.print(&result)?;
    Ok(())
}

fn round6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}
