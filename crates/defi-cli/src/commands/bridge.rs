use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::registry::Registry;

use crate::output::OutputMode;

#[derive(Args)]
pub struct BridgeArgs {
    /// Source chain (e.g., mantle)
    #[arg(long)]
    pub from_chain: String,

    /// Destination chain (e.g., ethereum)
    #[arg(long)]
    pub to_chain: String,

    /// Token symbol (e.g., USDC, WETH)
    #[arg(long)]
    pub token: String,

    /// Amount to bridge (human-readable)
    #[arg(long)]
    pub amount: f64,

    /// Wallet address
    #[arg(long)]
    pub address: Option<String>,

    /// Slippage tolerance percent (default: 0.5)
    #[arg(long, default_value = "0.5")]
    pub slippage: f64,
}

pub async fn run(args: BridgeArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let from_chain = registry.get_chain(&args.from_chain)?;
    let to_chain = registry.get_chain(&args.to_chain)?;
    let from_key = from_chain.name.to_lowercase();
    let to_key = to_chain.name.to_lowercase();

    // Resolve token on source chain
    let from_token = registry.resolve_token(&from_key, &args.token)?;

    // Resolve token on destination chain (might have different address)
    let to_token = registry.resolve_token(&to_key, &args.token).ok();

    let amount_raw = (args.amount * 10f64.powi(from_token.decimals as i32)) as u128;

    let user_addr = args
        .address
        .as_deref()
        .or(std::env::var("DEFI_WALLET_ADDRESS").ok().as_deref())
        .unwrap_or("0x0000000000000000000000000000000000000001")
        .to_string();

    let client = reqwest::Client::new();

    // LI.FI API: get quote
    let from_token_addr = if from_token.address == alloy::primitives::Address::ZERO {
        "0x0000000000000000000000000000000000000000".to_string()
    } else {
        format!("{:?}", from_token.address)
    };

    let to_token_addr = to_token
        .map(|t| {
            if t.address == alloy::primitives::Address::ZERO {
                "0x0000000000000000000000000000000000000000".to_string()
            } else {
                format!("{:?}", t.address)
            }
        })
        .unwrap_or_else(|| from_token_addr.clone());

    let url = format!(
        "https://li.quest/v1/quote?fromChain={}&toChain={}&fromToken={}&toToken={}&fromAmount={}&fromAddress={}&slippage={}",
        from_chain.chain_id,
        to_chain.chain_id,
        from_token_addr,
        to_token_addr,
        amount_raw,
        user_addr,
        args.slippage / 100.0,
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("LI.FI quote failed: {e}")))?;

    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("LI.FI parse failed: {e}")))?;

    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("Unknown error");
        return Err(DefiError::RpcError(format!("LI.FI: {}", msg)));
    }

    // Parse response
    let estimate = &body["estimate"];
    let to_amount_raw = estimate["toAmount"].as_str().unwrap_or("0");
    let to_decimals = to_token.map(|t| t.decimals).unwrap_or(from_token.decimals);
    let to_amount =
        to_amount_raw.parse::<u128>().unwrap_or(0) as f64 / 10f64.powi(to_decimals as i32);

    let fee_costs = estimate["feeCosts"]
        .as_array()
        .map(|costs| {
            costs
                .iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);

    let gas_costs = estimate["gasCosts"]
        .as_array()
        .map(|costs| {
            costs
                .iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);

    let execution_duration = estimate["executionDuration"].as_u64().unwrap_or(0);

    // Tool/bridge used
    let tool = body["tool"].as_str().unwrap_or("unknown");
    let tool_details = &body["toolDetails"];
    let tool_name = tool_details["name"].as_str().unwrap_or(tool);

    // Steps
    let steps: Vec<String> = body["includedSteps"]
        .as_array()
        .map(|steps| {
            steps
                .iter()
                .map(|s| {
                    let stype = s["type"].as_str().unwrap_or("?");
                    let stool = s["toolDetails"]["name"]
                        .as_str()
                        .unwrap_or(s["tool"].as_str().unwrap_or("?"));
                    format!("{} via {}", stype, stool)
                })
                .collect()
        })
        .unwrap_or_default();

    // Transaction data
    let tx_request = &body["transactionRequest"];
    let tx_to = tx_request["to"].as_str().unwrap_or("");
    let tx_value = tx_request["value"].as_str().unwrap_or("0");
    let tx_gas = tx_request["gasLimit"].as_str().unwrap_or("0");

    let result = serde_json::json!({
        "aggregator": "LI.FI",
        "bridge": tool_name,
        "from_chain": from_chain.name,
        "to_chain": to_chain.name,
        "token": args.token,
        "amount_in": args.amount,
        "amount_out": round6(to_amount),
        "fee_usd": round2(fee_costs),
        "gas_usd": round2(gas_costs),
        "total_cost_usd": round2(fee_costs + gas_costs),
        "estimated_time_sec": execution_duration,
        "steps": steps,
        "tx": {
            "to": tx_to,
            "value": tx_value,
            "gas_limit": tx_gas,
        },
    });

    output.print(&result)?;
    Ok(())
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}
