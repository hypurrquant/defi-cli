use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::*;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct CdpArgs {
    #[command(subcommand)]
    pub command: CdpCommand,
}

#[derive(Subcommand)]
pub enum CdpCommand {
    /// Open a new CDP position
    Open {
        #[arg(long)]
        protocol: String,
        /// Collateral token symbol or address
        #[arg(long)]
        collateral: String,
        /// Collateral amount (human-readable)
        #[arg(long)]
        amount: String,
        /// Amount of stablecoin to mint (human-readable)
        #[arg(long)]
        mint: String,
        /// Recipient address
        #[arg(long)]
        recipient: Option<String>,
    },
    /// Adjust an existing CDP position
    Adjust {
        #[arg(long)]
        protocol: String,
        /// CDP/trove ID
        #[arg(long)]
        position: String,
        /// Add collateral amount
        #[arg(long)]
        add_collateral: Option<String>,
        /// Withdraw collateral amount
        #[arg(long)]
        withdraw_collateral: Option<String>,
        /// Mint additional stablecoin
        #[arg(long)]
        mint: Option<String>,
        /// Repay stablecoin
        #[arg(long)]
        repay: Option<String>,
    },
    /// Close a CDP position
    Close {
        #[arg(long)]
        protocol: String,
        /// CDP/trove ID
        #[arg(long)]
        position: String,
    },
    /// Show CDP position info
    Info {
        #[arg(long)]
        protocol: String,
        /// CDP/trove ID
        #[arg(long)]
        position: String,
    },
}

fn parse_u256(s: &str) -> Result<U256> {
    // Parse as raw U256 (trove IDs are typically large numbers)
    U256::from_str_radix(
        s.strip_prefix("0x").unwrap_or(s),
        if s.starts_with("0x") { 16 } else { 10 },
    )
    .map_err(|e| DefiError::InvalidParam(format!("Invalid U256: {e}")))
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
    args: CdpArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        CdpCommand::Open {
            protocol,
            collateral,
            amount,
            mint,
            recipient,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let cdp = defi_protocols::factory::create_cdp_with_rpc(
                entry,
                Some(&chain.effective_rpc_url()),
            )?;

            let collateral_addr = collateral
                .parse::<Address>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid collateral address: {e}")))?;
            let collateral_amount = parse_amount_18(&amount)?;
            let debt_amount = parse_amount_18(&mint)?;
            let recipient_addr = match recipient {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("Invalid recipient: {e}")))?,
                None => Address::ZERO,
            };

            let tx = cdp
                .build_open(OpenCdpParams {
                    protocol,
                    collateral: collateral_addr,
                    collateral_amount,
                    debt_amount,
                    recipient: recipient_addr,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        CdpCommand::Adjust {
            protocol,
            position,
            add_collateral,
            withdraw_collateral,
            mint,
            repay,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let cdp = defi_protocols::factory::create_cdp(entry)?;
            let cdp_id = parse_u256(&position)?;

            let (coll_delta, is_add_coll) = if let Some(ref amt) = add_collateral {
                (Some(parse_amount_18(amt)?), true)
            } else if let Some(ref amt) = withdraw_collateral {
                (Some(parse_amount_18(amt)?), false)
            } else {
                (None, false)
            };

            let (debt_delta, is_add_debt) = if let Some(ref amt) = mint {
                (Some(parse_amount_18(amt)?), true)
            } else if let Some(ref amt) = repay {
                (Some(parse_amount_18(amt)?), false)
            } else {
                (None, false)
            };

            let tx = cdp
                .build_adjust(AdjustCdpParams {
                    protocol,
                    cdp_id,
                    collateral_delta: coll_delta,
                    debt_delta,
                    add_collateral: is_add_coll,
                    add_debt: is_add_debt,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        CdpCommand::Close { protocol, position } => {
            let entry = registry.get_protocol(&protocol)?;
            let cdp = defi_protocols::factory::create_cdp(entry)?;
            let cdp_id = parse_u256(&position)?;

            let tx = cdp.build_close(CloseCdpParams { protocol, cdp_id }).await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        CdpCommand::Info { protocol, position } => {
            let entry = registry.get_protocol(&protocol)?;
            let cdp = defi_protocols::factory::create_cdp_with_rpc(
                entry,
                Some(&chain.effective_rpc_url()),
            )?;
            let cdp_id = parse_u256(&position)?;
            let info = cdp.get_cdp_info(cdp_id).await?;
            output.print(&info)?;
        }
    }
    Ok(())
}
