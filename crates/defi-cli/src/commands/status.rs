use alloy::primitives::Address;
use alloy::providers::Provider;
use clap::Args;
use serde::Serialize;

use defi_core::error::{DefiError, Result};
use defi_core::provider::build_provider;
use defi_core::registry::Registry;

use crate::output::OutputMode;

#[derive(Args)]
pub struct StatusArgs {
    /// Verify contract addresses on-chain via Multicall3
    #[arg(long)]
    pub verify: bool,
}

#[derive(Serialize)]
struct StatusOutput {
    chain: String,
    chain_id: u64,
    rpc_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    block_number: Option<u64>,
    protocols: Vec<ProtocolStatus>,
    summary: StatusSummary,
}

#[derive(Serialize)]
struct StatusSummary {
    total_protocols: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    verified_contracts: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    invalid_contracts: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    placeholder_contracts: Option<usize>,
}

#[derive(Serialize)]
struct ProtocolStatus {
    name: String,
    category: String,
    interface: String,
    contracts: Vec<ContractStatus>,
}

#[derive(Serialize)]
struct ContractStatus {
    name: String,
    address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_code: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
}

fn is_placeholder(addr: &Address) -> bool {
    let bytes = addr.as_slice();
    bytes[..18].iter().all(|&b| b == 0) && bytes[18] == 0 && bytes[19] <= 0x10
}

/// Batch-verify contracts using Multicall3 getCodeSize
async fn batch_verify_addresses(
    provider: &impl Provider,
    addresses: &[Address],
) -> Result<Vec<bool>> {
    if addresses.is_empty() {
        return Ok(vec![]);
    }

    // Use eth_getCode via multicall - we'll call extcodesize via a staticcall trick
    // Actually, Multicall3 has getEthBalance but not getCodeSize.
    // Instead, batch eth_getCode calls by splitting into chunks and using individual calls.
    // To avoid rate limiting, we batch them with small delays.
    let mut results = Vec::with_capacity(addresses.len());

    // Process in chunks of 20 to avoid rate limits
    for chunk in addresses.chunks(20) {
        let mut futures = Vec::new();
        for addr in chunk {
            futures.push(provider.get_code_at(*addr));
        }

        for fut in futures {
            match fut.await {
                Ok(code) => results.push(!code.is_empty()),
                Err(_) => results.push(false),
            }
        }

        // Small delay between chunks
        if addresses.len() > 20 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    Ok(results)
}

pub async fn run(args: StatusArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    let chain = registry.get_chain("hyperevm")?;

    // Collect all non-placeholder addresses
    let mut all_addresses: Vec<(usize, String, Address)> = Vec::new(); // (protocol_idx, contract_name, address)
    let mut placeholder_count = 0usize;

    for (pi, p) in registry.protocols.iter().enumerate() {
        for (name, addr) in &p.contracts {
            if is_placeholder(addr) {
                placeholder_count += 1;
            } else {
                all_addresses.push((pi, name.clone(), *addr));
            }
        }
    }

    let (block_number, verification_results) = if args.verify {
        let provider = build_provider(chain)?;
        let bn = provider
            .get_block_number()
            .await
            .map_err(|e| DefiError::RpcError(format!("Failed to get block number: {e}")))?;
        eprintln!(
            "Connected to {} (block #{}). Verifying {} contracts...",
            chain.rpc_url,
            bn,
            all_addresses.len()
        );

        let addrs: Vec<Address> = all_addresses.iter().map(|(_, _, a)| *a).collect();
        let results = batch_verify_addresses(&provider, &addrs).await?;
        (Some(bn), Some(results))
    } else {
        (None, None)
    };

    // Build output
    let mut verified_count = 0usize;
    let mut invalid_count = 0usize;

    // Create a map from (protocol_idx, name) -> has_code
    let mut code_map: std::collections::HashMap<(usize, String), bool> =
        std::collections::HashMap::new();
    if let Some(ref results) = verification_results {
        for (i, (pi, name, _)) in all_addresses.iter().enumerate() {
            code_map.insert((*pi, name.clone()), results[i]);
            if results[i] {
                verified_count += 1;
            } else {
                invalid_count += 1;
            }
        }
    }

    let mut protocols = Vec::new();
    for (pi, p) in registry.protocols.iter().enumerate() {
        let mut contracts = Vec::new();

        for (name, addr) in &p.contracts {
            if is_placeholder(addr) {
                contracts.push(ContractStatus {
                    name: name.clone(),
                    address: format!("{addr}"),
                    has_code: None,
                    status: Some("placeholder".to_string()),
                });
            } else if let Some(&has_code) = code_map.get(&(pi, name.clone())) {
                contracts.push(ContractStatus {
                    name: name.clone(),
                    address: format!("{addr}"),
                    has_code: Some(has_code),
                    status: Some(if has_code { "verified" } else { "NO_CODE" }.to_string()),
                });
            } else {
                contracts.push(ContractStatus {
                    name: name.clone(),
                    address: format!("{addr}"),
                    has_code: None,
                    status: None,
                });
            }
        }

        protocols.push(ProtocolStatus {
            name: p.name.clone(),
            category: p.category.to_string(),
            interface: p.interface.clone(),
            contracts,
        });
    }

    let summary = StatusSummary {
        total_protocols: protocols.len(),
        verified_contracts: if args.verify {
            Some(verified_count)
        } else {
            None
        },
        invalid_contracts: if args.verify {
            Some(invalid_count)
        } else {
            None
        },
        placeholder_contracts: if args.verify {
            Some(placeholder_count)
        } else {
            None
        },
    };

    let status = StatusOutput {
        chain: chain.name.clone(),
        chain_id: chain.chain_id,
        rpc_url: chain.rpc_url.clone(),
        block_number,
        protocols,
        summary,
    };

    output.print(&status)?;
    Ok(())
}
