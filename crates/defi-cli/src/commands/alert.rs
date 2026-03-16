use alloy::primitives::{Address, U256};
use alloy::sol_types::SolCall;
use clap::Args;

use defi_core::error::{DefiError, Result};
use defi_core::multicall::multicall_read;
use defi_core::registry::{ChainConfig, Registry};

use crate::output::OutputMode;

#[derive(Args)]
pub struct AlertArgs {
    /// Asset symbol to monitor (e.g., THE, CAKE, WHYPE)
    #[arg(long)]
    pub asset: String,

    /// DEX protocol to get spot price from
    #[arg(long)]
    pub dex: String,

    /// Lending protocol to get oracle price from
    #[arg(long)]
    pub lending: String,

    /// Alert threshold in percent (default: 5.0)
    #[arg(long, default_value = "5.0")]
    pub threshold: f64,

    /// Polling interval in seconds (default: 10)
    #[arg(long, default_value = "10")]
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
        function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    }

}

pub async fn run(
    args: AlertArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let rpc = chain.effective_rpc_url();
    let chain_key = chain.name.to_lowercase();

    // Resolve asset address
    let asset_entry = registry.resolve_token(&chain_key, &args.asset)?;
    let asset_addr = asset_entry.address;
    let asset_decimals = asset_entry.decimals;

    // Find lending protocol oracle
    let lending_entry = registry.get_protocol(&args.lending)?;
    let oracle_addr = lending_entry
        .contracts
        .get("oracle")
        .copied()
        .ok_or_else(|| {
            DefiError::ContractError(format!("No oracle configured for {}", args.lending))
        })?;

    // Find DEX router and a stablecoin for price reference
    let dex_entry = registry.get_protocol(&args.dex)?;
    let router_addr = dex_entry.contracts.get("router").copied().ok_or_else(|| {
        DefiError::ContractError(format!("No router configured for {}", args.dex))
    })?;

    // Find a stablecoin on this chain for DEX price quote
    let stable = registry
        .resolve_token(&chain_key, "USDC")
        .or_else(|_| registry.resolve_token(&chain_key, "USDT"))
        .or_else(|_| registry.resolve_token(&chain_key, "USDT0"))?;

    let wrapped_native = chain.wrapped_native_address();

    loop {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 1. Get oracle price
        let oracle_call = IAaveOracle::getAssetPriceCall { asset: asset_addr }.abi_encode();

        // 2. Get DEX price via getAmountsOut (asset → wrapped_native → stablecoin)
        let amount_in = U256::from(10u64).pow(U256::from(asset_decimals)); // 1 token
        let path = if asset_addr == wrapped_native {
            vec![asset_addr, stable.address]
        } else {
            vec![asset_addr, wrapped_native, stable.address]
        };
        let dex_call = IUniV2Router::getAmountsOutCall {
            amountIn: amount_in,
            path,
        }
        .abi_encode();

        let results = multicall_read(
            &rpc,
            vec![(oracle_addr, oracle_call), (router_addr, dex_call)],
        )
        .await?;

        // Parse oracle price (8 decimals for Aave/Chainlink)
        let oracle_price = match &results[0] {
            Some(b) if b.len() >= 32 => U256::from_be_slice(&b[..32]).to::<u128>() as f64 / 1e8,
            _ => 0.0,
        };

        // Parse DEX price (last element of amounts array)
        let dex_price = match &results[1] {
            Some(b) if b.len() >= 128 => {
                // ABI-decoded array: offset(32) + length(32) + elements(32 each)
                let num_elements = if b.len() >= 64 {
                    U256::from_be_slice(&b[32..64]).to::<usize>()
                } else {
                    0
                };
                if num_elements > 0 {
                    let last_offset = 64 + (num_elements - 1) * 32;
                    if b.len() >= last_offset + 32 {
                        let raw = U256::from_be_slice(&b[last_offset..last_offset + 32]);
                        raw.to::<u128>() as f64 / 10f64.powi(stable.decimals as i32)
                    } else {
                        0.0
                    }
                } else {
                    0.0
                }
            }
            _ => 0.0,
        };

        let deviation = if oracle_price > 0.0 && dex_price > 0.0 {
            ((dex_price - oracle_price) / oracle_price * 100.0).abs()
        } else {
            0.0
        };

        let alert = deviation > args.threshold;

        let direction = if dex_price > oracle_price {
            "DEX > Oracle (sell on DEX, borrow from lending)"
        } else {
            "Oracle > DEX (buy on DEX, use as collateral)"
        };

        let check = serde_json::json!({
            "timestamp": timestamp,
            "chain": chain.name,
            "asset": args.asset,
            "oracle_price": format!("{:.4}", oracle_price),
            "dex_price": format!("{:.4}", dex_price),
            "deviation_pct": format!("{:.2}", deviation),
            "threshold_pct": args.threshold,
            "alert": alert,
            "direction": if alert { direction } else { "normal" },
            "oracle": args.lending,
            "dex": args.dex,
        });

        if alert {
            eprintln!(
                "ALERT: {} price deviation {:.1}% — oracle ${:.4} vs DEX ${:.4} on {} — {}",
                args.asset, deviation, oracle_price, dex_price, chain.name, direction
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
