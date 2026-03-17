use clap::{Args, Subcommand};

use defi_core::error::Result;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use super::OutputMode;

#[derive(Args)]
pub struct LendingArgs {
    #[command(subcommand)]
    pub command: LendingCommands,
}

#[derive(Subcommand)]
pub enum LendingCommands {
    /// Show current lending rates for an asset across Mantle protocols
    Rates(RatesArgs),
}

#[derive(Args)]
pub struct RatesArgs {
    /// Asset symbol (e.g., USDC, WETH)
    #[arg(long)]
    pub asset: String,
}

pub async fn run(
    args: LendingArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        LendingCommands::Rates(rates_args) => run_rates(rates_args, registry, chain, output).await,
    }
}

async fn run_rates(
    args: RatesArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();
    let asset_entry = registry.resolve_token(&chain_key, &args.asset)?;

    let lending_protocols: Vec<_> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .filter(|p| p.category == ProtocolCategory::Lending && p.interface == "aave_v3")
        .cloned()
        .cloned()
        .collect();

    let mut rates = Vec::new();

    for proto in &lending_protocols {
        let adapter = defi_protocols::factory::create_lending_with_rpc(
            proto,
            Some(&chain.effective_rpc_url()),
        );
        if let Ok(adapter) = adapter
            && let Ok(rate) = adapter.get_rates(asset_entry.address).await
        {
            rates.push(serde_json::json!({
                "protocol": rate.protocol,
                "asset": args.asset,
                "supply_apy": rate.supply_apy,
                "borrow_variable_apy": rate.borrow_variable_apy,
                "borrow_stable_apy": rate.borrow_stable_apy,
                "utilization": rate.utilization,
            }));
        }
    }

    let best_supply = rates
        .iter()
        .max_by(|a, b| {
            a["supply_apy"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&b["supply_apy"].as_f64().unwrap_or(0.0))
                .unwrap()
        })
        .and_then(|r| r["protocol"].as_str().map(|s| s.to_string()));

    output.print(&serde_json::json!({
        "chain": "Mantle",
        "asset": args.asset,
        "rates": rates,
        "best_supply": best_supply,
    }))
}
