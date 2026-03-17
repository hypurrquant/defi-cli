use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct WhalesArgs {
    /// Token symbol to find top holders for (e.g., USDC, WETH, MNT)
    #[arg(long)]
    pub token: String,

    /// Number of top holders to return
    #[arg(long, default_value = "10")]
    pub top: usize,

    /// Also scan each whale's lending positions
    #[arg(long)]
    pub positions: bool,
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
}

/// Chain ID to routescan/etherscan API mapping
fn get_explorer_api(chain: &ChainConfig) -> Option<(String, Option<String>)> {
    // routescan (free, no key)
    let routescan_chains = [1, 43114, 10, 5000];
    if routescan_chains.contains(&chain.chain_id) {
        return Some((
            format!(
                "https://api.routescan.io/v2/network/mainnet/evm/{}/etherscan/api",
                chain.chain_id
            ),
            None,
        ));
    }

    // Etherscan V2 unified API (needs ETHERSCAN_API_KEY for all other chains)
    if let Ok(key) = std::env::var("ETHERSCAN_API_KEY") {
        return Some((
            format!("https://api.etherscan.io/v2/api?chainid={}", chain.chain_id),
            Some(key),
        ));
    }

    None
}

pub async fn run(
    args: WhalesArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();
    let rpc = chain.effective_rpc_url();

    // Resolve token
    let token = registry.resolve_token(&chain_key, &args.token)?;

    // Get explorer API
    let (api_base, api_key) = get_explorer_api(chain).ok_or_else(|| {
        DefiError::Unsupported(format!(
            "No explorer API available for {} (chain_id: {})",
            chain.name, chain.chain_id
        ))
    })?;

    // Build API URL
    let mut url = format!(
        "{}?module=token&action=tokenholderlist&contractaddress={:?}&page=1&offset={}",
        api_base, token.address, args.top
    );
    if let Some(ref key) = api_key {
        url.push_str(&format!("&apikey={}", key));
    }

    // Fetch top holders
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DefiError::RpcError(format!("Explorer API request failed: {e}")))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| DefiError::RpcError(format!("Explorer API parse failed: {e}")))?;

    if body["status"].as_str() != Some("1") {
        let msg = body["result"].as_str().unwrap_or("Unknown error");
        if msg.contains("API Key") || msg.contains("apikey") {
            return Err(DefiError::InvalidParam(
                "Explorer API requires API key. Set ETHERSCAN_API_KEY environment variable.".into(),
            ));
        }
        return Err(DefiError::RpcError(format!("Explorer API error: {}", msg)));
    }

    let holders = body["result"]
        .as_array()
        .ok_or_else(|| DefiError::RpcError("No holders data in response".into()))?;

    // Parse holders
    let mut whale_list: Vec<(Address, f64)> = Vec::new();
    for h in holders {
        let addr_str = h["TokenHolderAddress"].as_str().unwrap_or("");
        let qty_str = h["TokenHolderQuantity"].as_str().unwrap_or("0");
        if let Ok(addr) = addr_str.parse::<Address>() {
            let raw = qty_str.parse::<u128>().unwrap_or(0);
            let balance = raw as f64 / 10f64.powi(token.decimals as i32);
            whale_list.push((addr, balance));
        }
    }

    // Optionally scan lending positions for each whale
    let mut whale_data = Vec::new();

    if args.positions && !whale_list.is_empty() {
        // Build multicall: getUserAccountData for each whale × each lending pool
        let lending_pools: Vec<(String, Address, String)> = registry
            .get_protocols_for_chain(&chain_key)
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

        let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
        // calls layout: [whale0_pool0, whale0_pool1, ..., whale1_pool0, ...]
        for (addr, _) in &whale_list {
            for (_, pool, _) in &lending_pools {
                calls.push((
                    *pool,
                    IPool::getUserAccountDataCall { user: *addr }.abi_encode(),
                ));
            }
        }

        let results = if !calls.is_empty() {
            multicall_read(&rpc, calls).await.unwrap_or_default()
        } else {
            vec![]
        };

        let pools_per_whale = lending_pools.len();

        for (wi, (addr, balance)) in whale_list.iter().enumerate() {
            let mut positions = Vec::new();
            for (pi, (proto_name, _, iface)) in lending_pools.iter().enumerate() {
                let idx = wi * pools_per_whale + pi;
                if idx < results.len()
                    && let Some(data) = &results[idx]
                    && data.len() >= 192
                {
                    let dec: u8 = if iface == "aave_v2" { 18 } else { 8 };
                    let divisor = 10f64.powi(dec as i32);
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
                        positions.push(serde_json::json!({
                            "protocol": proto_name,
                            "collateral_usd": round2(collateral),
                            "debt_usd": round2(debt),
                            "health_factor": hf,
                        }));
                    }
                }
            }

            whale_data.push(serde_json::json!({
                "rank": wi + 1,
                "address": format!("{:?}", addr),
                "balance": round4(*balance),
                "positions": positions,
            }));
        }
    } else {
        for (wi, (addr, balance)) in whale_list.iter().enumerate() {
            whale_data.push(serde_json::json!({
                "rank": wi + 1,
                "address": format!("{:?}", addr),
                "balance": round4(*balance),
            }));
        }
    }

    let explorer_url = chain.explorer_url.as_deref().unwrap_or("");

    let result = serde_json::json!({
        "chain": chain.name,
        "token": args.token,
        "token_address": format!("{:?}", token.address),
        "decimals": token.decimals,
        "top": args.top,
        "holders": whale_data,
        "explorer": explorer_url,
    });

    output.print(&result)?;
    Ok(())
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round4(x: f64) -> f64 {
    (x * 10000.0).round() / 10000.0
}
