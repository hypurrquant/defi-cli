use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct VaultArgs {
    #[command(subcommand)]
    pub command: VaultCommand,
}

#[derive(Subcommand)]
pub enum VaultCommand {
    /// Deposit assets into a vault
    Deposit {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        amount: String,
        #[arg(long)]
        receiver: Option<String>,
    },
    /// Withdraw assets from a vault
    Withdraw {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        amount: String,
        #[arg(long)]
        receiver: Option<String>,
        #[arg(long)]
        owner: Option<String>,
    },
    /// Show vault info
    Info {
        #[arg(long)]
        protocol: Option<String>,
    },
}

fn parse_amount_18(amount: &str) -> Result<U256> {
    let parts: Vec<&str> = amount.split('.').collect();
    let (whole, frac) = match parts.len() {
        1 => (parts[0], ""),
        2 => (parts[0], parts[1]),
        _ => return Err(DefiError::InvalidParam("Invalid amount".to_string())),
    };
    let whole_val = U256::from(
        whole
            .parse::<u64>()
            .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
    );
    let frac_val = if frac.is_empty() {
        U256::ZERO
    } else {
        let padded = format!("{:0<18}", frac);
        U256::from(
            padded[..18]
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
        )
    };
    Ok(whole_val * U256::from(10u64).pow(U256::from(18)) + frac_val)
}

pub async fn run(
    args: VaultArgs,
    registry: &Registry,
    _chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        VaultCommand::Deposit {
            protocol,
            amount,
            receiver,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let vault = defi_protocols::factory::create_vault(entry)?;
            let amount_val = parse_amount_18(&amount)?;
            let receiver_addr = match receiver {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
                None => Address::ZERO,
            };
            let tx = vault.build_deposit(amount_val, receiver_addr).await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        VaultCommand::Withdraw {
            protocol,
            amount,
            receiver,
            owner,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let vault = defi_protocols::factory::create_vault(entry)?;
            let amount_val = parse_amount_18(&amount)?;
            let receiver_addr = match receiver {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
                None => Address::ZERO,
            };
            let owner_addr = match owner {
                Some(o) => o
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
                None => receiver_addr,
            };
            let tx = vault
                .build_withdraw(amount_val, receiver_addr, owner_addr)
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        VaultCommand::Info { protocol } => match protocol {
            Some(p) => {
                let entry = registry.get_protocol(&p)?;
                let vault =
                    defi_protocols::factory::create_vault_with_rpc(entry, Some(&_chain.rpc_url))?;
                let info = vault.get_vault_info().await?;
                output.print(&info)?;
            }
            None => {
                let vaults = registry
                    .get_protocols_by_category(defi_core::registry::ProtocolCategory::Vault);
                let aggs = registry.get_protocols_by_category(
                    defi_core::registry::ProtocolCategory::YieldAggregator,
                );
                let names: Vec<&str> = vaults
                    .iter()
                    .chain(aggs.iter())
                    .map(|p| p.name.as_str())
                    .collect();
                output.print(&serde_json::json!({
                    "vault_protocols": names,
                    "hint": "Use --protocol <name> for details"
                }))?;
            }
        },
    }
    Ok(())
}
