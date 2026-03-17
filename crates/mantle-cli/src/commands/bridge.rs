use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::registry::Registry;

use super::{MANTLE_CHAIN, OutputMode};

#[derive(Args)]
pub struct BridgeArgs {
    /// Destination chain (e.g., ethereum, arbitrum, base)
    #[arg(long)]
    pub to: String,

    /// Token symbol (e.g., USDC, WETH)
    #[arg(long)]
    pub token: String,

    /// Amount to bridge
    #[arg(long)]
    pub amount: f64,

    /// Wallet address
    #[arg(long)]
    pub address: Option<String>,

    /// Bridge FROM another chain to Mantle instead
    #[arg(long)]
    pub from: Option<String>,
}

pub async fn run(args: BridgeArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let (from_chain_key, to_chain_key) = if let Some(ref from) = args.from {
        (from.to_lowercase(), MANTLE_CHAIN.to_string())
    } else {
        (MANTLE_CHAIN.to_string(), args.to.to_lowercase())
    };

    let from_chain = registry.get_chain(&from_chain_key)?;
    let to_chain = registry.get_chain(&to_chain_key)?;
    let from_token = registry.resolve_token(&from_chain_key, &args.token)?;
    let to_token = registry.resolve_token(&to_chain_key, &args.token).ok();

    let amount_raw = (args.amount * 10f64.powi(from_token.decimals as i32)) as u128;
    let user_addr = args
        .address
        .as_deref()
        .or(std::env::var("DEFI_WALLET_ADDRESS").ok().as_deref())
        .unwrap_or("0x0000000000000000000000000000000000000001")
        .to_string();

    let from_addr = if from_token.address == alloy::primitives::Address::ZERO {
        "0x0000000000000000000000000000000000000000".to_string()
    } else {
        format!("{:?}", from_token.address)
    };
    let to_addr = to_token
        .map(|t| {
            if t.address == alloy::primitives::Address::ZERO {
                "0x0000000000000000000000000000000000000000".to_string()
            } else {
                format!("{:?}", t.address)
            }
        })
        .unwrap_or_else(|| from_addr.clone());

    let url = format!(
        "https://li.quest/v1/quote?fromChain={}&toChain={}&fromToken={}&toToken={}&fromAmount={}&fromAddress={}&slippage=0.005",
        from_chain.chain_id, to_chain.chain_id, from_addr, to_addr, amount_raw, user_addr
    );

    let client = reqwest::Client::new();
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

    let estimate = &body["estimate"];
    let to_decimals = to_token.map(|t| t.decimals).unwrap_or(from_token.decimals);
    let to_amount = estimate["toAmount"]
        .as_str()
        .unwrap_or("0")
        .parse::<u128>()
        .unwrap_or(0) as f64
        / 10f64.powi(to_decimals as i32);

    let fee_costs = estimate["feeCosts"]
        .as_array()
        .map(|c| {
            c.iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);
    let gas_costs = estimate["gasCosts"]
        .as_array()
        .map(|c| {
            c.iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);

    let tool_name = body["toolDetails"]["name"]
        .as_str()
        .unwrap_or(body["tool"].as_str().unwrap_or("unknown"));
    let duration = estimate["executionDuration"].as_u64().unwrap_or(0);

    let steps: Vec<String> = body["includedSteps"]
        .as_array()
        .map(|s| {
            s.iter()
                .map(|s| {
                    let t = s["type"].as_str().unwrap_or("?");
                    let n = s["toolDetails"]["name"]
                        .as_str()
                        .unwrap_or(s["tool"].as_str().unwrap_or("?"));
                    format!("{} via {}", t, n)
                })
                .collect()
        })
        .unwrap_or_default();

    let result = serde_json::json!({
        "aggregator": "LI.FI", "bridge": tool_name,
        "from_chain": from_chain.name, "to_chain": to_chain.name,
        "token": args.token, "amount_in": args.amount,
        "amount_out": round6(to_amount),
        "fee_usd": round2(fee_costs), "gas_usd": round2(gas_costs),
        "total_cost_usd": round2(fee_costs + gas_costs),
        "estimated_time_sec": duration, "steps": steps,
    });

    output.print(&result)
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}
