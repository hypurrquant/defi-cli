use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::*;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct LendingArgs {
    #[command(subcommand)]
    pub command: LendingCommand,
}

#[derive(Subcommand)]
pub enum LendingCommand {
    /// Supply an asset to a lending protocol
    Supply {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        asset: String,
        #[arg(long)]
        amount: String,
        /// On behalf of address (defaults to zero — must set for broadcast)
        #[arg(long)]
        on_behalf_of: Option<String>,
    },
    /// Borrow an asset from a lending protocol
    Borrow {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        asset: String,
        #[arg(long)]
        amount: String,
        /// Interest rate mode: variable or stable
        #[arg(long, default_value = "variable")]
        rate_mode: String,
        #[arg(long)]
        on_behalf_of: Option<String>,
    },
    /// Repay a borrowed asset
    Repay {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        asset: String,
        /// Amount to repay (use "max" for U256::MAX)
        #[arg(long)]
        amount: String,
        #[arg(long, default_value = "variable")]
        rate_mode: String,
        #[arg(long)]
        on_behalf_of: Option<String>,
    },
    /// Withdraw a supplied asset
    Withdraw {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        asset: String,
        /// Amount to withdraw (use "max" for U256::MAX)
        #[arg(long)]
        amount: String,
        #[arg(long)]
        to: Option<String>,
    },
    /// Show current lending rates
    Rates {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        asset: String,
    },
    /// Show current lending position
    Position {
        #[arg(long)]
        protocol: String,
        #[arg(long)]
        address: String,
    },
}

fn resolve_asset(registry: &Registry, chain: &str, asset: &str) -> Result<Address> {
    if let Ok(addr) = asset.parse::<Address>() {
        return Ok(addr);
    }
    Ok(registry.resolve_token(chain, asset)?.address)
}

fn parse_addr(s: Option<&str>) -> Result<Address> {
    match s {
        Some(a) => a
            .parse::<Address>()
            .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}"))),
        None => Ok(Address::ZERO),
    }
}

fn parse_rate_mode(s: &str) -> Result<InterestRateMode> {
    match s.to_lowercase().as_str() {
        "variable" => Ok(InterestRateMode::Variable),
        "stable" => Ok(InterestRateMode::Stable),
        other => Err(DefiError::InvalidParam(format!(
            "Invalid rate mode: {other}"
        ))),
    }
}

fn parse_amount_raw(amount: &str, decimals: u8) -> Result<U256> {
    if amount == "max" {
        return Ok(U256::MAX);
    }
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
        let frac_padded = format!("{:0<width$}", frac, width = decimals as usize);
        let frac_trimmed = &frac_padded[..decimals as usize];
        U256::from(
            frac_trimmed
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid fractional amount: {e}")))?,
        )
    };
    let decimals_mul = U256::from(10u64).pow(U256::from(decimals));
    Ok(whole_val * decimals_mul + frac_val)
}

pub async fn run(
    args: LendingArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();

    match args.command {
        LendingCommand::Supply {
            protocol,
            asset,
            amount,
            on_behalf_of,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending = defi_protocols::factory::create_lending(entry)?;
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let decimals = registry
                .resolve_token(&chain_key, &asset)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_val = parse_amount_raw(&amount, decimals)?;
            let on_behalf = parse_addr(on_behalf_of.as_deref())?;

            let tx = lending
                .build_supply(SupplyParams {
                    protocol,
                    asset: asset_addr,
                    amount: amount_val,
                    on_behalf_of: on_behalf,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        LendingCommand::Borrow {
            protocol,
            asset,
            amount,
            rate_mode,
            on_behalf_of,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending = defi_protocols::factory::create_lending(entry)?;
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let decimals = registry
                .resolve_token(&chain_key, &asset)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_val = parse_amount_raw(&amount, decimals)?;
            let on_behalf = parse_addr(on_behalf_of.as_deref())?;

            let tx = lending
                .build_borrow(BorrowParams {
                    protocol,
                    asset: asset_addr,
                    amount: amount_val,
                    interest_rate_mode: parse_rate_mode(&rate_mode)?,
                    on_behalf_of: on_behalf,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        LendingCommand::Repay {
            protocol,
            asset,
            amount,
            rate_mode,
            on_behalf_of,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending = defi_protocols::factory::create_lending(entry)?;
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let decimals = registry
                .resolve_token(&chain_key, &asset)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_val = parse_amount_raw(&amount, decimals)?;
            let on_behalf = parse_addr(on_behalf_of.as_deref())?;

            let tx = lending
                .build_repay(RepayParams {
                    protocol,
                    asset: asset_addr,
                    amount: amount_val,
                    interest_rate_mode: parse_rate_mode(&rate_mode)?,
                    on_behalf_of: on_behalf,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        LendingCommand::Withdraw {
            protocol,
            asset,
            amount,
            to,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending = defi_protocols::factory::create_lending(entry)?;
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let decimals = registry
                .resolve_token(&chain_key, &asset)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_val = parse_amount_raw(&amount, decimals)?;
            let to_addr = parse_addr(to.as_deref())?;

            let tx = lending
                .build_withdraw(WithdrawParams {
                    protocol,
                    asset: asset_addr,
                    amount: amount_val,
                    to: to_addr,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        LendingCommand::Rates { protocol, asset } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending =
                defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.rpc_url))?;
            let asset_addr = resolve_asset(registry, &chain_key, &asset)?;
            let rates = lending.get_rates(asset_addr).await?;
            output.print(&rates)?;
        }
        LendingCommand::Position { protocol, address } => {
            let entry = registry.get_protocol(&protocol)?;
            let lending =
                defi_protocols::factory::create_lending_with_rpc(entry, Some(&chain.rpc_url))?;
            let user = address
                .parse::<Address>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;
            let position = lending.get_user_position(user).await?;
            output.print(&position)?;
        }
    }
    Ok(())
}
