use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, Registry};

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

struct LendingPool {
    name: &'static str,
    pool: Address,
}

const LENDING_POOLS: &[LendingPool] = &[
    LendingPool {
        name: "HyperLend",
        pool: alloy::primitives::address!("00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b"),
    },
    LendingPool {
        name: "HypurrFi",
        pool: alloy::primitives::address!("ceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b"),
    },
];

pub async fn run(
    args: MonitorArgs,
    _registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let user: Address = args
        .address
        .parse()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

    let rpc = chain.effective_rpc_url();

    loop {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Build multicall: getUserAccountData for each lending pool
        let calls: Vec<(Address, Vec<u8>)> = LENDING_POOLS
            .iter()
            .map(|p| {
                let calldata = IPool::getUserAccountDataCall { user }.abi_encode();
                (p.pool, calldata)
            })
            .collect();

        let results = multicall_read(&rpc, calls).await?;

        let mut positions = Vec::new();
        let mut any_alert = false;

        for (i, pool) in LENDING_POOLS.iter().enumerate() {
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
                        "protocol": pool.name,
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
            "address": format!("{}", user),
            "threshold": args.threshold,
            "alert": any_alert,
            "positions": positions,
        });

        if any_alert {
            eprintln!(
                "⚠ ALERT: Health factor below {} for {}",
                args.threshold, user
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
