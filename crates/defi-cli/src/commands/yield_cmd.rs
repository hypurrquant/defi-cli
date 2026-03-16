use alloy::primitives::Address;
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};
use defi_core::types::LendingRates;

use crate::output::OutputMode;

#[derive(Args)]
pub struct YieldArgs {
    #[command(subcommand)]
    pub command: YieldCommand,
}

#[derive(Subcommand)]
pub enum YieldCommand {
    /// Compare lending rates across protocols for a given asset
    Compare {
        /// Asset symbol or address to compare yields for (e.g. USDC, WHYPE)
        #[arg(long)]
        asset: String,
    },
    /// Suggest optimal yield strategy for an asset
    Optimize {
        /// Asset symbol or address to optimize (e.g. USDC, WHYPE)
        #[arg(long)]
        asset: String,
        /// Strategy type: best-supply, leverage-loop, auto
        #[arg(long)]
        strategy: Option<String>,
        /// Amount to optimize (for diversification recommendations)
        #[arg(long)]
        amount: Option<f64>,
    },
}

fn resolve_asset(registry: &Registry, chain: &str, asset: &str) -> Result<Address> {
    if let Ok(addr) = asset.parse::<Address>() {
        return Ok(addr);
    }
    Ok(registry.resolve_token(chain, asset)?.address)
}

/// Collect lending rates across all lending protocols that support RPC reads.
/// Inserts a 500ms sleep between RPC calls to avoid rate limiting.
async fn collect_lending_rates(
    registry: &Registry,
    chain: &ChainConfig,
    asset_addr: Address,
) -> Vec<LendingRates> {
    let lending_protocols = registry.get_protocols_by_category(ProtocolCategory::Lending);
    let mut results = Vec::new();
    let mut first = true;

    for entry in &lending_protocols {
        // Only query protocols with aave_v3 interface (the ones that support RPC-based get_rates)
        if entry.interface == "aave_v3" || entry.interface == "aave_v3_isolated" {
            // Sleep between RPC calls to avoid rate limiting (skip before first call)
            if !first {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            first = false;

            let rpc = chain.effective_rpc_url();
            let entry_c = (*entry).clone();
            match defi_core::provider::with_retry(2, 2000, || {
                let l = defi_protocols::factory::create_lending_with_rpc(&entry_c, Some(&rpc));
                async move { l?.get_rates(asset_addr).await }
            })
            .await
            {
                Ok(rates) => results.push(rates),
                Err(e) => {
                    eprintln!("Warning: {} rates unavailable: {}", entry.name, e);
                }
            }
        }
    }

    results
}

/// Collect yield opportunities from all sources (lending + vaults + morpho)
async fn collect_all_yields(
    registry: &Registry,
    chain: &ChainConfig,
    asset: &str,
    asset_addr: Address,
) -> Vec<serde_json::Value> {
    let mut opportunities = Vec::new();

    // 1. Lending rates (Aave V3 forks)
    let lending_rates = collect_lending_rates(registry, chain, asset_addr).await;
    for r in &lending_rates {
        if r.supply_apy > 0.0 {
            opportunities.push(serde_json::json!({
                "protocol": r.protocol,
                "type": "lending_supply",
                "asset": asset,
                "apy": r.supply_apy,
                "utilization": r.utilization,
            }));
        }
    }

    // 2. Morpho Blue rates
    let morpho_protocols = registry.get_protocols_by_category(ProtocolCategory::Lending);
    for entry in &morpho_protocols {
        if entry.interface == "morpho_blue" {
            let rpc = chain.effective_rpc_url();
            let entry_c = (*entry).clone();
            if let Ok(lending) =
                defi_protocols::factory::create_lending_with_rpc(&entry_c, Some(&rpc))
                && let Ok(rates) = lending.get_rates(asset_addr).await
                && rates.supply_apy > 0.0
            {
                opportunities.push(serde_json::json!({
                    "protocol": rates.protocol,
                    "type": "morpho_vault",
                    "asset": asset,
                    "apy": rates.supply_apy,
                    "utilization": rates.utilization,
                }));
            }
        }
    }

    // 3. Vault APYs (ERC-4626 — estimate from lending rates of underlying)
    let vault_protocols = registry.get_protocols_by_category(ProtocolCategory::Vault);
    for entry in &vault_protocols {
        if entry.interface == "erc4626" {
            let rpc = chain.effective_rpc_url();
            let entry_c = (*entry).clone();
            if let Ok(vault) = defi_protocols::factory::create_vault_with_rpc(&entry_c, Some(&rpc))
                && let Ok(info) = vault.get_vault_info().await
            {
                opportunities.push(serde_json::json!({
                    "protocol": info.protocol,
                    "type": "vault",
                    "asset": asset,
                    "apy": info.apy.unwrap_or(0.0),
                    "total_assets": format!("{}", info.total_assets),
                }));
            }
        }
    }

    // Sort by APY descending
    opportunities.sort_by(|a, b| {
        let a_apy = a["apy"].as_f64().unwrap_or(0.0);
        let b_apy = b["apy"].as_f64().unwrap_or(0.0);
        b_apy
            .partial_cmp(&a_apy)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    opportunities
}

pub async fn run(
    args: YieldArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();

    match args.command {
        YieldCommand::Compare { asset } => {
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let mut results = collect_lending_rates(registry, chain, asset_addr).await;

            if results.is_empty() {
                return Err(DefiError::Internal(format!(
                    "No lending rate data available for asset '{}'",
                    asset
                )));
            }

            // Sort by supply APY descending
            results.sort_by(|a, b| {
                b.supply_apy
                    .partial_cmp(&a.supply_apy)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let best_supply = results.first().map(|r| r.protocol.clone());
            let best_borrow = results
                .iter()
                .min_by(|a, b| {
                    a.borrow_variable_apy
                        .partial_cmp(&b.borrow_variable_apy)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|r| r.protocol.clone());

            output.print(&serde_json::json!({
                "asset": asset,
                "rates": results,
                "best_supply": best_supply,
                "best_borrow": best_borrow,
            }))?;
        }

        YieldCommand::Optimize {
            asset,
            strategy,
            amount,
        } => {
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let strategy_name = strategy.as_deref().unwrap_or("auto");

            match strategy_name {
                "auto" => {
                    let opportunities =
                        collect_all_yields(registry, chain, &asset, asset_addr).await;

                    if opportunities.is_empty() {
                        return Err(DefiError::Internal(format!(
                            "No yield opportunities found for '{}'",
                            asset
                        )));
                    }

                    // Build allocation recommendation
                    let allocations = if let Some(total) = amount {
                        // Diversify: 60% top, 30% second, 10% third
                        let weights = [0.6, 0.3, 0.1];
                        opportunities
                            .iter()
                            .take(weights.len())
                            .enumerate()
                            .map(|(i, opp)| {
                                let pct = weights[i] * 100.0;
                                let amt = total * weights[i];
                                serde_json::json!({
                                    "protocol": opp["protocol"],
                                    "type": opp["type"],
                                    "apy": opp["apy"],
                                    "allocation_pct": pct,
                                    "amount": format!("{:.2}", amt),
                                })
                            })
                            .collect::<Vec<_>>()
                    } else {
                        vec![]
                    };

                    let best = &opportunities[0];
                    let weighted_apy = if !allocations.is_empty() {
                        let weights = [0.6, 0.3, 0.1];
                        opportunities
                            .iter()
                            .take(weights.len())
                            .enumerate()
                            .map(|(i, o)| o["apy"].as_f64().unwrap_or(0.0) * weights[i])
                            .sum::<f64>()
                    } else {
                        best["apy"].as_f64().unwrap_or(0.0)
                    };

                    output.print(&serde_json::json!({
                        "strategy": "auto",
                        "asset": asset,
                        "best_protocol": best["protocol"],
                        "best_apy": best["apy"],
                        "weighted_apy": weighted_apy,
                        "opportunities": opportunities,
                        "allocation": allocations,
                    }))?;
                }
                "best-supply" => {
                    let mut results = collect_lending_rates(registry, chain, asset_addr).await;

                    if results.is_empty() {
                        return Err(DefiError::Internal(format!(
                            "No lending rate data available for asset '{}'",
                            asset
                        )));
                    }

                    // Sort by supply APY descending
                    results.sort_by(|a, b| {
                        b.supply_apy
                            .partial_cmp(&a.supply_apy)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    });

                    let best = &results[0];
                    let recommendations: Vec<serde_json::Value> = results
                        .iter()
                        .map(|r| {
                            serde_json::json!({
                                "protocol": r.protocol,
                                "supply_apy": r.supply_apy,
                                "action": "supply",
                            })
                        })
                        .collect();

                    output.print(&serde_json::json!({
                        "strategy": "best-supply",
                        "asset": asset,
                        "recommendation": format!(
                            "Supply {} on {} for {:.2}% APY",
                            asset, best.protocol, best.supply_apy * 100.0
                        ),
                        "best_protocol": best.protocol,
                        "best_supply_apy": best.supply_apy,
                        "all_options": recommendations,
                    }))?;
                }

                "leverage-loop" => {
                    let results = collect_lending_rates(registry, chain, asset_addr).await;

                    if results.is_empty() {
                        return Err(DefiError::Internal(format!(
                            "No lending rate data available for asset '{}'",
                            asset
                        )));
                    }

                    // Find protocols where supply rate > borrow rate * 0.8
                    // (i.e. the spread is favorable for a leverage loop)
                    let mut loop_candidates: Vec<serde_json::Value> = Vec::new();

                    for r in &results {
                        let threshold = r.borrow_variable_apy * 0.8;
                        if r.supply_apy > threshold && r.borrow_variable_apy > 0.0 {
                            // Calculate effective APY with N loops (assuming 80% LTV per loop)
                            let ltv = 0.8_f64;
                            let loops = 5u32;
                            let mut effective_supply_apy = 0.0_f64;
                            let mut effective_borrow_apy = 0.0_f64;
                            let mut leverage = 1.0_f64;

                            for _ in 0..loops {
                                effective_supply_apy += r.supply_apy * leverage;
                                effective_borrow_apy += r.borrow_variable_apy * leverage * ltv;
                                leverage *= ltv;
                            }

                            let net_apy = effective_supply_apy - effective_borrow_apy;

                            loop_candidates.push(serde_json::json!({
                                "protocol": r.protocol,
                                "supply_apy": r.supply_apy,
                                "borrow_variable_apy": r.borrow_variable_apy,
                                "loops": loops,
                                "ltv": ltv,
                                "effective_supply_apy": effective_supply_apy,
                                "effective_borrow_cost": effective_borrow_apy,
                                "net_apy": net_apy,
                            }));
                        }
                    }

                    // Sort by net APY descending
                    loop_candidates.sort_by(|a, b| {
                        let a_net = a["net_apy"].as_f64().unwrap_or(0.0);
                        let b_net = b["net_apy"].as_f64().unwrap_or(0.0);
                        b_net
                            .partial_cmp(&a_net)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    });

                    let recommendation = if let Some(best) = loop_candidates.first() {
                        format!(
                            "Leverage loop {} on {} — net APY: {:.2}% ({} loops at {:.0}% LTV)",
                            asset,
                            best["protocol"].as_str().unwrap_or("unknown"),
                            best["net_apy"].as_f64().unwrap_or(0.0) * 100.0,
                            best["loops"].as_u64().unwrap_or(0),
                            best["ltv"].as_f64().unwrap_or(0.0) * 100.0,
                        )
                    } else {
                        format!(
                            "No favorable leverage loop found for {} — supply rate too low relative to borrow rate",
                            asset
                        )
                    };

                    output.print(&serde_json::json!({
                        "strategy": "leverage-loop",
                        "asset": asset,
                        "recommendation": recommendation,
                        "candidates": loop_candidates,
                    }))?;
                }

                other => {
                    return Err(DefiError::InvalidParam(format!(
                        "Unknown strategy '{}'. Supported: best-supply, leverage-loop",
                        other
                    )));
                }
            }
        }
    }

    Ok(())
}
