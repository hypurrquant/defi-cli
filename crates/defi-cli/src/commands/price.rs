use alloy::primitives::Address;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};
use defi_core::types::PriceData;

use crate::output::OutputMode;

#[derive(Args)]
pub struct PriceArgs {
    /// Asset symbol (e.g. WHYPE) or address
    #[arg(long)]
    pub asset: String,

    /// Price source filter: all, oracle, dex
    #[arg(long, default_value = "all")]
    pub source: String,
}

#[derive(serde::Serialize)]
struct PriceReport {
    asset: String,
    asset_address: String,
    prices: Vec<PriceEntry>,
    max_spread_pct: f64,
    oracle_vs_dex_spread_pct: f64,
}

#[derive(serde::Serialize)]
struct PriceEntry {
    source: String,
    source_type: String,
    price: f64,
}

fn resolve_asset(registry: &Registry, chain: &str, asset: &str) -> Result<(Address, String, u8)> {
    if let Ok(addr) = asset.parse::<Address>() {
        return Ok((addr, asset.to_string(), 18));
    }
    let token = registry.resolve_token(chain, asset)?;
    Ok((token.address, token.symbol.clone(), token.decimals))
}

pub async fn run(
    args: PriceArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();
    let rpc_url = chain.effective_rpc_url();
    let (asset_addr, asset_symbol, _asset_decimals) =
        resolve_asset(registry, &chain_key, &args.asset)?;

    let fetch_oracle = args.source == "all" || args.source == "oracle";
    let fetch_dex = args.source == "all" || args.source == "dex";

    let mut all_prices: Vec<PriceData> = Vec::new();

    // === Oracle prices from lending protocols (Aave V3 forks) ===
    if fetch_oracle {
        let lending_protocols = registry.get_protocols_by_category(ProtocolCategory::Lending);
        for entry in &lending_protocols {
            match defi_protocols::factory::create_oracle_from_lending(entry, &rpc_url) {
                Ok(oracle) => match oracle.get_price(asset_addr).await {
                    Ok(price) => all_prices.push(price),
                    Err(e) => {
                        eprintln!("[{}] oracle price failed: {e}", entry.name);
                    }
                },
                Err(_) => continue, // Interface doesn't support oracle
            }
        }

        // === Oracle prices from CDP protocols (Felix) ===
        // Felix PriceFeed only returns WHYPE collateral price.
        // Only query it when the asset is WHYPE or a WHYPE-related token.
        let whype_addr: Address = "0x5555555555555555555555555555555555555555"
            .parse()
            .unwrap();
        let is_whype = asset_addr == whype_addr
            || asset_symbol.eq_ignore_ascii_case("WHYPE")
            || asset_symbol.eq_ignore_ascii_case("HYPE");

        if is_whype {
            let cdp_protocols = registry.get_protocols_by_category(ProtocolCategory::Cdp);
            for entry in &cdp_protocols {
                match defi_protocols::factory::create_oracle_from_cdp(entry, asset_addr, &rpc_url) {
                    Ok(oracle) => match oracle.get_price(asset_addr).await {
                        Ok(price) => all_prices.push(price),
                        Err(e) => {
                            eprintln!("[{}] oracle price failed: {e}", entry.name);
                        }
                    },
                    Err(_) => continue,
                }
            }
        }
    }

    // === DEX spot prices ===
    if fetch_dex {
        // Resolve USDC as the quote token
        let usdc = registry.resolve_token(&chain_key, "USDC");
        if let Ok(usdc_token) = usdc {
            let usdc_addr = usdc_token.address;
            let usdc_decimals = usdc_token.decimals;

            let dex_protocols = registry.get_protocols_by_category(ProtocolCategory::Dex);
            for entry in &dex_protocols {
                match defi_protocols::factory::create_dex_with_rpc(entry, Some(&rpc_url)) {
                    Ok(dex) => {
                        match defi_protocols::dex::DexSpotPrice::get_price(
                            dex.as_ref(),
                            asset_addr,
                            _asset_decimals,
                            usdc_addr,
                            usdc_decimals,
                        )
                        .await
                        {
                            Ok(price) => all_prices.push(price),
                            Err(e) => {
                                eprintln!("[{}] dex price failed: {e}", entry.name);
                            }
                        }
                    }
                    Err(_) => continue,
                }
            }
        } else {
            eprintln!("USDC token not found in registry — skipping DEX prices");
        }
    }

    if all_prices.is_empty() {
        return Err(DefiError::Internal(
            "No prices could be fetched from any source".to_string(),
        ));
    }

    // Compute spreads
    let prices_f64: Vec<f64> = all_prices.iter().map(|p| p.price_f64).collect();
    let max_price = prices_f64.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let min_price = prices_f64.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_spread_pct = if min_price > 0.0 {
        (max_price - min_price) / min_price * 100.0
    } else {
        0.0
    };

    // Oracle vs DEX spread
    let oracle_prices: Vec<f64> = all_prices
        .iter()
        .filter(|p| p.source_type == "oracle")
        .map(|p| p.price_f64)
        .collect();
    let dex_prices: Vec<f64> = all_prices
        .iter()
        .filter(|p| p.source_type == "dex_spot")
        .map(|p| p.price_f64)
        .collect();

    let oracle_vs_dex_spread_pct = if !oracle_prices.is_empty() && !dex_prices.is_empty() {
        let avg_oracle = oracle_prices.iter().sum::<f64>() / oracle_prices.len() as f64;
        let avg_dex = dex_prices.iter().sum::<f64>() / dex_prices.len() as f64;
        let min_avg = avg_oracle.min(avg_dex);
        if min_avg > 0.0 {
            (avg_oracle - avg_dex).abs() / min_avg * 100.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    let report = PriceReport {
        asset: asset_symbol,
        asset_address: asset_addr.to_string(),
        prices: all_prices
            .iter()
            .map(|p| PriceEntry {
                source: p.source.clone(),
                source_type: p.source_type.clone(),
                price: (p.price_f64 * 100.0).round() / 100.0,
            })
            .collect(),
        max_spread_pct: (max_spread_pct * 100.0).round() / 100.0,
        oracle_vs_dex_spread_pct: (oracle_vs_dex_spread_pct * 100.0).round() / 100.0,
    };

    output.print(&report)?;
    Ok(())
}
