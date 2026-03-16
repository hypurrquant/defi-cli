use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::*;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct StakingArgs {
    #[command(subcommand)]
    pub command: StakingCommand,
}

#[derive(Subcommand)]
pub enum StakingCommand {
    /// Stake tokens via liquid staking
    Stake {
        /// Protocol to use (e.g., kinetiq, sthype)
        #[arg(long)]
        protocol: String,
        /// Amount to stake (human-readable)
        #[arg(long)]
        amount: String,
        /// Recipient address
        #[arg(long)]
        recipient: Option<String>,
    },
    /// Unstake tokens
    Unstake {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// Amount to unstake (human-readable)
        #[arg(long)]
        amount: String,
        /// Recipient address
        #[arg(long)]
        recipient: Option<String>,
    },
    /// Show staking info and rates
    Info {
        /// Protocol to query (omit to show all)
        #[arg(long)]
        protocol: Option<String>,
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

pub async fn run(
    args: StakingArgs,
    registry: &Registry,
    _chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        StakingCommand::Stake {
            protocol,
            amount,
            recipient,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let staking = defi_protocols::factory::create_liquid_staking(entry)?;
            let amount_val = parse_amount_18(&amount)?;
            let recipient_addr = match recipient {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("Invalid recipient: {e}")))?,
                None => Address::ZERO,
            };

            let tx = staking
                .build_stake(StakeParams {
                    protocol,
                    amount: amount_val,
                    recipient: recipient_addr,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        StakingCommand::Unstake {
            protocol,
            amount,
            recipient,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let staking = defi_protocols::factory::create_liquid_staking(entry)?;
            let amount_val = parse_amount_18(&amount)?;
            let recipient_addr = match recipient {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("Invalid recipient: {e}")))?,
                None => Address::ZERO,
            };

            let tx = staking
                .build_unstake(UnstakeParams {
                    protocol,
                    amount: amount_val,
                    recipient: recipient_addr,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        StakingCommand::Info { protocol } => {
            match protocol {
                Some(p) => {
                    let entry = registry.get_protocol(&p)?;
                    let staking = defi_protocols::factory::create_liquid_staking_with_rpc(
                        entry,
                        Some(&_chain.effective_rpc_url()),
                    )?;
                    let info = staking.get_info().await?;
                    output.print(&info)?;
                }
                None => {
                    // List all liquid staking protocols
                    let protocols = registry.get_protocols_by_category(
                        defi_core::registry::ProtocolCategory::LiquidStaking,
                    );
                    let names: Vec<&str> = protocols.iter().map(|p| p.name.as_str()).collect();
                    output.print(&serde_json::json!({
                        "liquid_staking_protocols": names,
                        "hint": "Use --protocol <name> for details"
                    }))?;
                }
            }
        }
    }
    Ok(())
}
