use alloy::primitives::{Address, U256};
use alloy::providers::Provider;
use alloy::signers::local::PrivateKeySigner;
use clap::{Args, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use defi_core::erc20::IERC20;
use defi_core::error::{DefiError, Result};
use defi_core::provider::build_provider;
use defi_core::registry::Registry;

use crate::output::OutputMode;

#[derive(Args)]
pub struct WalletArgs {
    #[command(subcommand)]
    pub command: WalletCommand,
}

#[derive(Subcommand)]
pub enum WalletCommand {
    /// Generate a new EVM wallet
    Generate {
        /// Wallet name/label
        #[arg(long, short, default_value = "default")]
        name: String,
    },
    /// Import an existing private key
    Import {
        /// Private key (0x hex)
        #[arg(long)]
        key: String,
        /// Wallet name/label
        #[arg(long, short, default_value = "imported")]
        name: String,
    },
    /// List all saved wallets
    List,
    /// Set active wallet
    Use {
        /// Wallet name to activate
        name: String,
    },
    /// Remove a saved wallet
    Remove {
        /// Wallet name to remove
        name: String,
    },
    /// Show wallet balance (native + tokens)
    Balance {
        /// Wallet address (or use active wallet)
        #[arg(long)]
        address: Option<String>,
        /// Show all token balances
        #[arg(long)]
        all_tokens: bool,
    },
}

// === Wallet Store (persisted to ~/.defi/wallets.json) ===

#[derive(Debug, Serialize, Deserialize, Default)]
struct WalletStore {
    wallets: HashMap<String, WalletEntry>,
    active: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WalletEntry {
    name: String,
    address: String,
    private_key: String,
    created_at: String,
}

fn store_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".defi")
}

fn store_path() -> PathBuf {
    store_dir().join("wallets.json")
}

fn load_store() -> WalletStore {
    let path = store_path();
    if !path.exists() {
        return WalletStore::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &WalletStore) -> Result<()> {
    let dir = store_dir();
    std::fs::create_dir_all(&dir).map_err(|e| DefiError::Internal(format!("mkdir: {e}")))?;

    // Write with restricted permissions
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| DefiError::Internal(format!("serialize: {e}")))?;
    std::fs::write(store_path(), json).map_err(|e| DefiError::Internal(format!("write: {e}")))?;

    // Set file permissions to 600 (owner only) on unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(store_path(), perms);
    }
    Ok(())
}

/// Get the active wallet's private key (for use by executor)
#[allow(dead_code)]
pub fn get_active_key() -> Option<String> {
    let store = load_store();
    let name = store.active.as_ref()?;
    store.wallets.get(name).map(|w| w.private_key.clone())
}

fn format_units(amount: U256, decimals: u8) -> String {
    let divisor = U256::from(10u64).pow(U256::from(decimals));
    if divisor.is_zero() {
        return amount.to_string();
    }
    let whole = amount / divisor;
    let frac = amount % divisor;
    let frac_str = format!("{:0>width$}", frac, width = decimals as usize);
    let frac_trimmed = frac_str.trim_end_matches('0');
    if frac_trimmed.is_empty() {
        format!("{whole}")
    } else {
        format!("{whole}.{frac_trimmed}")
    }
}

pub async fn run(args: WalletArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    match args.command {
        WalletCommand::Generate { name } => {
            let mut store = load_store();
            if store.wallets.contains_key(&name) {
                return Err(DefiError::InvalidParam(format!(
                    "Wallet '{}' already exists. Use a different name or 'wallet remove' first.",
                    name
                )));
            }

            let signer = PrivateKeySigner::random();
            let address = format!("{:?}", signer.address());
            let private_key = format!("0x{}", alloy::hex::encode(signer.to_bytes()));

            store.wallets.insert(
                name.clone(),
                WalletEntry {
                    name: name.clone(),
                    address: address.clone(),
                    private_key,
                    created_at: chrono_now(),
                },
            );
            if store.active.is_none() {
                store.active = Some(name.clone());
            }
            save_store(&store)?;

            output.print(&serde_json::json!({
                "action": "generated",
                "name": name,
                "address": address,
                "active": store.active == Some(name),
                "store": store_path().display().to_string(),
            }))?;
        }

        WalletCommand::Import { key, name } => {
            let mut store = load_store();
            if store.wallets.contains_key(&name) {
                return Err(DefiError::InvalidParam(format!(
                    "Wallet '{}' already exists.",
                    name
                )));
            }

            let pk = if key.starts_with("0x") {
                key.clone()
            } else {
                format!("0x{}", key)
            };
            let signer: PrivateKeySigner = pk
                .parse()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid private key: {e}")))?;
            let address = format!("{:?}", signer.address());

            store.wallets.insert(
                name.clone(),
                WalletEntry {
                    name: name.clone(),
                    address: address.clone(),
                    private_key: pk,
                    created_at: chrono_now(),
                },
            );
            if store.active.is_none() {
                store.active = Some(name.clone());
            }
            save_store(&store)?;

            output.print(&serde_json::json!({
                "action": "imported",
                "name": name,
                "address": address,
            }))?;
        }

        WalletCommand::List => {
            let store = load_store();
            let wallets: Vec<serde_json::Value> = store
                .wallets
                .values()
                .map(|w| {
                    serde_json::json!({
                        "name": w.name,
                        "address": w.address,
                        "active": store.active.as_ref() == Some(&w.name),
                        "created_at": w.created_at,
                    })
                })
                .collect();

            output.print(&serde_json::json!({
                "wallets": wallets,
                "active": store.active,
            }))?;
        }

        WalletCommand::Use { name } => {
            let mut store = load_store();
            if !store.wallets.contains_key(&name) {
                return Err(DefiError::InvalidParam(format!(
                    "Wallet '{}' not found. Run 'defi wallet list' to see available wallets.",
                    name
                )));
            }

            let address = store.wallets[&name].address.clone();
            store.active = Some(name.clone());
            save_store(&store)?;

            output.print(&serde_json::json!({
                "active": name,
                "address": address,
            }))?;
        }

        WalletCommand::Remove { name } => {
            let mut store = load_store();
            let entry = store
                .wallets
                .remove(&name)
                .ok_or_else(|| DefiError::InvalidParam(format!("Wallet '{}' not found.", name)))?;

            if store.active.as_ref() == Some(&name) {
                store.active = store.wallets.keys().next().cloned();
            }
            save_store(&store)?;

            output.print(&serde_json::json!({
                "removed": name,
                "address": entry.address,
            }))?;
        }

        WalletCommand::Balance {
            address,
            all_tokens,
        } => {
            // Resolve address: from flag, or from active wallet
            let addr_str = match address {
                Some(a) => a,
                None => {
                    let store = load_store();
                    let name = store.active.as_ref().ok_or_else(|| {
                        DefiError::InvalidParam(
                            "No --address and no active wallet. Use 'defi wallet use <name>' or pass --address."
                                .to_string(),
                        )
                    })?;
                    store
                        .wallets
                        .get(name)
                        .map(|w| w.address.clone())
                        .ok_or_else(|| {
                            DefiError::InvalidParam(format!("Active wallet '{}' not found.", name))
                        })?
                }
            };

            let addr: Address = addr_str
                .parse()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

            let chain = registry.get_chain("hyperevm")?;
            let provider = build_provider(chain)?;

            let native_balance = provider
                .get_balance(addr)
                .await
                .map_err(|e| DefiError::RpcError(format!("Failed to get native balance: {e}")))?;

            let native_formatted = format!(
                "{} {}",
                format_units(native_balance, 18),
                chain.native_token
            );

            let mut token_balances = Vec::new();

            if all_tokens && let Some(tokens) = registry.tokens.get("hyperevm") {
                for token_entry in tokens {
                    let contract = IERC20::new(token_entry.address, &provider);
                    if let Ok(raw) = contract.balanceOf(addr).call().await
                        && !raw.is_zero()
                    {
                        token_balances.push(serde_json::json!({
                            "symbol": token_entry.symbol,
                            "balance": format_units(raw, token_entry.decimals),
                            "raw": raw.to_string(),
                        }));
                    }
                }
            }

            output.print(&serde_json::json!({
                "address": addr_str,
                "native_balance": native_formatted,
                "tokens": token_balances,
            }))?;
        }
    }
    Ok(())
}

fn chrono_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple ISO-ish format without chrono dependency
    format!("{}Z", secs)
}
