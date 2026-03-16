use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct PortfolioArgs {
    /// Wallet address to query
    #[arg(long)]
    pub address: String,
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

pub async fn run(
    args: PortfolioArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let user: Address = args
        .address
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

    let rpc = chain.effective_rpc_url();
    let chain_key = chain.name.to_lowercase();

    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
    let mut call_labels: Vec<String> = Vec::new();

    // 1. Token balances — use all tokens registered for this chain
    let token_symbols: Vec<String> = registry
        .tokens
        .get(&chain_key)
        .map(|tokens| tokens.iter().map(|t| t.symbol.clone()).collect())
        .unwrap_or_default();

    for symbol in &token_symbols {
        if let Ok(entry) = registry.resolve_token(&chain_key, symbol)
            && entry.address != Address::ZERO
        {
            let calldata = IERC20::balanceOfCall { owner: user }.abi_encode();
            calls.push((entry.address, calldata));
            call_labels.push(format!("balance:{}", symbol));
        }
    }

    // 2. Lending positions — find all aave_v3 pools on this chain
    let lending_protocols: Vec<(&str, Address)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .filter_map(|p| p.contracts.get("pool").map(|addr| (p.name.as_str(), *addr)))
        .collect();

    for (name, pool) in &lending_protocols {
        let calldata = IPool::getUserAccountDataCall { user }.abi_encode();
        calls.push((*pool, calldata));
        call_labels.push(format!("lending:{}", name));
    }

    // 3. Native token price from first available oracle
    let mut native_price_usd = 0.0_f64;
    let oracle_entry = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .find(|p| p.interface == "aave_v3" && p.contracts.contains_key("oracle"))
        .and_then(|p| {
            let oracle = *p.contracts.get("oracle")?;
            Some(oracle)
        });

    let wrapped_native = chain.wrapped_native_address();

    if let Some(oracle_addr) = oracle_entry {
        let calldata = IAaveOracle::getAssetPriceCall {
            asset: wrapped_native,
        }
        .abi_encode();
        calls.push((oracle_addr, calldata));
        call_labels.push("price:native".to_string());
    }

    if calls.is_empty() {
        output.print(&serde_json::json!({
            "address": format!("{}", user),
            "chain": chain.name,
            "error": "No protocols or tokens configured for this chain",
        }))?;
        return Ok(());
    }

    // === Execute multicall ===
    let results = multicall_read(&rpc, calls).await?;

    // === Parse results ===
    let mut token_balances = Vec::new();
    let mut total_value_usd = 0.0_f64;
    let mut idx = 0;

    // Get native price (last call)
    if oracle_entry.is_some() {
        let price_idx = results.len() - 1;
        if let Some(data) = &results[price_idx]
            && data.len() >= 32
        {
            native_price_usd = U256::from_be_slice(&data[..32]).to::<u128>() as f64 / 1e8;
        }
    }

    // Token balances
    for symbol in &token_symbols {
        if let Ok(entry) = registry.resolve_token(&chain_key, symbol)
            && entry.address != Address::ZERO
            && idx < results.len()
        {
            let balance = match &results[idx] {
                Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]),
                _ => U256::ZERO,
            };
            if !balance.is_zero() {
                let decimals = entry.decimals;
                let bal_f64 = balance.to::<u128>() as f64 / 10f64.powi(decimals as i32);
                // Estimate USD value
                let value_usd = if symbol.contains("USD") || symbol.contains("usd") {
                    bal_f64
                } else {
                    bal_f64 * native_price_usd
                };
                total_value_usd += value_usd;
                token_balances.push(serde_json::json!({
                    "symbol": symbol,
                    "balance": format!("{:.4}", bal_f64),
                    "value_usd": format!("{:.2}", value_usd),
                }));
            }
            idx += 1;
        }
    }

    // Lending positions
    let mut lending_positions = Vec::new();
    for (name, _pool) in &lending_protocols {
        if idx < results.len() {
            if let Some(data) = &results[idx]
                && data.len() >= 192
            {
                let collateral = U256::from_be_slice(&data[0..32]).to::<u128>() as f64 / 1e8;
                let debt = U256::from_be_slice(&data[32..64]).to::<u128>() as f64 / 1e8;
                let hf_raw = U256::from_be_slice(&data[160..192]);
                let hf = if hf_raw > U256::from(u128::MAX) {
                    None
                } else {
                    let v = hf_raw.to::<u128>() as f64 / 1e18;
                    if v > 1e10 { None } else { Some(v) }
                };

                if collateral > 0.0 || debt > 0.0 {
                    total_value_usd += collateral - debt;
                    lending_positions.push(serde_json::json!({
                        "protocol": name,
                        "collateral_usd": format!("{:.2}", collateral),
                        "debt_usd": format!("{:.2}", debt),
                        "health_factor": hf,
                    }));
                }
            }
            idx += 1;
        }
    }

    let portfolio = serde_json::json!({
        "address": format!("{}", user),
        "chain": chain.name,
        "native_price_usd": format!("{:.2}", native_price_usd),
        "total_value_usd": format!("{:.2}", total_value_usd),
        "token_balances": token_balances,
        "lending_positions": lending_positions,
    });

    output.print(&portfolio)?;
    Ok(())
}
