use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct MonitorArgs {
    /// Wallet address to monitor
    #[arg(long)]
    pub address: String,

    /// Health factor alert threshold (default: 1.5)
    #[arg(long, default_value = "1.5")]
    pub threshold: f64,

    /// Polling interval in seconds (default: 60)
    #[arg(long, default_value = "60")]
    pub interval: u64,

    /// Single check then exit
    #[arg(long)]
    pub once: bool,
}

alloy::sol! {
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

pub async fn run(
    args: MonitorArgs,
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

    // Find all Aave V3 pools on this chain dynamically
    let lending_pools: Vec<(String, Address)> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .filter_map(|p| p.contracts.get("pool").map(|addr| (p.name.clone(), *addr)))
        .collect();

    if lending_pools.is_empty() {
        return Err(DefiError::Unsupported(format!(
            "No Aave V3 lending pools found on {}",
            chain.name
        )));
    }

    loop {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let calls: Vec<(Address, Vec<u8>)> = lending_pools
            .iter()
            .map(|(_, pool)| {
                let calldata = IPool::getUserAccountDataCall { user }.abi_encode();
                (*pool, calldata)
            })
            .collect();

        let results = multicall_read(&rpc, calls).await?;

        let mut positions = Vec::new();
        let mut any_alert = false;

        for (i, (name, _)) in lending_pools.iter().enumerate() {
            if let Some(data) = &results[i]
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

                let below = matches!(hf, Some(h) if h < args.threshold);
                any_alert |= below;

                if collateral > 0.0 || debt > 0.0 {
                    positions.push(serde_json::json!({
                        "protocol": name,
                        "collateral_usd": format!("{:.2}", collateral),
                        "debt_usd": format!("{:.2}", debt),
                        "health_factor": hf,
                        "below_threshold": below,
                    }));
                }
            }
        }

        let check = serde_json::json!({
            "timestamp": timestamp,
            "chain": chain.name,
            "address": format!("{}", user),
            "threshold": args.threshold,
            "alert": any_alert,
            "positions": positions,
        });

        if any_alert {
            eprintln!(
                "ALERT: Health factor below {} for {} on {}",
                args.threshold, user, chain.name
            );
        }

        output.print(&check)?;

        if args.once {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(args.interval)).await;
    }

    Ok(())
}
