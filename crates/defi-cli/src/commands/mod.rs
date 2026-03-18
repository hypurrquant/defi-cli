pub mod alert;
pub mod arb;
pub mod bridge;
pub mod cdp;
pub mod dex;
pub mod gauge;
pub mod lending;
pub mod monitor;
pub mod portfolio;
pub mod positions;
pub mod price;
pub mod scan;
pub mod schema;
pub mod staking;
pub mod status;
pub mod swap;
pub mod token;
pub mod vault;
pub mod wallet;
pub mod whales;
pub mod yield_cmd;

use clap::{Parser, Subcommand};
use defi_core::error::DefiError;

#[derive(Parser)]
#[command(
    name = "defi",
    version,
    about = "DeFi CLI — Multi-chain DeFi toolkit",
    long_about = r#"
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  11 chains · 108 protocols · by HypurrQuant

  Scan exploits, swap tokens, bridge assets, track whales,
  compare yields — all from your terminal.
"#
)]
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
    /// Gauge operations: deposit, withdraw, claim, lock, vote (ve(3,3))
    Gauge(gauge::GaugeArgs),
    /// Lending operations: supply, borrow, repay, withdraw, rates, position
    Lending(lending::LendingArgs),
    /// CDP operations: open, adjust, close, info
    Cdp(cdp::CdpArgs),
    /// Liquid staking: stake, unstake, info
    Staking(staking::StakingArgs),
    /// Vault operations: deposit, withdraw, info
    Vault(vault::VaultArgs),
    /// Yield operations: compare, optimize
    Yield(yield_cmd::YieldArgs),
    /// Portfolio: aggregate positions across all protocols
    Portfolio(portfolio::PortfolioArgs),
    /// Monitor health factor with alerts
    Monitor(monitor::MonitorArgs),
    /// Alert on DEX vs Oracle price deviation
    Alert(alert::AlertArgs),
    /// Multi-pattern exploit detection scanner
    Scan(scan::ScanArgs),
    /// Arbitrage execution based on scan alerts
    Arb(arb::ArbArgs),
    /// Cross-chain position scanner: find all your positions everywhere
    Positions(positions::PositionsArgs),
    /// Query asset prices from oracles and DEXes
    Price(price::PriceArgs),
    /// Wallet management
    Wallet(wallet::WalletArgs),
    /// Token operations: approve, allowance, transfer
    Token(token::TokenArgs),
    /// Find top token holders (whales) and their positions
    Whales(whales::WhalesArgs),
    /// Aggregator swap: best price across all DEXes (ODOS)
    Swap(swap::SwapArgs),
    /// Cross-chain bridge: move assets between chains (LI.FI)
    Bridge(bridge::BridgeArgs),
    /// Agent mode: read JSON commands from stdin (for AI agents)
    Agent,
}

pub async fn run(cli: Cli) -> Result<(), DefiError> {
    let registry = defi_core::registry::Registry::load_embedded()?;
    let chain = registry.get_chain(&cli.chain)?;
    let output_mode = crate::output::OutputMode::from_cli(&cli);
    let executor = crate::executor::Executor::new(cli.broadcast, Some(chain.effective_rpc_url()));

    match cli.command {
        Commands::Status(args) => status::run(args, &registry, chain, &output_mode).await,
        Commands::Schema(args) => schema::run(args, &output_mode).await,
        Commands::Dex(args) => dex::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Gauge(args) => gauge::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Lending(args) => {
            lending::run(args, &registry, chain, &executor, &output_mode).await
        }
        Commands::Cdp(args) => cdp::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Staking(args) => {
            staking::run(args, &registry, chain, &executor, &output_mode).await
        }
        Commands::Vault(args) => vault::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Yield(args) => yield_cmd::run(args, &registry, chain, &output_mode).await,
        Commands::Portfolio(args) => portfolio::run(args, &registry, chain, &output_mode).await,
        Commands::Monitor(args) => monitor::run(args, &registry, chain, &output_mode).await,
        Commands::Alert(args) => alert::run(args, &registry, chain, &output_mode).await,
        Commands::Scan(args) => scan::run(args, &registry, chain, &output_mode).await,
        Commands::Arb(args) => arb::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Positions(args) => positions::run(args, &registry, &output_mode).await,
        Commands::Price(args) => price::run(args, &registry, chain, &output_mode).await,
        Commands::Wallet(args) => wallet::run(args, &registry, &output_mode).await,
        Commands::Token(args) => token::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Whales(args) => whales::run(args, &registry, chain, &output_mode).await,
        Commands::Swap(args) => swap::run(args, &registry, chain, &executor, &output_mode).await,
        Commands::Bridge(args) => bridge::run(args, &registry, &output_mode).await,
        Commands::Agent => crate::agent::run_agent(&registry, &executor).await,
    }
}
