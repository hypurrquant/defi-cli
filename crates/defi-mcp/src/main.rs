use std::io::{BufRead, Write};

use alloy::primitives::{Address, Bytes, U256};
use alloy::sol_types::SolCall;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tracing::info;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ProtocolCategory, Registry};
use defi_core::types::*;

// === JSON-RPC types ===

#[derive(Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

impl JsonRpcResponse {
    fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }
    fn error(id: Option<Value>, code: i32, message: String) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError { code, message }),
        }
    }
}

// === sol! interfaces for on-chain reads ===

alloy::sol! {
    interface IERC20 { function balanceOf(address owner) external view returns (uint256); }
    interface IPool {
        function getUserAccountData(address user) external view returns (
            uint256, uint256, uint256, uint256, uint256, uint256
        );
    }
    interface IAaveOracle { function getAssetPrice(address asset) external view returns (uint256); }
    interface IUniV2Router {
        function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    }
    interface IVToken { function exchangeRateStored() external view returns (uint256); }
}

// === MCP Protocol Handlers ===

fn handle_initialize() -> Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "defi-mcp", "version": "0.2.0" }
    })
}

fn handle_tools_list() -> Value {
    let chain_desc = "Chain name (e.g. mantle, ethereum, bnb, arbitrum, base, hyperevm, polygon, avalanche, optimism, scroll, linea). Default: hyperevm";
    serde_json::json!({ "tools": [
        tool_def("defi_status", "Get chain info, protocols and tokens for a chain", &[
            prop("chain", "string", chain_desc),
        ], &[]),
        tool_def("defi_scan", "Scan for exploits: oracle divergence, stablecoin depeg, exchange rate anomalies", &[
            prop("chain", "string", chain_desc),
            prop("patterns", "string", "Patterns to scan (comma-separated: oracle,stable,exchange_rate). Default: all"),
            prop("oracle_threshold", "number", "Oracle divergence threshold percent. Default: 5.0"),
        ], &[]),
        tool_def("defi_scan_all", "Scan ALL 11 chains in parallel for exploits. Returns unified results.", &[
            prop("patterns", "string", "Patterns (comma-separated). Default: oracle,stable,exchange_rate"),
        ], &[]),
        tool_def("defi_swap_quote", "Get best-price swap quote across all DEXes via ODOS aggregator", &[
            prop("chain", "string", chain_desc),
            prop("from", "string", "Input token symbol (e.g. USDC)"),
            prop("to", "string", "Output token symbol (e.g. WETH)"),
            prop("amount", "number", "Amount of input token"),
        ], &["from", "to", "amount"]),
        tool_def("defi_bridge_quote", "Get cross-chain bridge quote via LI.FI", &[
            prop("from_chain", "string", "Source chain"),
            prop("to_chain", "string", "Destination chain"),
            prop("token", "string", "Token symbol (e.g. USDC)"),
            prop("amount", "number", "Amount to bridge"),
        ], &["from_chain", "to_chain", "token", "amount"]),
        tool_def("defi_whales", "Find top token holders on a chain", &[
            prop("chain", "string", chain_desc),
            prop("token", "string", "Token symbol (e.g. WETH)"),
            prop("top", "number", "Number of holders (default: 10)"),
            prop("positions", "boolean", "Also scan lending positions (default: false)"),
        ], &["token"]),
        tool_def("defi_positions", "Scan wallet positions across all chains (parallel)", &[
            prop("address", "string", "Wallet address (0x...)"),
            prop("chains", "string", "Specific chains (comma-separated). Default: all 11"),
        ], &["address"]),
        tool_def("defi_yield_compare", "Compare lending yields across protocols on a chain", &[
            prop("chain", "string", chain_desc),
            prop("asset", "string", "Token symbol (e.g. USDC, WETH)"),
        ], &["asset"]),
        tool_def("defi_lending_rates", "Get lending rates for an asset on a specific protocol", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug (e.g. aave-v3-eth)"),
            prop("asset", "string", "Token symbol"),
        ], &["protocol", "asset"]),
        tool_def("defi_lending_position", "Get a wallet's lending position on a protocol", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug"),
            prop("address", "string", "Wallet address"),
        ], &["protocol", "address"]),
        tool_def("defi_price", "Query asset price from oracles and DEXes", &[
            prop("chain", "string", chain_desc),
            prop("asset", "string", "Token symbol"),
        ], &["asset"]),
        tool_def("defi_dex_swap", "Build a DEX swap transaction (dry-run simulation)", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug"),
            prop("token_in", "string", "Input token symbol"),
            prop("token_out", "string", "Output token symbol"),
            prop("amount", "string", "Amount (human-readable)"),
        ], &["protocol", "token_in", "token_out", "amount"]),
        tool_def("defi_lending_supply", "Build a lending supply transaction (dry-run)", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug"),
            prop("asset", "string", "Token symbol"),
            prop("amount", "string", "Amount"),
        ], &["protocol", "asset", "amount"]),
        tool_def("defi_lending_borrow", "Build a lending borrow transaction (dry-run)", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug"),
            prop("asset", "string", "Token symbol"),
            prop("amount", "string", "Amount"),
        ], &["protocol", "asset", "amount"]),
        tool_def("defi_token_approve", "Build a token approval transaction (dry-run)", &[
            prop("chain", "string", chain_desc),
            prop("token", "string", "Token symbol"),
            prop("spender", "string", "Spender address"),
            prop("amount", "string", "Amount (or 'max')"),
        ], &["token", "spender", "amount"]),
        tool_def("defi_staking_info", "Get liquid staking info (exchange rate, APY)", &[
            prop("chain", "string", chain_desc),
            prop("protocol", "string", "Protocol slug"),
        ], &["protocol"]),
        tool_def("defi_portfolio", "Get wallet portfolio on a single chain", &[
            prop("chain", "string", chain_desc),
            prop("address", "string", "Wallet address"),
        ], &["address"]),
        tool_def("defi_list_protocols", "List protocols, optionally filtered by chain and category", &[
            prop("chain", "string", "Filter by chain"),
            prop("category", "string", "Filter by category (dex, lending, cdp, etc.)"),
        ], &[]),
    ]})
}

// === Tool dispatch ===

async fn handle_tool_call(
    registry: &Registry,
    name: &str,
    args: &Value,
) -> std::result::Result<Value, String> {
    match name {
        "defi_status" => tool_status(registry, args).map_err(|e| e.to_string()),
        "defi_list_protocols" => tool_list_protocols(registry, args).map_err(|e| e.to_string()),
        "defi_scan" => tool_scan(registry, args).await.map_err(|e| e.to_string()),
        "defi_scan_all" => tool_scan_all(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_swap_quote" => tool_swap_quote(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_bridge_quote" => tool_bridge_quote(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_whales" => tool_whales(registry, args).await.map_err(|e| e.to_string()),
        "defi_positions" => tool_positions(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_yield_compare" => tool_yield_compare(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_rates" => tool_lending_rates(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_position" => tool_lending_position(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_price" => tool_price(registry, args).await.map_err(|e| e.to_string()),
        "defi_dex_swap" => tool_dex_swap(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_supply" => tool_lending_supply(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_borrow" => tool_lending_borrow(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_token_approve" => tool_token_approve(registry, args).map_err(|e| e.to_string()),
        "defi_staking_info" => tool_staking_info(registry, args)
            .await
            .map_err(|e| e.to_string()),
        "defi_portfolio" => tool_portfolio(registry, args)
            .await
            .map_err(|e| e.to_string()),
        _ => Err(format!("Unknown tool: {name}")),
    }
}

// === Tool Implementations ===

fn get_chain_key(args: &Value) -> String {
    args.get("chain")
        .and_then(|v| v.as_str())
        .unwrap_or("hyperevm")
        .to_lowercase()
}

fn tool_status(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let protos: Vec<Value> = registry.get_protocols_for_chain(&ck).iter().map(|p| {
        serde_json::json!({"name": p.name, "slug": p.slug, "category": p.category.to_string(), "interface": p.interface})
    }).collect();
    let tokens: Vec<String> = registry
        .tokens
        .get(&ck)
        .map(|t| t.iter().map(|t| t.symbol.clone()).collect())
        .unwrap_or_default();
    Ok(
        serde_json::json!({"chain": chain.name, "chain_id": chain.chain_id, "protocols": protos, "tokens": tokens, "summary": {"total_protocols": protos.len(), "total_tokens": tokens.len()}}),
    )
}

fn tool_list_protocols(registry: &Registry, args: &Value) -> Result<Value> {
    let chain_filter = args.get("chain").and_then(|v| v.as_str());
    let cat_filter = args.get("category").and_then(|v| v.as_str());
    let protos: Vec<Value> = registry.protocols.iter()
        .filter(|p| chain_filter.is_none_or(|c| p.chain.eq_ignore_ascii_case(c)))
        .filter(|p| cat_filter.is_none_or(|c| p.category.to_string().eq_ignore_ascii_case(c)))
        .map(|p| serde_json::json!({"name": p.name, "slug": p.slug, "category": p.category.to_string(), "interface": p.interface, "chain": p.chain}))
        .collect();
    Ok(serde_json::json!({"protocols": protos, "count": protos.len()}))
}

async fn tool_scan(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let rpc = chain.effective_rpc_url();
    let threshold = args
        .get("oracle_threshold")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0);
    let all_tokens = registry.tokens.get(&ck).cloned().unwrap_or_default();
    let wrapped_native = chain.wrapped_native_address();
    let quote_stable = registry
        .resolve_token(&ck, "USDT")
        .or_else(|_| registry.resolve_token(&ck, "USDC"))?
        .clone();
    let scan_tokens: Vec<_> = all_tokens
        .iter()
        .filter(|t| {
            t.address != Address::ZERO
                && !["USDC", "USDT", "DAI", "USDT0"].contains(&t.symbol.as_str())
        })
        .collect();

    let oracles: Vec<(String, Address, u8)> = registry
        .get_protocols_for_chain(&ck)
        .iter()
        .filter(|p| {
            p.category == ProtocolCategory::Lending
                && (p.interface == "aave_v3" || p.interface == "aave_v2")
        })
        .filter_map(|p| {
            let d: u8 = if p.interface == "aave_v2" { 18 } else { 8 };
            p.contracts.get("oracle").map(|a| (p.name.clone(), *a, d))
        })
        .collect();
    let dex: Option<(String, Address)> = registry
        .get_protocols_for_chain(&ck)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Dex && p.interface == "uniswap_v2")
        .filter_map(|p| p.contracts.get("router").map(|a| (p.name.clone(), *a)))
        .next();

    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
    enum CT {
        Oracle(String, String, u8),
        Dex(String, u8),
    }
    let mut cts: Vec<CT> = Vec::new();

    for (on, oa, od) in &oracles {
        for t in &scan_tokens {
            cts.push(CT::Oracle(on.clone(), t.symbol.clone(), *od));
            calls.push((
                *oa,
                IAaveOracle::getAssetPriceCall { asset: t.address }.abi_encode(),
            ));
        }
    }
    if let Some((_, router)) = &dex {
        for t in &scan_tokens {
            let amt = U256::from(10u64).pow(U256::from(t.decimals));
            let path = if t.address == wrapped_native {
                vec![t.address, quote_stable.address]
            } else {
                vec![t.address, wrapped_native, quote_stable.address]
            };
            cts.push(CT::Dex(t.symbol.clone(), quote_stable.decimals));
            calls.push((
                *router,
                IUniV2Router::getAmountsOutCall {
                    amountIn: amt,
                    path,
                }
                .abi_encode(),
            ));
        }
    }

    if calls.is_empty() {
        return Ok(serde_json::json!({"chain": chain.name, "alerts": [], "alert_count": 0}));
    }

    let start = std::time::Instant::now();
    let results = multicall_read(&rpc, calls).await?;
    let ms = start.elapsed().as_millis();

    let mut oracle_map: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    let mut dex_map: HashMap<String, f64> = HashMap::new();
    let mut alerts = Vec::new();

    for (i, ct) in cts.iter().enumerate() {
        match ct {
            CT::Oracle(o, t, d) => {
                let p = parse_u256(&results[i], *d);
                if p > 0.0 {
                    oracle_map
                        .entry(t.clone())
                        .or_default()
                        .push((o.clone(), p));
                }
            }
            CT::Dex(t, d) => {
                let p = parse_amts_last(&results[i], *d);
                if p > 0.0 {
                    dex_map.insert(t.clone(), p);
                }
            }
        }
    }

    for (token, oentries) in &oracle_map {
        if let Some(&dp) = dex_map.get(token) {
            for (oname, op) in oentries {
                if dp < *op && dp < op * 0.1 {
                    continue;
                }
                let dev = (dp - op).abs() / op * 100.0;
                if dev > threshold {
                    let sev = if dev > 100.0 {
                        "critical"
                    } else if dev > 20.0 {
                        "high"
                    } else {
                        "medium"
                    };
                    alerts.push(serde_json::json!({"pattern":"oracle_divergence","severity":sev,"asset":token,"oracle":oname,"oracle_price":r4(*op),"dex_price":r4(dp),"deviation_pct":r2(dev)}));
                }
            }
        }
    }

    Ok(
        serde_json::json!({"chain": chain.name, "scan_duration_ms": ms, "alert_count": alerts.len(), "alerts": alerts}),
    )
}

async fn tool_scan_all(registry: &Registry, args: &Value) -> Result<Value> {
    let start = std::time::Instant::now();
    let chain_keys: Vec<String> = registry.chains.keys().cloned().collect();
    let mut join_set = tokio::task::JoinSet::new();

    for ck in &chain_keys {
        let chain = match registry.get_chain(ck) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let chain_name = chain.name.clone();
        let mut scan_args = serde_json::json!({"chain": ck});
        if let Some(p) = args.get("patterns") {
            scan_args["patterns"] = p.clone();
        }
        // We need owned registry data for the spawned task
        let rpc = chain.effective_rpc_url();
        let all_tokens = registry.tokens.get(ck).cloned().unwrap_or_default();
        let qs = registry
            .resolve_token(ck, "USDT")
            .or_else(|_| registry.resolve_token(ck, "USDC"))
            .ok()
            .cloned();
        let oracles: Vec<(String, Address, u8)> = registry
            .get_protocols_for_chain(ck)
            .iter()
            .filter(|p| {
                p.category == ProtocolCategory::Lending
                    && (p.interface == "aave_v3" || p.interface == "aave_v2")
            })
            .filter_map(|p| {
                let d: u8 = if p.interface == "aave_v2" { 18 } else { 8 };
                p.contracts.get("oracle").map(|a| (p.name.clone(), *a, d))
            })
            .collect();
        let dex: Option<Address> = registry
            .get_protocols_for_chain(ck)
            .iter()
            .filter(|p| p.category == ProtocolCategory::Dex && p.interface == "uniswap_v2")
            .filter_map(|p| p.contracts.get("router").copied())
            .next();
        let wn = chain.wrapped_native_address();

        join_set.spawn(async move {
            scan_chain_inner(chain_name, rpc, all_tokens, qs, oracles, dex, wn, 5.0).await
        });
    }

    let mut chain_results = Vec::new();
    let mut total = 0usize;
    while let Some(r) = join_set.join_next().await {
        if let Ok(Some(v)) = r {
            total += v["alert_count"].as_u64().unwrap_or(0) as usize;
            chain_results.push(v);
        }
    }
    chain_results.sort_by(|a, b| {
        b["alert_count"]
            .as_u64()
            .unwrap_or(0)
            .cmp(&a["alert_count"].as_u64().unwrap_or(0))
    });

    Ok(
        serde_json::json!({"mode": "all_chains", "chains_scanned": chain_keys.len(), "scan_duration_ms": start.elapsed().as_millis(), "total_alerts": total, "chains": chain_results}),
    )
}

async fn scan_chain_inner(
    chain_name: String,
    rpc: String,
    all_tokens: Vec<defi_core::registry::TokenEntry>,
    qs: Option<defi_core::registry::TokenEntry>,
    oracles: Vec<(String, Address, u8)>,
    dex: Option<Address>,
    wn: Address,
    threshold: f64,
) -> Option<Value> {
    let qs = qs.as_ref()?;
    let scan_tokens: Vec<_> = all_tokens
        .iter()
        .filter(|t| {
            t.address != Address::ZERO
                && !["USDC", "USDT", "DAI", "USDT0"].contains(&t.symbol.as_str())
        })
        .collect();
    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
    enum CT {
        O(String, String, u8),
        D(String, u8),
    }
    let mut cts: Vec<CT> = Vec::new();
    for (on, oa, od) in &oracles {
        for t in &scan_tokens {
            cts.push(CT::O(on.clone(), t.symbol.clone(), *od));
            calls.push((
                *oa,
                IAaveOracle::getAssetPriceCall { asset: t.address }.abi_encode(),
            ));
        }
    }
    if let Some(router) = dex {
        for t in &scan_tokens {
            let amt = U256::from(10u64).pow(U256::from(t.decimals));
            let path = if t.address == wn {
                vec![t.address, qs.address]
            } else {
                vec![t.address, wn, qs.address]
            };
            cts.push(CT::D(t.symbol.clone(), qs.decimals));
            calls.push((
                router,
                IUniV2Router::getAmountsOutCall {
                    amountIn: amt,
                    path,
                }
                .abi_encode(),
            ));
        }
    }
    if calls.is_empty() {
        return None;
    }
    let start = std::time::Instant::now();
    let results = multicall_read(&rpc, calls).await.ok()?;
    let ms = start.elapsed().as_millis();
    let mut om: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    let mut dm: HashMap<String, f64> = HashMap::new();
    let mut alerts = Vec::new();
    for (i, ct) in cts.iter().enumerate() {
        match ct {
            CT::O(o, t, d) => {
                let p = parse_u256(&results[i], *d);
                if p > 0.0 {
                    om.entry(t.clone()).or_default().push((o.clone(), p));
                }
            }
            CT::D(t, d) => {
                let p = parse_amts_last(&results[i], *d);
                if p > 0.0 {
                    dm.insert(t.clone(), p);
                }
            }
        }
    }
    for (token, oes) in &om {
        if let Some(&dp) = dm.get(token) {
            for (on, op) in oes {
                if dp < *op && dp < op * 0.1 {
                    continue;
                }
                let dev = (dp - op).abs() / op * 100.0;
                if dev > threshold {
                    let sev = if dev > 100.0 {
                        "critical"
                    } else if dev > 20.0 {
                        "high"
                    } else {
                        "medium"
                    };
                    alerts.push(serde_json::json!({"pattern":"oracle_divergence","severity":sev,"asset":token,"oracle":on,"oracle_price":r4(*op),"dex_price":r4(dp),"deviation_pct":r2(dev)}));
                }
            }
        }
    }
    Some(
        serde_json::json!({"chain": chain_name, "scan_duration_ms": ms, "alert_count": alerts.len(), "alerts": alerts}),
    )
}

async fn tool_swap_quote(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let from_sym = args
        .get("from")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'from'".into()))?;
    let to_sym = args
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'to'".into()))?;
    let amount = args
        .get("amount")
        .and_then(|v| v.as_f64())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;
    let ti = registry.resolve_token(&ck, from_sym)?;
    let to = registry.resolve_token(&ck, to_sym)?;
    let raw = (amount * 10f64.powi(ti.decimals as i32)) as u128;

    let client = reqwest::Client::new();
    let quote: Value = client.post("https://api.odos.xyz/sor/quote/v2")
        .json(&serde_json::json!({"chainId": chain.chain_id, "inputTokens": [{"tokenAddress": format!("{:?}", ti.address), "amount": format!("{}", raw)}], "outputTokens": [{"tokenAddress": format!("{:?}", to.address), "proportion": 1}], "slippageLimitPercent": 0.5, "userAddr": "0x0000000000000000000000000000000000000001"}))
        .send().await.map_err(|e| DefiError::RpcError(format!("ODOS: {e}")))?
        .json().await.map_err(|e| DefiError::RpcError(format!("ODOS parse: {e}")))?;

    let out_raw = quote["outAmounts"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<u128>()
        .unwrap_or(0);
    let out_human = out_raw as f64 / 10f64.powi(to.decimals as i32);
    let impact = quote["priceImpact"]
        .as_f64()
        .or(quote["percentDiff"].as_f64().map(|v| v.abs()));

    Ok(
        serde_json::json!({"chain": chain.name, "aggregator": "ODOS", "from": from_sym, "to": to_sym, "amount_in": amount, "amount_out": r6(out_human), "price_impact_pct": impact}),
    )
}

async fn tool_bridge_quote(registry: &Registry, args: &Value) -> Result<Value> {
    let fc = args
        .get("from_chain")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'from_chain'".into()))?;
    let tc = args
        .get("to_chain")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'to_chain'".into()))?;
    let tok = args
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'token'".into()))?;
    let amt = args
        .get("amount")
        .and_then(|v| v.as_f64())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;

    let from_chain = registry.get_chain(&fc.to_lowercase())?;
    let to_chain = registry.get_chain(&tc.to_lowercase())?;
    let ft = registry.resolve_token(&fc.to_lowercase(), tok)?;
    let tt = registry.resolve_token(&tc.to_lowercase(), tok).ok();
    let raw = (amt * 10f64.powi(ft.decimals as i32)) as u128;
    let fa = if ft.address == Address::ZERO {
        "0x0000000000000000000000000000000000000000".into()
    } else {
        format!("{:?}", ft.address)
    };
    let ta = tt
        .map(|t| {
            if t.address == Address::ZERO {
                "0x0000000000000000000000000000000000000000".into()
            } else {
                format!("{:?}", t.address)
            }
        })
        .unwrap_or_else(|| fa.clone());

    let url = format!(
        "https://li.quest/v1/quote?fromChain={}&toChain={}&fromToken={}&toToken={}&fromAmount={}&fromAddress=0x0000000000000000000000000000000000000001&slippage=0.005",
        from_chain.chain_id, to_chain.chain_id, fa, ta, raw
    );
    let client = reqwest::Client::new();
    let body: Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("LI.FI: {e}")))?
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("LI.FI parse: {e}")))?;

    let est = &body["estimate"];
    let td = tt.map(|t| t.decimals).unwrap_or(ft.decimals);
    let to_amt = est["toAmount"]
        .as_str()
        .unwrap_or("0")
        .parse::<u128>()
        .unwrap_or(0) as f64
        / 10f64.powi(td as i32);
    let fee = est["feeCosts"]
        .as_array()
        .map(|c| {
            c.iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);
    let gas = est["gasCosts"]
        .as_array()
        .map(|c| {
            c.iter()
                .filter_map(|c| c["amountUSD"].as_str().and_then(|s| s.parse::<f64>().ok()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);
    let bridge = body["toolDetails"]["name"]
        .as_str()
        .unwrap_or(body["tool"].as_str().unwrap_or("?"));
    let dur = est["executionDuration"].as_u64().unwrap_or(0);

    Ok(
        serde_json::json!({"from_chain": from_chain.name, "to_chain": to_chain.name, "token": tok, "amount_in": amt, "amount_out": r6(to_amt), "fee_usd": r2(fee), "gas_usd": r2(gas), "total_cost_usd": r2(fee+gas), "bridge": bridge, "estimated_time_sec": dur}),
    )
}

async fn tool_whales(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let tok = args
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'token'".into()))?;
    let top = args.get("top").and_then(|v| v.as_u64()).unwrap_or(10);
    let token = registry.resolve_token(&ck, tok)?;

    let url = format!(
        "https://api.routescan.io/v2/network/mainnet/evm/{}/etherscan/api?module=token&action=tokenholderlist&contractaddress={:?}&page=1&offset={}",
        chain.chain_id, token.address, top
    );
    let client = reqwest::Client::new();
    let body: Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("Explorer: {e}")))?
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("Explorer parse: {e}")))?;

    if body["status"].as_str() != Some("1") {
        return Err(DefiError::RpcError(format!(
            "Explorer: {}",
            body["result"].as_str().unwrap_or("error")
        )));
    }

    let holders: Vec<Value> = body["result"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .enumerate()
        .filter_map(|(i, h)| {
            let addr = h["TokenHolderAddress"].as_str()?;
            let qty = h["TokenHolderQuantity"].as_str()?.parse::<u128>().ok()?;
            let bal = qty as f64 / 10f64.powi(token.decimals as i32);
            Some(serde_json::json!({"rank": i+1, "address": addr, "balance": r4(bal)}))
        })
        .collect();

    Ok(serde_json::json!({"chain": chain.name, "token": tok, "holders": holders}))
}

async fn tool_positions(registry: &Registry, args: &Value) -> Result<Value> {
    let addr_str = args
        .get("address")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'address'".into()))?;
    let user: Address = addr_str
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;
    let chain_filter: Option<Vec<String>> = args
        .get("chains")
        .and_then(|v| v.as_str())
        .map(|c| c.split(',').map(|s| s.trim().to_lowercase()).collect());
    let chain_keys: Vec<String> =
        chain_filter.unwrap_or_else(|| registry.chains.keys().cloned().collect());

    let start = std::time::Instant::now();
    let mut join_set = tokio::task::JoinSet::new();

    for ck in &chain_keys {
        let chain = match registry.get_chain(ck) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let cn = chain.name.clone();
        let rpc = chain.effective_rpc_url();
        let tokens = registry.tokens.get(ck).cloned().unwrap_or_default();
        let pools: Vec<(String, Address, String)> = registry
            .get_protocols_for_chain(ck)
            .iter()
            .filter(|p| {
                p.category == ProtocolCategory::Lending
                    && (p.interface == "aave_v3" || p.interface == "aave_v2")
            })
            .filter_map(|p| {
                p.contracts
                    .get("pool")
                    .map(|a| (p.name.clone(), *a, p.interface.clone()))
            })
            .collect();
        let oracle = registry
            .get_protocols_for_chain(ck)
            .iter()
            .find(|p| p.interface == "aave_v3" && p.contracts.contains_key("oracle"))
            .and_then(|p| p.contracts.get("oracle").copied());
        let wn = chain.wrapped_native_address();

        join_set
            .spawn(async move { positions_chain(cn, rpc, user, tokens, pools, oracle, wn).await });
    }

    let mut results = Vec::new();
    let mut total = 0.0f64;
    while let Some(r) = join_set.join_next().await {
        if let Ok(Some(v)) = r {
            total += v["chain_total_usd"].as_f64().unwrap_or(0.0);
            results.push(v);
        }
    }
    results.sort_by(|a, b| {
        b["chain_total_usd"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["chain_total_usd"].as_f64().unwrap_or(0.0))
            .unwrap()
    });

    Ok(
        serde_json::json!({"address": addr_str, "scan_duration_ms": start.elapsed().as_millis(), "chains_scanned": chain_keys.len(), "total_value_usd": r2(total), "chains": results}),
    )
}

async fn positions_chain(
    cn: String,
    rpc: String,
    user: Address,
    tokens: Vec<defi_core::registry::TokenEntry>,
    pools: Vec<(String, Address, String)>,
    oracle: Option<Address>,
    wn: Address,
) -> Option<Value> {
    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
    for t in &tokens {
        if t.address != Address::ZERO {
            calls.push((
                t.address,
                IERC20::balanceOfCall { owner: user }.abi_encode(),
            ));
        }
    }
    for (_, pool, _) in &pools {
        calls.push((*pool, IPool::getUserAccountDataCall { user }.abi_encode()));
    }
    if let Some(o) = oracle {
        calls.push((o, IAaveOracle::getAssetPriceCall { asset: wn }.abi_encode()));
    }
    if calls.is_empty() {
        return None;
    }
    let results = multicall_read(&rpc, calls).await.ok()?;

    let np = if oracle.is_some() {
        parse_u256(&results[results.len() - 1], 8)
    } else {
        0.0
    };
    let mut bals = Vec::new();
    let mut cv = 0.0f64;
    let mut idx = 0;
    for t in &tokens {
        if t.address != Address::ZERO {
            let b = match &results[idx] {
                Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]),
                _ => U256::ZERO,
            };
            if !b.is_zero() {
                let bf = b.to::<u128>() as f64 / 10f64.powi(t.decimals as i32);
                let usd = est_usd(&t.symbol, bf, np);
                if usd > 0.01 {
                    cv += usd;
                    bals.push(serde_json::json!({"symbol": t.symbol, "balance": r4(bf), "value_usd": r2(usd)}));
                }
            }
            idx += 1;
        }
    }
    let mut lps = Vec::new();
    for (name, _, iface) in &pools {
        if idx < results.len() {
            if let Some(data) = &results[idx]
                && data.len() >= 192
            {
                let d: u8 = if iface == "aave_v2" { 18 } else { 8 };
                let div = 10f64.powi(d as i32);
                let c = U256::from_be_slice(&data[0..32]).to::<u128>() as f64 / div;
                let debt = U256::from_be_slice(&data[32..64]).to::<u128>() as f64 / div;
                if c > 0.01 || debt > 0.01 {
                    cv += c - debt;
                    lps.push(serde_json::json!({"protocol": name, "collateral_usd": r2(c), "debt_usd": r2(debt)}));
                }
            }
            idx += 1;
        }
    }
    if bals.is_empty() && lps.is_empty() {
        return None;
    }
    Some(
        serde_json::json!({"chain": cn, "chain_total_usd": r2(cv), "token_balances": bals, "lending_positions": lps}),
    )
}

async fn tool_yield_compare(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let asset_sym = args
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'asset'".into()))?;
    let asset = registry.resolve_token(&ck, asset_sym)?;
    let protos: Vec<_> = registry
        .get_protocols_for_chain(&ck)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .cloned()
        .cloned()
        .collect();
    let mut rates = Vec::new();
    for p in &protos {
        if let Ok(a) =
            defi_protocols::factory::create_lending_with_rpc(p, Some(&chain.effective_rpc_url()))
            && let Ok(r) = a.get_rates(asset.address).await
        {
            rates.push(serde_json::json!({"protocol": r.protocol, "supply_apy": r.supply_apy, "borrow_variable_apy": r.borrow_variable_apy}));
        }
    }
    Ok(serde_json::json!({"chain": chain.name, "asset": asset_sym, "rates": rates}))
}

async fn tool_lending_rates(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let asset_sym = args
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'asset'".into()))?;
    let entry = registry.get_protocol(proto)?;
    let lending =
        defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.effective_rpc_url()))?;
    let asset_addr = registry.resolve_token(&ck, asset_sym)?.address;
    let rates = lending.get_rates(asset_addr).await?;
    serde_json::to_value(&rates).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_lending_position(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let addr = args
        .get("address")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'address'".into()))?;
    let entry = registry.get_protocol(proto)?;
    let lending =
        defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.effective_rpc_url()))?;
    let user: Address = addr
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;
    let pos = lending.get_user_position(user).await?;
    serde_json::to_value(&pos).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_price(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let asset_sym = args
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'asset'".into()))?;
    let asset = registry.resolve_token(&ck, asset_sym)?;

    let oracles: Vec<(String, Address)> = registry
        .get_protocols_for_chain(&ck)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .filter_map(|p| p.contracts.get("oracle").map(|a| (p.name.clone(), *a)))
        .collect();

    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
    let mut names = Vec::new();
    for (name, oa) in &oracles {
        calls.push((
            *oa,
            IAaveOracle::getAssetPriceCall {
                asset: asset.address,
            }
            .abi_encode(),
        ));
        names.push(name.clone());
    }

    if calls.is_empty() {
        return Ok(serde_json::json!({"chain": chain.name, "asset": asset_sym, "sources": []}));
    }

    let results = multicall_read(&chain.effective_rpc_url(), calls).await?;
    let sources: Vec<Value> = results
        .iter()
        .enumerate()
        .filter_map(|(i, r)| {
            let p = parse_u256(r, 8);
            if p > 0.0 {
                Some(serde_json::json!({"source": &names[i], "price": r4(p)}))
            } else {
                None
            }
        })
        .collect();
    Ok(serde_json::json!({"chain": chain.name, "asset": asset_sym, "sources": sources}))
}

async fn tool_dex_swap(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let ti = args
        .get("token_in")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'token_in'".into()))?;
    let to = args
        .get("token_out")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'token_out'".into()))?;
    let amt = args
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;

    let entry = registry.get_protocol(proto)?;
    let dex = defi_protocols::factory::create_dex(entry)?;
    let tia = registry.resolve_token(&ck, ti)?.address;
    let toa = registry.resolve_token(&ck, to)?.address;
    let dec = registry
        .resolve_token(&ck, ti)
        .map(|t| t.decimals)
        .unwrap_or(18);
    let amount_in = parse_amount(amt, dec)?;

    let tx = dex
        .build_swap(SwapParams {
            protocol: proto.to_string(),
            token_in: tia,
            token_out: toa,
            amount_in,
            slippage: Slippage::default_swap(),
            recipient: Address::ZERO,
            deadline: None,
        })
        .await?;
    Ok(
        serde_json::json!({"description": tx.description, "to": tx.to.to_string(), "data_len": tx.data.len(), "value": tx.value.to_string()}),
    )
}

async fn tool_lending_supply(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let asset_sym = args
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'asset'".into()))?;
    let amt = args
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;
    let entry = registry.get_protocol(proto)?;
    let lending =
        defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.effective_rpc_url()))?;
    let asset = registry.resolve_token(&ck, asset_sym)?;
    let amount = parse_amount(amt, asset.decimals)?;
    let tx = lending
        .build_supply(SupplyParams {
            protocol: proto.to_string(),
            asset: asset.address,
            amount,
            on_behalf_of: Address::ZERO,
        })
        .await?;
    Ok(
        serde_json::json!({"description": tx.description, "to": tx.to.to_string(), "data_len": tx.data.len()}),
    )
}

async fn tool_lending_borrow(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let chain = registry.get_chain(&ck)?;
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let asset_sym = args
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'asset'".into()))?;
    let amt = args
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;
    let entry = registry.get_protocol(proto)?;
    let lending =
        defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.effective_rpc_url()))?;
    let asset = registry.resolve_token(&ck, asset_sym)?;
    let amount = parse_amount(amt, asset.decimals)?;
    let tx = lending
        .build_borrow(BorrowParams {
            protocol: proto.to_string(),
            asset: asset.address,
            amount,
            interest_rate_mode: InterestRateMode::Variable,
            on_behalf_of: Address::ZERO,
        })
        .await?;
    Ok(
        serde_json::json!({"description": tx.description, "to": tx.to.to_string(), "data_len": tx.data.len()}),
    )
}

fn tool_token_approve(registry: &Registry, args: &Value) -> Result<Value> {
    let ck = get_chain_key(args);
    let tok = args
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'token'".into()))?;
    let spender = args
        .get("spender")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'spender'".into()))?;
    let amt = args
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'amount'".into()))?;
    let token = registry.resolve_token(&ck, tok)?;
    let spender_addr: Address = spender
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid spender: {e}")))?;
    let amount = if amt == "max" {
        U256::MAX
    } else {
        parse_amount(amt, token.decimals)?
    };

    alloy::sol! { interface IERC20A { function approve(address spender, uint256 amount) external returns (bool); } }
    let data = IERC20A::approveCall {
        spender: spender_addr,
        amount,
    }
    .abi_encode();
    Ok(
        serde_json::json!({"description": format!("Approve {} {} for {}", amt, tok, spender), "to": token.address.to_string(), "data_len": data.len()}),
    )
}

async fn tool_staking_info(registry: &Registry, args: &Value) -> Result<Value> {
    let proto = args
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or(DefiError::InvalidParam("Missing 'protocol'".into()))?;
    let entry = registry.get_protocol(proto)?;
    let staking = defi_protocols::factory::create_liquid_staking(entry)?;
    let info = staking.get_info().await?;
    serde_json::to_value(&info).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_portfolio(registry: &Registry, args: &Value) -> Result<Value> {
    // Delegate to positions with single chain
    let mut pos_args = args.clone();
    let ck = get_chain_key(args);
    pos_args["chains"] = Value::String(ck);
    tool_positions(registry, &pos_args).await
}

// === Helpers ===

fn prop<'a>(name: &'a str, typ: &'a str, desc: &'a str) -> (&'a str, &'a str, &'a str) {
    (name, typ, desc)
}

fn tool_def(name: &str, desc: &str, props: &[(&str, &str, &str)], required: &[&str]) -> Value {
    let mut properties = serde_json::Map::new();
    for (n, t, d) in props {
        properties.insert(
            n.to_string(),
            serde_json::json!({"type": t, "description": d}),
        );
    }
    serde_json::json!({"name": name, "description": desc, "inputSchema": {"type": "object", "properties": properties, "required": required}})
}

fn parse_amount(amount: &str, decimals: u8) -> Result<U256> {
    if amount == "max" {
        return Ok(U256::MAX);
    }
    let parts: Vec<&str> = amount.split('.').collect();
    let (whole, frac) = match parts.len() {
        1 => (parts[0], ""),
        2 => (parts[0], parts[1]),
        _ => return Err(DefiError::InvalidParam("Invalid amount".into())),
    };
    let w = U256::from(
        whole
            .parse::<u64>()
            .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
    );
    let f = if frac.is_empty() {
        U256::ZERO
    } else {
        let p = format!("{:0<width$}", frac, width = decimals as usize);
        U256::from(
            p[..decimals as usize]
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
        )
    };
    Ok(w * U256::from(10u64).pow(U256::from(decimals)) + f)
}

fn parse_u256(data: &Option<Bytes>, decimals: u8) -> f64 {
    match data {
        Some(b) if b.len() >= 32 => {
            U256::from_be_slice(&b[..32]).to::<u128>() as f64 / 10f64.powi(decimals as i32)
        }
        _ => 0.0,
    }
}

fn parse_amts_last(data: &Option<Bytes>, dec: u8) -> f64 {
    match data {
        Some(b) if b.len() >= 128 => {
            let n = U256::from_be_slice(&b[32..64]).to::<usize>();
            if n > 0 {
                let off = 64 + (n - 1) * 32;
                if b.len() >= off + 32 {
                    U256::from_be_slice(&b[off..off + 32]).to::<u128>() as f64
                        / 10f64.powi(dec as i32)
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

fn est_usd(sym: &str, bal: f64, np: f64) -> f64 {
    let s = sym.to_uppercase();
    if s.contains("USD") || s.contains("DAI") {
        bal
    } else if s.contains("BTC") {
        bal * 75000.0
    } else if ["WETH", "ETH", "METH", "CBETH", "WSTETH"].contains(&s.as_str()) {
        bal * 2350.0
    } else {
        bal * np
    }
}

fn r2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn r4(x: f64) -> f64 {
    (x * 10000.0).round() / 10000.0
}
fn r6(x: f64) -> f64 {
    (x * 1000000.0).round() / 1000000.0
}

// === Main ===

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("defi_mcp=info".parse().unwrap()),
        )
        .with_writer(std::io::stderr)
        .init();

    info!("Starting defi-mcp server v0.2.0 (18 tools, 11 chains)");

    let registry = match Registry::load_embedded() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to load registry: {e}");
            std::process::exit(1);
        }
    };
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let mut out = stdout.lock();
                let _ = writeln!(
                    out,
                    "{}",
                    serde_json::to_string(&JsonRpcResponse::error(
                        None,
                        -32700,
                        format!("Parse error: {e}")
                    ))
                    .unwrap()
                );
                let _ = out.flush();
                continue;
            }
        };

        let response = match request.method.as_str() {
            "initialize" => JsonRpcResponse::success(request.id, handle_initialize()),
            "notifications/initialized" => continue,
            "tools/list" => JsonRpcResponse::success(request.id, handle_tools_list()),
            "tools/call" => {
                let params = request.params.unwrap_or(Value::Object(Default::default()));
                let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default()));
                match rt.block_on(handle_tool_call(&registry, tool_name, &arguments)) {
                    Ok(result) => JsonRpcResponse::success(
                        request.id,
                        serde_json::json!({"content": [{"type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default()}]}),
                    ),
                    Err(e) => JsonRpcResponse::success(
                        request.id,
                        serde_json::json!({"content": [{"type": "text", "text": format!("Error: {e}")}], "isError": true}),
                    ),
                }
            }
            _ => JsonRpcResponse::error(
                request.id,
                -32601,
                format!("Method not found: {}", request.method),
            ),
        };

        let mut out = stdout.lock();
        let _ = writeln!(out, "{}", serde_json::to_string(&response).unwrap());
        let _ = out.flush();
    }
}
