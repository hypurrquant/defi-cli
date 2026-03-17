use clap::{Args, Subcommand};

use defi_core::error::Result;
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};

use super::OutputMode;

#[derive(Args)]
pub struct YieldArgs {
    #[command(subcommand)]
    pub command: YieldCommands,
}

#[derive(Subcommand)]
pub enum YieldCommands {
    /// Compare lending rates across all Mantle protocols for an asset
    Compare(CompareArgs),
}

#[derive(Args)]
pub struct CompareArgs {
    /// Asset symbol (e.g., USDC, WETH, USDe)
    #[arg(long)]
    pub asset: String,
}

pub async fn run(
    args: YieldArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        YieldCommands::Compare(compare_args) => {
            run_compare(compare_args, registry, chain, output).await
        }
    }
}

async fn run_compare(
    args: CompareArgs,
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
                "supply_apy": rate.supply_apy,
                "borrow_variable_apy": rate.borrow_variable_apy,
                "borrow_stable_apy": rate.borrow_stable_apy,
                "utilization": rate.utilization,
            }));
        }
    }

    rates.sort_by(|a, b| {
        b["supply_apy"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["supply_apy"].as_f64().unwrap_or(0.0))
            .unwrap()
    });

    let best_supply = rates
        .first()
        .and_then(|r| r["protocol"].as_str().map(|s| s.to_string()));
    let best_borrow = rates
        .iter()
        .min_by(|a, b| {
            a["borrow_variable_apy"]
                .as_f64()
                .unwrap_or(f64::MAX)
                .partial_cmp(&b["borrow_variable_apy"].as_f64().unwrap_or(f64::MAX))
                .unwrap()
        })
        .and_then(|r| r["protocol"].as_str().map(|s| s.to_string()));

    output.print(&serde_json::json!({
        "chain": "Mantle",
        "asset": args.asset,
        "rates": rates,
        "best_supply": best_supply,
        "best_borrow": best_borrow,
    }))
}
