use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct GaugeArgs {
    #[command(subcommand)]
    pub command: GaugeCommand,
}

#[derive(Subcommand)]
pub enum GaugeCommand {
    /// Deposit LP tokens into a gauge for farming
    Deposit {
        /// Protocol to use (e.g., ramses-cl, nest-v1)
        #[arg(long)]
        protocol: String,
        /// Gauge contract address
        #[arg(long)]
        gauge: String,
        /// LP token amount (raw U256)
        #[arg(long)]
        amount: String,
        /// veNFT token ID for boosted rewards (optional)
        #[arg(long)]
        ve_nft: Option<String>,
    },
    /// Withdraw LP tokens from a gauge
    Withdraw {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// Gauge contract address
        #[arg(long)]
        gauge: String,
        /// LP token amount (raw U256)
        #[arg(long)]
        amount: String,
    },
    /// Claim earned rewards from a gauge
    Claim {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// Gauge contract address
        #[arg(long)]
        gauge: String,
    },
    /// Create a veNFT lock
    Lock {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// Amount to lock (human-readable, 18 decimals)
        #[arg(long)]
        amount: String,
        /// Lock duration in days
        #[arg(long, default_value = "365")]
        days: u64,
    },
    /// Vote on gauge emissions with veNFT
    Vote {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// veNFT token ID
        #[arg(long)]
        ve_nft: String,
        /// Pool addresses (comma-separated)
        #[arg(long)]
        pools: String,
        /// Vote weights (comma-separated, same order as pools)
        #[arg(long)]
        weights: String,
    },
}

fn parse_amount_18(amount: &str) -> Result<U256> {
    let parts: Vec<&str> = amount.split('.').collect();
    let (whole, frac) = match parts.len() {
        1 => (parts[0], ""),
        2 => (parts[0], parts[1]),
        _ => return Err(DefiError::InvalidParam("Invalid amount format".to_string())),
    };
    let whole_val = U256::from(
        whole
            .parse::<u64>()
            .map_err(|e| DefiError::InvalidParam(format!("Invalid amount: {e}")))?,
    );
    let frac_val = if frac.is_empty() {
        U256::ZERO
    } else {
        let frac_padded = format!("{:0<18}", frac);
        U256::from(
            frac_padded[..18]
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid fractional amount: {e}")))?,
        )
    };
    Ok(whole_val * U256::from(10u64).pow(U256::from(18)) + frac_val)
}

fn parse_address(s: &str) -> Result<Address> {
    s.parse::<Address>()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address '{s}': {e}")))
}

fn parse_u256(s: &str) -> Result<U256> {
    U256::from_str_radix(s, 10)
        .map_err(|e| DefiError::InvalidParam(format!("Invalid U256 '{s}': {e}")))
}

pub async fn run(
    args: GaugeArgs,
    registry: &Registry,
    _chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        GaugeCommand::Deposit {
            protocol,
            gauge,
            amount,
            ve_nft,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let gauge_adapter = defi_protocols::factory::create_gauge(entry)?;
            let gauge_addr = parse_address(&gauge)?;
            let amount_val = parse_amount_18(&amount)?;
            let token_id = ve_nft.as_deref().map(parse_u256).transpose()?;

            let tx = gauge_adapter
                .build_deposit(gauge_addr, amount_val, token_id)
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        GaugeCommand::Withdraw {
            protocol,
            gauge,
            amount,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let gauge_adapter = defi_protocols::factory::create_gauge(entry)?;
            let gauge_addr = parse_address(&gauge)?;
            let amount_val = parse_amount_18(&amount)?;

            let tx = gauge_adapter.build_withdraw(gauge_addr, amount_val).await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        GaugeCommand::Claim { protocol, gauge } => {
            let entry = registry.get_protocol(&protocol)?;
            let gauge_adapter = defi_protocols::factory::create_gauge(entry)?;
            let gauge_addr = parse_address(&gauge)?;

            let tx = gauge_adapter.build_claim_rewards(gauge_addr).await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        GaugeCommand::Lock {
            protocol,
            amount,
            days,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let system = defi_protocols::factory::create_gauge(entry)?;
            let amount_val = parse_amount_18(&amount)?;
            let lock_duration_secs = days * 86400;

            let tx = system
                .build_create_lock(amount_val, lock_duration_secs)
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        GaugeCommand::Vote {
            protocol,
            ve_nft,
            pools,
            weights,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let system = defi_protocols::factory::create_gauge(entry)?;
            let token_id = parse_u256(&ve_nft)?;
            let pool_addrs: Result<Vec<Address>> =
                pools.split(',').map(|s| parse_address(s.trim())).collect();
            let weight_vals: Result<Vec<U256>> =
                weights.split(',').map(|s| parse_u256(s.trim())).collect();

            let tx = system
                .build_vote(token_id, pool_addrs?, weight_vals?)
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
    }
    Ok(())
}
