use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;
use std::io::IsTerminal;

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};
use defi_core::types::DeFiTx;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct ArbArgs {
    /// Execute trades (default: analysis only)
    #[arg(long)]
    pub execute: bool,

    /// Minimum profit in USD to act on
    #[arg(long, default_value = "10.0")]
    pub min_profit: f64,

    /// Trade amount in USD
    #[arg(long, default_value = "100.0")]
    pub amount: f64,

    /// Slippage tolerance percent
    #[arg(long, default_value = "1.0")]
    pub slippage: f64,
}

alloy::sol! {
    interface IUniV2Router {
        function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            address[] calldata path,
            address to,
            uint256 deadline
        ) external returns (uint256[] memory amounts);
    }
}

pub async fn run(
    args: ArbArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    // Read scan JSON from stdin
    if std::io::stdin().is_terminal() {
        return Err(DefiError::InvalidParam(
            "No input. Pipe from scan: defi scan --chain bnb --once --json | defi arb --chain bnb"
                .into(),
        ));
    }

    let input = std::io::read_to_string(std::io::stdin())
        .map_err(|e| DefiError::Internal(format!("Failed to read stdin: {e}")))?;

    let scan: serde_json::Value = serde_json::from_str(&input)
        .map_err(|e| DefiError::InvalidParam(format!("Invalid scan JSON: {e}")))?;

    let alerts = scan["alerts"]
        .as_array()
        .ok_or_else(|| DefiError::InvalidParam("No alerts array in scan output".into()))?;

    if alerts.is_empty() {
        output.print(&serde_json::json!({
            "chain": chain.name,
            "opportunities": [],
            "message": "No alerts to act on",
        }))?;
        return Ok(());
    }

    let chain_key = chain.name.to_lowercase();

    // Find DEX router for execution
    let dex: Option<(String, Address)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Dex && p.interface == "uniswap_v2")
        .filter_map(|p| p.contracts.get("router").map(|a| (p.name.clone(), *a)))
        .next();

    let mut opportunities = Vec::new();

    for alert in alerts {
        let pattern = alert["pattern"].as_str().unwrap_or("");

        match pattern {
            "oracle_divergence" => {
                opportunities.push(analyze_oracle_divergence(alert, &args));
            }
            "stablecoin_depeg" => {
                let mut opp = analyze_depeg(alert, &args, dex.is_some());

                // Execute depeg swap if requested
                if args.execute
                    && let Some((_, router_addr)) = &dex
                    && let Ok(result) =
                        execute_depeg_swap(alert, &args, registry, chain, *router_addr, executor)
                            .await
                {
                    opp["tx_result"] = result;
                }

                opportunities.push(opp);
            }
            "exchange_rate_anomaly" => {
                opportunities.push(analyze_rate_anomaly(alert));
            }
            _ => {}
        }
    }

    let result = serde_json::json!({
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        "chain": chain.name,
        "input_alerts": alerts.len(),
        "opportunities": opportunities,
    });

    output.print(&result)?;
    Ok(())
}

fn analyze_oracle_divergence(alert: &serde_json::Value, args: &ArbArgs) -> serde_json::Value {
    let asset = alert["asset"].as_str().unwrap_or("?");
    let oracle_price = alert["oracle_price"].as_f64().unwrap_or(0.0);
    let dex_price = alert["dex_price"].as_f64().unwrap_or(0.0);
    let deviation = alert["deviation_pct"].as_f64().unwrap_or(0.0);
    let oracle_name = alert["oracle"].as_str().unwrap_or("lending");

    let strategy = if dex_price > oracle_price {
        "borrow_and_sell"
    } else {
        "buy_and_collateralize"
    };

    let gross_profit_pct = deviation;
    let estimated_profit = args.amount * gross_profit_pct / 100.0;
    let net_profit = estimated_profit * (1.0 - args.slippage / 100.0);

    let steps = if dex_price > oracle_price {
        vec![
            format!("1. Supply collateral to {}", oracle_name),
            format!("2. Borrow {} (oracle: ${:.4})", asset, oracle_price),
            format!("3. Sell {} on DEX (spot: ${:.4})", asset, dex_price),
            "4. Repay borrow + pocket difference".to_string(),
        ]
    } else {
        vec![
            format!("1. Buy {} on DEX (spot: ${:.4})", asset, dex_price),
            format!(
                "2. Supply {} as collateral (oracle: ${:.4})",
                asset, oracle_price
            ),
            "3. Borrow stablecoins against inflated collateral".to_string(),
        ]
    };

    serde_json::json!({
        "pattern": "oracle_divergence",
        "asset": asset,
        "strategy": strategy,
        "oracle_price": oracle_price,
        "dex_price": dex_price,
        "deviation_pct": deviation,
        "trade_amount_usd": args.amount,
        "estimated_profit_usd": round2(net_profit),
        "profitable": net_profit > args.min_profit,
        "executable": false,
        "note": "Requires flash loan for atomic execution — manual steps below",
        "steps": steps,
    })
}

fn analyze_depeg(
    alert: &serde_json::Value,
    args: &ArbArgs,
    has_dex: bool,
) -> serde_json::Value {
    let asset = alert["asset"].as_str().unwrap_or("?");
    let price = alert["price"].as_f64().unwrap_or(0.0);

    let discount = 1.0 - price;
    let tokens_bought = if price > 0.0 {
        args.amount / price
    } else {
        0.0
    };
    let profit_on_repeg = tokens_bought - args.amount;

    serde_json::json!({
        "pattern": "stablecoin_depeg",
        "asset": asset,
        "strategy": "buy_depeg",
        "current_price": price,
        "discount_pct": round2(discount * 100.0),
        "trade_amount_usd": args.amount,
        "tokens_received": round2(tokens_bought),
        "profit_on_repeg_usd": round2(profit_on_repeg),
        "profitable": profit_on_repeg > args.min_profit,
        "executable": has_dex,
    })
}

fn analyze_rate_anomaly(alert: &serde_json::Value) -> serde_json::Value {
    let protocol = alert["protocol"].as_str().unwrap_or("?");
    let vtoken = alert["vtoken"].as_str().unwrap_or("?");
    let change = alert["change_pct"].as_f64().unwrap_or(0.0);

    serde_json::json!({
        "pattern": "exchange_rate_anomaly",
        "protocol": protocol,
        "vtoken": vtoken,
        "change_pct": change,
        "strategy": "investigate",
        "executable": false,
        "warning": format!(
            "Possible donation attack on {} {}. Manual investigation required.",
            protocol, vtoken
        ),
    })
}

async fn execute_depeg_swap(
    alert: &serde_json::Value,
    args: &ArbArgs,
    registry: &Registry,
    chain: &ChainConfig,
    router_addr: Address,
    executor: &Executor,
) -> Result<serde_json::Value> {
    let chain_key = chain.name.to_lowercase();
    let asset = alert["asset"].as_str().unwrap_or("USDC");

    let buy_token = registry.resolve_token(&chain_key, asset)?;
    let sell_symbol = if asset == "USDC" { "USDT" } else { "USDC" };
    let sell_token = registry.resolve_token(&chain_key, sell_symbol)?;

    let amount_in =
        U256::from((args.amount * 10f64.powi(sell_token.decimals as i32)) as u128);
    let price = alert["price"].as_f64().unwrap_or(1.0);
    let expected_out = args.amount / price;
    let min_out = U256::from(
        (expected_out * (1.0 - args.slippage / 100.0)
            * 10f64.powi(buy_token.decimals as i32)) as u128,
    );
    let deadline = U256::from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + 300,
    );

    // Use wallet address from env, or zero for simulation
    let to = std::env::var("DEFI_WALLET_ADDRESS")
        .ok()
        .and_then(|s| s.parse::<Address>().ok())
        .unwrap_or(Address::with_last_byte(1));

    let calldata = IUniV2Router::swapExactTokensForTokensCall {
        amountIn: amount_in,
        amountOutMin: min_out,
        path: vec![sell_token.address, buy_token.address],
        to,
        deadline,
    }
    .abi_encode();

    let tx = DeFiTx {
        description: format!("Depeg arb: {} {} → {}", args.amount, sell_symbol, asset),
        to: router_addr,
        data: calldata.into(),
        value: U256::ZERO,
        gas_estimate: None,
    };

    let result = executor.execute(tx).await?;
    Ok(serde_json::json!({
        "status": format!("{:?}", result.status),
        "gas_used": result.gas_used,
        "tx_hash": result.tx_hash,
        "details": result.details,
    }))
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
