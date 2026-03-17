use alloy::primitives::{Address, Bytes, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ProtocolCategory, Registry, TokenEntry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct PositionsArgs {
    /// Wallet address to query
    #[arg(long)]
    pub address: String,

    /// Scan specific chains only (comma-separated, default: all)
    #[arg(long)]
    pub chains: Option<String>,
}

alloy::sol! {
    interface IERC20 {
        function balanceOf(address owner) external view returns (uint256);
    }

    interface IPool {
        function getUserAccountData(address user) external view returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
    }

    interface IAaveOracle {
        function getAssetPrice(address asset) external view returns (uint256);
    }
}

/// Result from scanning a single chain
struct ChainScanResult {
    chain_name: String,
    native_price: f64,
    chain_value: f64,
    collateral: f64,
    debt: f64,
    token_balances: Vec<serde_json::Value>,
    lending_positions: Vec<serde_json::Value>,
}

pub async fn run(args: PositionsArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let user: Address = args
        .address
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

    let chain_filter: Option<Vec<String>> = args
        .chains
        .as_ref()
        .map(|c| c.split(',').map(|s| s.trim().to_lowercase()).collect());

    let chain_keys: Vec<String> = if let Some(ref filter) = chain_filter {
        filter.clone()
    } else {
        registry.chains.keys().cloned().collect()
    };

    let start = std::time::Instant::now();

    // Collect chain scan parameters (must be done before spawning tasks)
    type ScanParam = (
        String,
        String,
        Address,
        Vec<TokenEntry>,
        Vec<(String, Address, String)>,
        Option<Address>,
        Address,
    );
    let mut scan_params: Vec<ScanParam> = Vec::new();

    for chain_key in &chain_keys {
        let chain = match registry.get_chain(chain_key) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let rpc = chain.effective_rpc_url();
        let tokens = registry.tokens.get(chain_key).cloned().unwrap_or_default();

        let lending_pools: Vec<(String, Address, String)> = registry
            .get_protocols_for_chain(chain_key)
            .iter()
            .filter(|p| {
                p.category == ProtocolCategory::Lending
                    && (p.interface == "aave_v3" || p.interface == "aave_v2")
            })
            .filter_map(|p| {
                p.contracts
                    .get("pool")
                    .map(|addr| (p.name.clone(), *addr, p.interface.clone()))
            })
            .collect();

        let oracle_addr = registry
            .get_protocols_for_chain(chain_key)
            .iter()
            .find(|p| p.interface == "aave_v3" && p.contracts.contains_key("oracle"))
            .and_then(|p| p.contracts.get("oracle").copied());

        let wrapped_native = chain.wrapped_native_address();

        scan_params.push((
            chain.name.clone(),
            rpc,
            user,
            tokens,
            lending_pools,
            oracle_addr,
            wrapped_native,
        ));
    }

    // Spawn parallel tasks for each chain
    let mut join_set = tokio::task::JoinSet::new();

    for (chain_name, rpc, user, tokens, lending_pools, oracle_addr, wrapped_native) in scan_params {
        join_set.spawn(async move {
            scan_single_chain(
                chain_name,
                rpc,
                user,
                tokens,
                lending_pools,
                oracle_addr,
                wrapped_native,
            )
            .await
        });
    }

    // Collect results
    let mut chain_results = Vec::new();
    let mut grand_total_usd = 0.0_f64;
    let mut total_collateral_usd = 0.0_f64;
    let mut total_debt_usd = 0.0_f64;

    while let Some(result) = join_set.join_next().await {
        if let Ok(Some(r)) = result {
            grand_total_usd += r.chain_value;
            total_collateral_usd += r.collateral;
            total_debt_usd += r.debt;
            chain_results.push(serde_json::json!({
                "chain": r.chain_name,
                "native_price_usd": round2(r.native_price),
                "chain_total_usd": round2(r.chain_value),
                "token_balances": r.token_balances,
                "lending_positions": r.lending_positions,
            }));
        }
    }

    // Sort by chain_total_usd descending
    chain_results.sort_by(|a, b| {
        b["chain_total_usd"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["chain_total_usd"].as_f64().unwrap_or(0.0))
            .unwrap()
    });

    let scan_ms = start.elapsed().as_millis();

    let result = serde_json::json!({
        "address": format!("{}", user),
        "scan_duration_ms": scan_ms,
        "chains_scanned": chain_keys.len(),
        "chains_with_positions": chain_results.len(),
        "summary": {
            "total_value_usd": round2(grand_total_usd),
            "total_collateral_usd": round2(total_collateral_usd),
            "total_debt_usd": round2(total_debt_usd),
            "net_lending_usd": round2(total_collateral_usd - total_debt_usd),
        },
        "chains": chain_results,
    });

    output.print(&result)?;
    Ok(())
}

async fn scan_single_chain(
    chain_name: String,
    rpc: String,
    user: Address,
    tokens: Vec<TokenEntry>,
    lending_pools: Vec<(String, Address, String)>,
    oracle_addr: Option<Address>,
    wrapped_native: Address,
) -> Option<ChainScanResult> {
    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();

    enum CallType {
        TokenBalance { symbol: String, decimals: u8 },
        LendingPosition { protocol: String, interface: String },
        NativePrice,
    }
    let mut call_types: Vec<CallType> = Vec::new();

    for token in &tokens {
        if token.address != Address::ZERO {
            call_types.push(CallType::TokenBalance {
                symbol: token.symbol.clone(),
                decimals: token.decimals,
            });
            calls.push((
                token.address,
                IERC20::balanceOfCall { owner: user }.abi_encode(),
            ));
        }
    }

    for (name, pool, iface) in &lending_pools {
        call_types.push(CallType::LendingPosition {
            protocol: name.clone(),
            interface: iface.clone(),
        });
        calls.push((*pool, IPool::getUserAccountDataCall { user }.abi_encode()));
    }

    if let Some(oracle) = oracle_addr {
        call_types.push(CallType::NativePrice);
        calls.push((
            oracle,
            IAaveOracle::getAssetPriceCall {
                asset: wrapped_native,
            }
            .abi_encode(),
        ));
    }

    if calls.is_empty() {
        return None;
    }

    let results = multicall_read(&rpc, calls).await.ok()?;

    let native_price = if oracle_addr.is_some() {
        let idx = results.len() - 1;
        parse_u256(&results[idx], 8)
    } else {
        0.0
    };

    let mut token_balances = Vec::new();
    let mut lending_positions = Vec::new();
    let mut chain_value = 0.0_f64;
    let mut total_coll = 0.0_f64;
    let mut total_debt = 0.0_f64;

    for (i, ct) in call_types.iter().enumerate() {
        match ct {
            CallType::TokenBalance { symbol, decimals } => {
                let balance = match &results[i] {
                    Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]),
                    _ => U256::ZERO,
                };
                if !balance.is_zero() {
                    let bal_f64 = balance.to::<u128>() as f64 / 10f64.powi(*decimals as i32);
                    let value_usd = estimate_token_value(symbol, bal_f64, native_price);
                    if value_usd > 0.01 {
                        chain_value += value_usd;
                        token_balances.push(serde_json::json!({
                            "symbol": symbol,
                            "balance": round4(bal_f64),
                            "value_usd": round2(value_usd),
                        }));
                    }
                }
            }
            CallType::LendingPosition {
                protocol,
                interface: iface,
            } => {
                if let Some(data) = &results[i]
                    && data.len() >= 192
                {
                    let price_decimals: u8 = if iface == "aave_v2" { 18 } else { 8 };
                    let divisor = 10f64.powi(price_decimals as i32);
                    let collateral =
                        U256::from_be_slice(&data[0..32]).to::<u128>() as f64 / divisor;
                    let debt = U256::from_be_slice(&data[32..64]).to::<u128>() as f64 / divisor;
                    let hf_raw = U256::from_be_slice(&data[160..192]);
                    let hf = if hf_raw > U256::from(u128::MAX) {
                        None
                    } else {
                        let v = hf_raw.to::<u128>() as f64 / 1e18;
                        if v > 1e10 { None } else { Some(round2(v)) }
                    };

                    if collateral > 0.01 || debt > 0.01 {
                        let net = collateral - debt;
                        chain_value += net;
                        total_coll += collateral;
                        total_debt += debt;
                        lending_positions.push(serde_json::json!({
                            "protocol": protocol,
                            "collateral_usd": round2(collateral),
                            "debt_usd": round2(debt),
                            "net_usd": round2(net),
                            "health_factor": hf,
                        }));
                    }
                }
            }
            CallType::NativePrice => {}
        }
    }

    if token_balances.is_empty() && lending_positions.is_empty() {
        return None;
    }

    Some(ChainScanResult {
        chain_name,
        native_price,
        chain_value,
        collateral: total_coll,
        debt: total_debt,
        token_balances,
        lending_positions,
    })
}

fn parse_u256(data: &Option<Bytes>, decimals: u8) -> f64 {
    match data {
        Some(b) if b.len() >= 32 => {
            U256::from_be_slice(&b[..32]).to::<u128>() as f64 / 10f64.powi(decimals as i32)
        }
        _ => 0.0,
    }
}

fn estimate_token_value(symbol: &str, balance: f64, native_price: f64) -> f64 {
    let s = symbol.to_uppercase();
    if s.contains("USD") || s.contains("DAI") {
        balance
    } else if s.contains("BTC") || s.contains("FBTC") {
        balance * 75000.0
    } else if s == "WETH" || s == "ETH" || s == "METH" || s == "CBETH" || s == "WSTETH" {
        balance * 2350.0
    } else {
        balance * native_price
    }
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round4(x: f64) -> f64 {
    (x * 10000.0).round() / 10000.0
}
