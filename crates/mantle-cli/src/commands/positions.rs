use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ProtocolCategory, Registry};

use super::{MANTLE_CHAIN, OutputMode};

#[derive(Args)]
pub struct PositionsArgs {
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
            uint256, uint256, uint256, uint256, uint256, uint256
        );
    }
    interface IAaveOracle {
        function getAssetPrice(address asset) external view returns (uint256);
    }
}

pub async fn run(args: PositionsArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let user: Address = args
        .address
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

    let chain = registry.get_chain(MANTLE_CHAIN)?;
    let rpc = chain.effective_rpc_url();
    let chain_key = MANTLE_CHAIN.to_string();

    let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();

    enum CallType {
        TokenBalance { symbol: String, decimals: u8 },
        LendingPosition { protocol: String, interface: String },
        NativePrice,
    }
    let mut call_types: Vec<CallType> = Vec::new();

    let tokens = registry.tokens.get(&chain_key).cloned().unwrap_or_default();
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

    for (name, pool, iface) in &lending_pools {
        call_types.push(CallType::LendingPosition {
            protocol: name.clone(),
            interface: iface.clone(),
        });
        calls.push((*pool, IPool::getUserAccountDataCall { user }.abi_encode()));
    }

    let oracle_addr = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .find(|p| p.interface == "aave_v3" && p.contracts.contains_key("oracle"))
        .and_then(|p| p.contracts.get("oracle").copied());

    if let Some(oracle) = oracle_addr {
        call_types.push(CallType::NativePrice);
        calls.push((
            oracle,
            IAaveOracle::getAssetPriceCall {
                asset: chain.wrapped_native_address(),
            }
            .abi_encode(),
        ));
    }

    if calls.is_empty() {
        return output.print(&serde_json::json!({"address": format!("{}", user), "chain": "Mantle", "error": "No resources"}));
    }

    let results = multicall_read(&rpc, calls).await?;

    let native_price = if oracle_addr.is_some() {
        let idx = results.len() - 1;
        match &results[idx] {
            Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]).to::<u128>() as f64 / 1e8,
            _ => 0.0,
        }
    } else {
        0.0
    };

    let mut token_balances = Vec::new();
    let mut lending_positions = Vec::new();
    let mut total_value = 0.0_f64;
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
                    let bal = balance.to::<u128>() as f64 / 10f64.powi(*decimals as i32);
                    let usd = estimate_usd(symbol, bal, native_price);
                    if usd > 0.01 {
                        total_value += usd;
                        token_balances.push(serde_json::json!({"symbol": symbol, "balance": round4(bal), "value_usd": round2(usd)}));
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
                    let dec: u8 = if iface == "aave_v2" { 18 } else { 8 };
                    let div = 10f64.powi(dec as i32);
                    let coll = U256::from_be_slice(&data[0..32]).to::<u128>() as f64 / div;
                    let debt = U256::from_be_slice(&data[32..64]).to::<u128>() as f64 / div;
                    if coll > 0.01 || debt > 0.01 {
                        let hf_raw = U256::from_be_slice(&data[160..192]);
                        let hf = if hf_raw > U256::from(u128::MAX) {
                            None
                        } else {
                            let v = hf_raw.to::<u128>() as f64 / 1e18;
                            if v > 1e10 { None } else { Some(round2(v)) }
                        };
                        total_value += coll - debt;
                        total_coll += coll;
                        total_debt += debt;
                        lending_positions.push(serde_json::json!({"protocol": protocol, "collateral_usd": round2(coll), "debt_usd": round2(debt), "net_usd": round2(coll - debt), "health_factor": hf}));
                    }
                }
            }
            CallType::NativePrice => {}
        }
    }

    output.print(&serde_json::json!({
        "address": format!("{}", user), "chain": "Mantle",
        "total_value_usd": round2(total_value),
        "total_collateral_usd": round2(total_coll),
        "total_debt_usd": round2(total_debt),
        "token_balances": token_balances,
        "lending_positions": lending_positions,
    }))
}

fn estimate_usd(symbol: &str, balance: f64, native_price: f64) -> f64 {
    let s = symbol.to_uppercase();
    if s.contains("USD") || s.contains("DAI") {
        balance
    } else if s.contains("BTC") || s.contains("FBTC") {
        balance * 75000.0
    } else if s == "WETH" || s == "METH" || s == "CMETH" {
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
