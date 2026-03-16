pub mod bridge;
pub mod cdp;
pub mod dex;
pub mod lending;
pub mod schema;
pub mod staking;
pub mod status;
pub mod token;
pub mod vault;
pub mod wallet;
pub mod yield_cmd;

use clap::{Parser, Subcommand};
use defi_core::error::DefiError;

#[derive(Parser)]
#[command(name = "defi", about = "DeFi CLI for HyperEVM", version)]
pub struct Cli {
    /// Output as JSON
    #[arg(long, global = true)]
    pub json: bool,

    /// Select specific output fields (comma-separated)
    #[arg(long, global = true)]
    pub fields: Option<String>,

    /// Output as newline-delimited JSON
    #[arg(long, global = true)]
    pub ndjson: bool,

    /// Target chain
    #[arg(long, global = true, default_value = "hyperevm")]
    pub chain: String,

    /// Dry-run mode (default, no broadcast)
    #[arg(long, global = true, default_value_t = true)]
    pub dry_run: bool,

    /// Actually broadcast the transaction
    #[arg(long, global = true)]
    pub broadcast: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Show chain and protocol status
    Status(status::StatusArgs),
    /// Output JSON schema for a command (agent-friendly)
    Schema(schema::SchemaArgs),
    /// DEX operations: swap, quote, compare
    Dex(dex::DexArgs),
    /// Lending operations: supply, borrow, repay, withdraw, rates, position
    Lending(lending::LendingArgs),
    /// CDP operations: open, adjust, close, info
    Cdp(cdp::CdpArgs),
    /// Bridge operations: send, quote, status
    Bridge(bridge::BridgeArgs),
    /// Liquid staking: stake, unstake, info
    Staking(staking::StakingArgs),
    /// Vault operations: deposit, withdraw, info
    Vault(vault::VaultArgs),
    /// Yield operations: compare, optimize
    Yield(yield_cmd::YieldArgs),
    /// Wallet management
    Wallet(wallet::WalletArgs),
    /// Token operations: approve, allowance, transfer
    Token(token::TokenArgs),
    /// Agent mode: read JSON commands from stdin (for AI agents)
    Agent,
}

pub async fn run(cli: Cli) -> Result<(), DefiError> {
    let registry = defi_core::registry::Registry::load_embedded()?;
    let chain = registry.get_chain(&cli.chain)?;
    let output_mode = crate::output::OutputMode::from_cli(&cli);
    let executor = crate::executor::Executor::new(cli.broadcast, Some(chain.rpc_url.clone()));

    match cli.command {
        Commands::Status(args) => status::run(args, &registry, &output_mode).await,
        Commands::Schema(args) => schema::run(args, &output_mode).await,
        Commands::Dex(args) => dex::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Lending(args) => {
            lending::run(args, &registry, chain, &executor, &output_mode).await
        }
        Commands::Cdp(args) => cdp::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Bridge(args) => bridge::run(args, &registry, chain, &output_mode).await,
        Commands::Staking(args) => {
            staking::run(args, &registry, chain, &executor, &output_mode).await
        }
        Commands::Vault(args) => vault::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Yield(args) => yield_cmd::run(args, &registry, chain, &output_mode).await,
        Commands::Wallet(args) => wallet::run(args, &registry, &output_mode).await,
        Commands::Token(args) => token::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Agent => crate::agent::run_agent(&registry, &executor).await,
    }
}
