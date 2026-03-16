use alloy::primitives::{Address, Bytes, U256};
use alloy::sol_types::SolCall;
use clap::Args;
use std::collections::HashMap;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct ScanArgs {
    /// Patterns to scan (comma-separated: oracle,stable,exchange_rate)
    #[arg(long, default_value = "oracle,stable,exchange_rate")]
    pub patterns: String,

    /// Oracle divergence threshold in percent
    #[arg(long, default_value = "5.0")]
    pub oracle_threshold: f64,

    /// Stablecoin depeg threshold (minimum acceptable price)
    #[arg(long, default_value = "0.98")]
    pub stable_threshold: f64,

    /// Exchange rate change threshold in percent
    #[arg(long, default_value = "5.0")]
    pub rate_threshold: f64,

    /// Polling interval in seconds
    #[arg(long, default_value = "30")]
    pub interval: u64,

    /// Single check then exit
    #[arg(long)]
    pub once: bool,
}

alloy::sol! {
    interface IAaveOracle {
        function getAssetPrice(address asset) external view returns (uint256);
    }

    interface IUniV2Router {
        function getAmountsOut(uint256 amountIn, address[] calldata path)
            external view returns (uint256[] memory);
    }

    interface IVToken {
        function exchangeRateStored() external view returns (uint256);
    }
}

const STABLECOINS: &[&str] = &["USDC", "USDT", "DAI", "USDT0"];

pub async fn run(
    args: ScanArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let rpc = chain.effective_rpc_url();
    let chain_key = chain.name.to_lowercase();
    let patterns: Vec<&str> = args.patterns.split(',').map(str::trim).collect();
    let do_oracle = patterns.contains(&"oracle");
    let do_stable = patterns.contains(&"stable");
    let do_rate = patterns.contains(&"exchange_rate");

    // === Discover chain resources ===

    let all_tokens = registry.tokens.get(&chain_key).cloned().unwrap_or_default();
    let wrapped_native = chain.wrapped_native_address();

    // Quote stablecoin for DEX price reference
    let quote_stable = registry
        .resolve_token(&chain_key, "USDT")
        .or_else(|_| registry.resolve_token(&chain_key, "USDC"))
        .or_else(|_| registry.resolve_token(&chain_key, "USDT0"))?
        .clone();

    // Non-stable, non-zero-address tokens for P1
    let scan_tokens: Vec<_> = all_tokens
        .iter()
        .filter(|t| t.address != Address::ZERO)
        .filter(|t| !STABLECOINS.contains(&t.symbol.as_str()))
        .collect();

    // Aave V3 oracles
    let oracles: Vec<(String, Address)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .filter_map(|p| p.contracts.get("oracle").map(|a| (p.name.clone(), *a)))
        .collect();

    // First uniswap_v2 compatible DEX router (e.g. PancakeSwap V2)
    let dex: Option<(String, Address)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Dex && p.interface == "uniswap_v2")
        .filter_map(|p| p.contracts.get("router").map(|a| (p.name.clone(), *a)))
        .next();

    // Compound V2 forks for exchange rate monitoring (Venus, Sonne)
    let compound_forks: Vec<(String, Vec<(String, Address)>)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "compound_v2")
        .map(|p| {
            let vtokens: Vec<_> = p
                .contracts
                .iter()
                .filter(|(k, _)| k.starts_with('v'))
                .map(|(k, a)| (k.clone(), *a))
                .collect();
            (p.name.clone(), vtokens)
        })
        .collect();

    // Stablecoins for P2 cross-peg check
    let usdc = registry.resolve_token(&chain_key, "USDC").ok().cloned();
    let usdt = registry.resolve_token(&chain_key, "USDT").ok().cloned();

    // Track previous exchange rates for change detection across iterations
    let mut prev_rates: HashMap<String, f64> = HashMap::new();

    loop {
        let start = std::time::Instant::now();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();

        // Track what each call index maps to
        enum CallType {
            OraclePrice { oracle: String, token: String },
            DexPrice { token: String, out_decimals: u8 },
            StablePeg { from: String, to: String, out_decimals: u8 },
            ExchangeRate { protocol: String, vtoken: String },
        }
        let mut call_types: Vec<CallType> = Vec::new();

        // === P1: Oracle + DEX price calls ===
        if do_oracle {
            for (oracle_name, oracle_addr) in &oracles {
                for token in &scan_tokens {
                    call_types.push(CallType::OraclePrice {
                        oracle: oracle_name.clone(),
                        token: token.symbol.clone(),
                    });
                    calls.push((
                        *oracle_addr,
                        IAaveOracle::getAssetPriceCall {
                            asset: token.address,
                        }
                        .abi_encode(),
                    ));
                }
            }

            if let Some((_, router)) = &dex {
                for token in &scan_tokens {
                    let amount_in = U256::from(10u64).pow(U256::from(token.decimals));
                    let path = if token.address == wrapped_native {
                        vec![token.address, quote_stable.address]
                    } else {
                        vec![token.address, wrapped_native, quote_stable.address]
                    };
                    call_types.push(CallType::DexPrice {
                        token: token.symbol.clone(),
                        out_decimals: quote_stable.decimals,
                    });
                    calls.push((
                        *router,
                        IUniV2Router::getAmountsOutCall {
                            amountIn: amount_in,
                            path,
                        }
                        .abi_encode(),
                    ));
                }
            }
        }

        // === P2: Stablecoin cross-price calls ===
        if do_stable
            && let (Some(uc), Some(ut), Some((_, router))) = (&usdc, &usdt, &dex)
        {
            // USDC → USDT
            call_types.push(CallType::StablePeg {
                from: "USDC".into(),
                to: "USDT".into(),
                out_decimals: ut.decimals,
            });
            calls.push((
                *router,
                IUniV2Router::getAmountsOutCall {
                    amountIn: U256::from(10u64).pow(U256::from(uc.decimals)),
                    path: vec![uc.address, ut.address],
                }
                .abi_encode(),
            ));
            // USDT → USDC
            call_types.push(CallType::StablePeg {
                from: "USDT".into(),
                to: "USDC".into(),
                out_decimals: uc.decimals,
            });
            calls.push((
                *router,
                IUniV2Router::getAmountsOutCall {
                    amountIn: U256::from(10u64).pow(U256::from(ut.decimals)),
                    path: vec![ut.address, uc.address],
                }
                .abi_encode(),
            ));
        }

        // === P4: Exchange rate calls ===
        if do_rate {
            for (proto_name, vtokens) in &compound_forks {
                for (vname, vaddr) in vtokens {
                    call_types.push(CallType::ExchangeRate {
                        protocol: proto_name.clone(),
                        vtoken: vname.clone(),
                    });
                    calls.push((*vaddr, IVToken::exchangeRateStoredCall {}.abi_encode()));
                }
            }
        }

        if calls.is_empty() {
            return Err(DefiError::Unsupported(format!(
                "No scannable resources found on {}",
                chain.name
            )));
        }

        // === Execute single multicall ===
        let results = multicall_read(&rpc, calls).await?;
        let scan_ms = start.elapsed().as_millis();

        // === Parse results ===
        let mut alerts: Vec<serde_json::Value> = Vec::new();
        let mut oracle_by_token: HashMap<String, Vec<(String, f64)>> = HashMap::new();
        let mut dex_by_token: HashMap<String, f64> = HashMap::new();
        let mut oracle_data = serde_json::Map::new();
        let mut dex_data = serde_json::Map::new();
        let mut stable_data = serde_json::Map::new();
        let mut rate_data = serde_json::Map::new();

        for (i, ct) in call_types.iter().enumerate() {
            match ct {
                CallType::OraclePrice { oracle, token } => {
                    let price = parse_u256_f64(&results[i], 8);
                    if price > 0.0 {
                        oracle_by_token
                            .entry(token.clone())
                            .or_default()
                            .push((oracle.clone(), price));
                        oracle_data.insert(
                            format!("{}/{}", oracle, token),
                            serde_json::json!(round4(price)),
                        );
                    }
                }
                CallType::DexPrice {
                    token,
                    out_decimals,
                } => {
                    let price = parse_amounts_out_last(&results[i], *out_decimals);
                    if price > 0.0 {
                        dex_by_token.insert(token.clone(), price);
                        dex_data
                            .insert(token.clone(), serde_json::json!(round4(price)));
                    }
                }
                CallType::StablePeg {
                    from,
                    to,
                    out_decimals,
                } => {
                    let price = parse_amounts_out_last(&results[i], *out_decimals);
                    let pair = format!("{}/{}", from, to);
                    stable_data.insert(pair.clone(), serde_json::json!(round4(price)));

                    if price > 0.0 && price < args.stable_threshold {
                        let severity = if price < 0.95 { "critical" } else { "high" };
                        alerts.push(serde_json::json!({
                            "pattern": "stablecoin_depeg",
                            "severity": severity,
                            "asset": from,
                            "pair": pair,
                            "price": round4(price),
                            "threshold": args.stable_threshold,
                            "action": format!("buy {} at ${:.4}, wait for repeg", from, price),
                        }));
                    }
                }
                CallType::ExchangeRate { protocol, vtoken } => {
                    let rate = parse_u256_f64(&results[i], 18);
                    let key = format!("{}/{}", protocol, vtoken);
                    rate_data.insert(key.clone(), serde_json::json!(round6(rate)));

                    if rate > 0.0 {
                        if let Some(&prev) = prev_rates.get(&key) {
                            let change = ((rate - prev) / prev * 100.0).abs();
                            if change > args.rate_threshold {
                                let severity = if change > 50.0 {
                                    "critical"
                                } else if change > 20.0 {
                                    "high"
                                } else {
                                    "medium"
                                };
                                alerts.push(serde_json::json!({
                                    "pattern": "exchange_rate_anomaly",
                                    "severity": severity,
                                    "protocol": protocol,
                                    "vtoken": vtoken,
                                    "prev_rate": round6(prev),
                                    "curr_rate": round6(rate),
                                    "change_pct": round2(change),
                                    "action": format!(
                                        "possible donation attack on {} {}", protocol, vtoken
                                    ),
                                }));
                            }
                        }
                        prev_rates.insert(key, rate);
                    }
                }
            }
        }

        // P1: Compare oracle vs DEX and generate alerts
        if do_oracle {
            for (token, oracle_entries) in &oracle_by_token {
                if let Some(&dex_price) = dex_by_token.get(token) {
                    for (oracle_name, oracle_price) in oracle_entries {
                        let deviation =
                            (dex_price - oracle_price).abs() / oracle_price * 100.0;
                        if deviation > args.oracle_threshold {
                            let severity = if deviation > 100.0 {
                                "critical"
                            } else if deviation > 20.0 {
                                "high"
                            } else {
                                "medium"
                            };
                            let action = if dex_price > *oracle_price {
                                format!(
                                    "borrow {} from {}, sell on DEX",
                                    token, oracle_name
                                )
                            } else {
                                format!(
                                    "buy {} on DEX, use as collateral on {}",
                                    token, oracle_name
                                )
                            };
                            alerts.push(serde_json::json!({
                                "pattern": "oracle_divergence",
                                "severity": severity,
                                "asset": token,
                                "oracle": oracle_name,
                                "oracle_price": round4(*oracle_price),
                                "dex_price": round4(dex_price),
                                "deviation_pct": round2(deviation),
                                "action": action,
                            }));
                        }
                    }
                }
            }
        }

        // === Build output ===
        let mut data = serde_json::Map::new();
        if !oracle_data.is_empty() {
            data.insert(
                "oracle_prices".into(),
                serde_json::Value::Object(oracle_data),
            );
        }
        if !dex_data.is_empty() {
            data.insert(
                "dex_prices".into(),
                serde_json::Value::Object(dex_data),
            );
        }
        if !stable_data.is_empty() {
            data.insert(
                "stablecoin_pegs".into(),
                serde_json::Value::Object(stable_data),
            );
        }
        if !rate_data.is_empty() {
            data.insert(
                "exchange_rates".into(),
                serde_json::Value::Object(rate_data),
            );
        }

        let result = serde_json::json!({
            "timestamp": timestamp,
            "chain": chain.name,
            "scan_duration_ms": scan_ms,
            "patterns": &args.patterns,
            "alert_count": alerts.len(),
            "alerts": alerts,
            "data": data,
        });

        if !alerts.is_empty() {
            for alert in &alerts {
                eprintln!(
                    "ALERT [{}]: {} — {}",
                    alert["severity"].as_str().unwrap_or("?"),
                    alert["pattern"].as_str().unwrap_or("?"),
                    alert["action"].as_str().unwrap_or("?"),
                );
            }
        }

        output.print(&result)?;

        if args.once {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(args.interval)).await;
    }

    Ok(())
}

/// Parse raw U256 from multicall result with given decimal precision
fn parse_u256_f64(data: &Option<Bytes>, decimals: u8) -> f64 {
    match data {
        Some(b) if b.len() >= 32 => {
            U256::from_be_slice(&b[..32]).to::<u128>() as f64 / 10f64.powi(decimals as i32)
        }
        _ => 0.0,
    }
}

/// Parse the last element of a getAmountsOut return array
fn parse_amounts_out_last(data: &Option<Bytes>, out_decimals: u8) -> f64 {
    match data {
        Some(b) if b.len() >= 128 => {
            let num = U256::from_be_slice(&b[32..64]).to::<usize>();
            if num > 0 {
                let off = 64 + (num - 1) * 32;
                if b.len() >= off + 32 {
                    U256::from_be_slice(&b[off..off + 32]).to::<u128>() as f64
                        / 10f64.powi(out_decimals as i32)
                } else {
                    0.0
                }
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round4(x: f64) -> f64 {
    (x * 10000.0).round() / 10000.0
}
fn round6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}
