use crate::output::OutputMode;
use clap::{Args, Subcommand};
use defi_core::error::Result;
use defi_core::registry::{ChainConfig, Registry};

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

pub async fn run(
    args: BridgeArgs,
    _registry: &Registry,
    _chain: &ChainConfig,
    _output: &OutputMode,
) -> Result<()> {
    match args.command {
        BridgeCommand::Send { .. } => {
            todo!("Bridge send not yet implemented")
        }
        BridgeCommand::Quote { .. } => {
            todo!("Bridge quote not yet implemented")
        }
        BridgeCommand::Status { .. } => {
            todo!("Bridge status not yet implemented")
        }
    }
}
