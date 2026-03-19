use clap::Args;
use std::process::Command;

use defi_core::error::Result;
use defi_core::registry::{ProtocolCategory, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct CompareArgs {
    /// Asset to compare yields for (e.g., USDC, ETH, BTC)
    #[arg(long, default_value = "USDC")]
    pub asset: String,

    /// Include perp funding rates from perp-cli
    #[arg(long, default_value_t = true)]
    pub perps: bool,

    /// Include lending rates from defi-cli
    #[arg(long, default_value_t = true)]
    pub lending: bool,

    /// Minimum absolute APY to show
    #[arg(long, default_value = "1.0")]
    pub min_apy: f64,
}

pub async fn run(args: CompareArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let start = std::time::Instant::now();
    let mut opportunities: Vec<serde_json::Value> = Vec::new();

    // 1. Collect perp funding rates (call perp-cli)
    if args.perps
        && let Ok(perp_data) = fetch_perp_rates().await
    {
        for opp in perp_data {
            let apy = opp["apy"].as_f64().unwrap_or(0.0);
            if apy.abs() >= args.min_apy {
                opportunities.push(opp);
            }
        }
    }

    // 2. Collect lending rates across all chains (parallel)
    if args.lending {
        let lending_data = fetch_lending_rates(registry, &args.asset).await;
        for opp in lending_data {
            let apy = opp["apy"].as_f64().unwrap_or(0.0);
            if apy.abs() >= args.min_apy {
                opportunities.push(opp);
            }
        }
    }

    // Sort by absolute APY descending
    opportunities.sort_by(|a, b| {
        b["apy"]
            .as_f64()
            .unwrap_or(0.0)
            .abs()
            .partial_cmp(&a["apy"].as_f64().unwrap_or(0.0).abs())
            .unwrap()
    });

    let scan_ms = start.elapsed().as_millis();

    let result = serde_json::json!({
        "asset": args.asset,
        "scan_duration_ms": scan_ms,
        "total_opportunities": opportunities.len(),
        "opportunities": opportunities,
    });

    output.print(&result)?;
    Ok(())
}

/// Fetch perp funding rates by calling `perp --json arb scan --rates`
async fn fetch_perp_rates() -> std::result::Result<Vec<serde_json::Value>, String> {
    let output = Command::new("perp")
        .args(["--json", "arb", "scan", "--rates"])
        .output()
        .map_err(|e| format!("perp-cli not found: {e}"))?;

    if !output.status.success() {
        return Err("perp arb scan failed".into());
    }

    let data: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("perp JSON parse: {e}"))?;

    let symbols = data
        .get("data")
        .and_then(|d| d.get("symbols"))
        .or_else(|| data.get("symbols"))
        .and_then(|s| s.as_array());

    let mut results = Vec::new();

    if let Some(symbols) = symbols {
        for sym in symbols {
            let symbol = sym["symbol"].as_str().unwrap_or("?");
            let max_spread = sym["maxSpreadAnnual"].as_f64().unwrap_or(0.0);
            let long_ex = sym["longExchange"].as_str().unwrap_or("?");
            let short_ex = sym["shortExchange"].as_str().unwrap_or("?");

            if max_spread.abs() > 0.0 {
                results.push(serde_json::json!({
                    "type": "perp_funding",
                    "asset": symbol,
                    "apy": round2(max_spread),
                    "detail": format!("long {} / short {}", long_ex, short_ex),
                    "risk": if max_spread.abs() > 50.0 { "high" } else if max_spread.abs() > 20.0 { "medium" } else { "low" },
                    "source": "perp-cli",
                }));
            }

            // Also add individual exchange rates
            if let Some(rates) = sym["rates"].as_array() {
                for rate in rates {
                    let exchange = rate["exchange"].as_str().unwrap_or("?");
                    let annual = rate["annualizedPct"].as_f64().unwrap_or(0.0);
                    if annual.abs() > 1.0 {
                        results.push(serde_json::json!({
                            "type": "perp_rate",
                            "asset": symbol,
                            "apy": round2(annual),
                            "detail": exchange,
                            "risk": if annual.abs() > 50.0 { "high" } else if annual.abs() > 20.0 { "medium" } else { "low" },
                            "source": "perp-cli",
                        }));
                    }
                }
            }
        }
    }

    Ok(results)
}

/// Fetch lending rates across all chains
async fn fetch_lending_rates(registry: &Registry, asset: &str) -> Vec<serde_json::Value> {
    let chain_keys: Vec<String> = registry.chains.keys().cloned().collect();
    let mut join_set = tokio::task::JoinSet::new();

    for ck in &chain_keys {
        let chain = match registry.get_chain(ck) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let asset_addr = match registry.resolve_token(ck, asset) {
            Ok(t) => t.address,
            Err(_) => continue,
        };
        let protos: Vec<_> = registry
            .get_protocols_for_chain(ck)
            .iter()
            .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
            .cloned()
            .cloned()
            .collect();

        if protos.is_empty() {
            continue;
        }

        let chain_name = chain.name.clone();
        let rpc = chain.effective_rpc_url();
        let asset_sym = asset.to_string();

        join_set.spawn(async move {
            let mut rates = Vec::new();
            for proto in &protos {
                if let Ok(lending) =
                    defi_protocols::factory::create_lending_with_rpc(proto, Some(&rpc))
                    && let Ok(r) = lending.get_rates(asset_addr).await
                    && r.supply_apy > 0.0
                {
                    rates.push(serde_json::json!({
                        "type": "lending_supply",
                        "asset": asset_sym,
                        "apy": round2(r.supply_apy),
                        "detail": format!("{} ({})", r.protocol, chain_name),
                        "risk": "low",
                        "source": "defi-cli",
                    }));
                }
            }
            rates
        });
    }

    let mut all = Vec::new();
    while let Some(result) = join_set.join_next().await {
        if let Ok(rates) = result {
            all.extend(rates);
        }
    }
    all
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
