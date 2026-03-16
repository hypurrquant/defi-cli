use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};
use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, Registry};
use defi_core::types::*;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct BridgeArgs {
    #[command(subcommand)]
    pub command: BridgeCommand,
}

#[derive(Subcommand)]
pub enum BridgeCommand {
    /// Send tokens across chains
    Send {
        /// Bridge protocol to use
        #[arg(long)]
        protocol: String,
        /// Token to bridge
        #[arg(long)]
        token: String,
        /// Amount to bridge
        #[arg(long)]
        amount: String,
        /// Destination chain
        #[arg(long)]
        destination: String,
        /// Recipient address on destination chain
        #[arg(long)]
        recipient: Option<String>,
    },
    /// Get a bridge quote
    Quote {
        /// Bridge protocol to use
        #[arg(long)]
        protocol: Option<String>,
        /// Token to bridge
        #[arg(long)]
        token: String,
        /// Amount to bridge
        #[arg(long)]
        amount: String,
        /// Destination chain
        #[arg(long)]
        destination: String,
    },
    /// Check bridge transaction status
    Status {
        /// Transaction hash to check
        #[arg(long)]
        tx_hash: String,
        /// Bridge protocol used
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
    args: BridgeArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        BridgeCommand::Send {
            protocol,
            token,
            amount,
            destination,
            recipient,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let bridge = defi_protocols::factory::create_bridge(entry)?;
            let token_addr = registry
                .resolve_token(&chain.name.to_lowercase(), &token)
                .map(|t| t.address)
                .unwrap_or_else(|_| token.parse::<Address>().unwrap_or(Address::ZERO));
            let amount_val = parse_amount_18(&amount)?;
            let recipient_addr = match recipient {
                Some(r) => r
                    .parse::<Address>()
                    .map_err(|e| DefiError::InvalidParam(format!("Invalid recipient: {e}")))?,
                None => Address::ZERO,
            };

            let tx = bridge
                .build_send(BridgeSendParams {
                    protocol,
                    token: token_addr,
                    amount: amount_val,
                    destination_chain: destination,
                    recipient: recipient_addr,
                })
                .await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        BridgeCommand::Quote {
            protocol,
            token,
            amount,
            destination,
        } => {
            let protocol_name = protocol.unwrap_or_else(|| "hyperlane".to_string());
            let entry = registry.get_protocol(&protocol_name)?;
            let bridge = defi_protocols::factory::create_bridge(entry)?;
            let token_addr = registry
                .resolve_token(&chain.name.to_lowercase(), &token)
                .map(|t| t.address)
                .unwrap_or_else(|_| token.parse::<Address>().unwrap_or(Address::ZERO));
            let amount_val = parse_amount_18(&amount)?;

            let quote = bridge
                .quote(BridgeSendParams {
                    protocol: protocol_name,
                    token: token_addr,
                    amount: amount_val,
                    destination_chain: destination,
                    recipient: Address::ZERO,
                })
                .await?;
            output.print(&quote)?;
        }
        BridgeCommand::Status { tx_hash, .. } => {
            let _ = &chain.effective_rpc_url();
            output.print(&serde_json::json!({
                "tx_hash": tx_hash,
                "status": "pending",
                "hint": "Bridge status tracking requires indexer integration"
            }))?;
        }
    }
    Ok(())
}
