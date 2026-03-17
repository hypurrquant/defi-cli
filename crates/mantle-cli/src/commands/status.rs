use clap::Args;
use defi_core::error::Result;
use defi_core::registry::{ChainConfig, Registry};

use super::OutputMode;

#[derive(Args)]
pub struct StatusArgs {}

pub async fn run(
    _args: StatusArgs,
    registry: &Registry,
    chain: &ChainConfig,
    output: &OutputMode,
) -> Result<()> {
    let chain_key = chain.name.to_lowercase();
    let protocols: Vec<serde_json::Value> = registry
        .get_protocols_for_chain(&chain_key)
        .iter()
        .map(|p| {
            serde_json::json!({
                "name": p.name,
                "slug": p.slug,
                "category": format!("{}", p.category),
                "interface": p.interface,
            })
        })
        .collect();

    let tokens: Vec<String> = registry
        .tokens
        .get(&chain_key)
        .map(|t| t.iter().map(|t| t.symbol.clone()).collect())
        .unwrap_or_default();

    let result = serde_json::json!({
        "chain": chain.name,
        "chain_id": chain.chain_id,
        "rpc_url": chain.effective_rpc_url(),
        "explorer": chain.explorer_url,
        "native_token": chain.native_token,
        "protocols": protocols,
        "tokens": tokens,
        "summary": {
            "total_protocols": protocols.len(),
            "total_tokens": tokens.len(),
        },
    });

    output.print(&result)
}
