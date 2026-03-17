pub mod bridge;
pub mod lending;
pub mod positions;
pub mod scan;
pub mod status;
pub mod swap;
pub mod whales;
pub mod yield_cmd;

use clap::{Parser, Subcommand};
use defi_core::error::DefiError;

const MANTLE_CHAIN: &str = "mantle";

#[derive(Parser)]
#[command(
    name = "mantle",
    about = "Mantle DeFi CLI — scan, swap, bridge, whales, positions",
    version
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

    /// Actually broadcast the transaction
    #[arg(long, global = true)]
    pub broadcast: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Show Mantle DeFi ecosystem status
    Status(status::StatusArgs),
    /// Multi-pattern exploit detection scanner (oracle divergence, depeg, exchange rate)
    Scan(scan::ScanArgs),
    /// Best-price swap across all Mantle DEXes via ODOS aggregator
    Swap(swap::SwapArgs),
    /// Bridge assets to/from Mantle via LI.FI
    Bridge(bridge::BridgeArgs),
    /// Find top token holders on Mantle and their lending positions
    Whales(whales::WhalesArgs),
    /// Scan wallet positions across all Mantle protocols
    Positions(positions::PositionsArgs),
    /// Query lending rates on Mantle protocols
    Lending(lending::LendingArgs),
    /// Compare yields across all Mantle lending protocols
    Yield(yield_cmd::YieldArgs),
}

pub struct OutputMode {
    pub json: bool,
    pub ndjson: bool,
    pub fields: Option<Vec<String>>,
}

impl OutputMode {
    pub fn from_cli(cli: &Cli) -> Self {
        Self {
            json: cli.json || cli.ndjson,
            ndjson: cli.ndjson,
            fields: cli
                .fields
                .as_ref()
                .map(|f| f.split(',').map(|s| s.trim().to_string()).collect()),
        }
    }

    pub fn print<T: serde::Serialize>(&self, value: &T) -> Result<(), DefiError> {
        if self.ndjson {
            let s = serde_json::to_string(value).map_err(|e| DefiError::Internal(e.to_string()))?;
            println!("{s}");
        } else if self.json {
            let mut json_val =
                serde_json::to_value(value).map_err(|e| DefiError::Internal(e.to_string()))?;
            if let Some(ref fields) = self.fields
                && let serde_json::Value::Object(ref map) = json_val
            {
                let filtered: serde_json::Map<String, serde_json::Value> = map
                    .iter()
                    .filter(|(k, _)| fields.contains(k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                json_val = serde_json::Value::Object(filtered);
            }
            println!("{}", serde_json::to_string_pretty(&json_val).unwrap());
        } else {
            println!(
                "{}",
                serde_json::to_string_pretty(value)
                    .map_err(|e| DefiError::Internal(e.to_string()))?
            );
        }
        Ok(())
    }
}

pub async fn run() -> Result<(), DefiError> {
    let cli = Cli::parse();
    let registry = defi_core::registry::Registry::load_embedded()?;
    let chain = registry.get_chain(MANTLE_CHAIN)?;
    let output = OutputMode::from_cli(&cli);

    match cli.command {
        Commands::Status(args) => status::run(args, &registry, chain, &output).await,
        Commands::Scan(args) => scan::run(args, &registry, chain, &output).await,
        Commands::Swap(args) => swap::run(args, &registry, chain, cli.broadcast, &output).await,
        Commands::Bridge(args) => bridge::run(args, &registry, &output).await,
        Commands::Whales(args) => whales::run(args, &registry, chain, &output).await,
        Commands::Positions(args) => positions::run(args, &registry, &output).await,
        Commands::Lending(args) => lending::run(args, &registry, chain, &output).await,
        Commands::Yield(args) => yield_cmd::run(args, &registry, chain, &output).await,
    }
}
