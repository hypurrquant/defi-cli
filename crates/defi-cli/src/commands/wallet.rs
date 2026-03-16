use alloy::primitives::{Address, U256};
use alloy::providers::Provider;
use clap::{Args, Subcommand};
use serde::Serialize;

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
    /// Create a new wallet
    Create {
        /// Wallet name/label
        #[arg(long)]
        name: Option<String>,
    },
    /// Import an existing wallet
    Import {
        /// Import from private key
        #[arg(long)]
        private_key: Option<String>,
        /// Import from mnemonic phrase
        #[arg(long)]
        mnemonic: Option<String>,
        /// Wallet name/label
        #[arg(long)]
        name: Option<String>,
    },
    /// Show wallet balance
    Balance {
        /// Wallet address to query
        #[arg(long)]
        address: Option<String>,
        /// Show all token balances
        #[arg(long)]
        all_tokens: bool,
    },
}

#[derive(Serialize)]
struct BalanceOutput {
    address: String,
    native_balance: String,
    tokens: Vec<TokenBalance>,
}

#[derive(Serialize)]
struct TokenBalance {
    symbol: String,
    balance: String,
    raw: String,
}

fn format_units(amount: U256, decimals: u8) -> String {
    let divisor = U256::from(10u64).pow(U256::from(decimals));
    if divisor.is_zero() {
        return amount.to_string();
    }
    let whole = amount / divisor;
    let frac = amount % divisor;
    let frac_str = format!("{:0>width$}", frac, width = decimals as usize);
    // Trim trailing zeros for readability
    let frac_trimmed = frac_str.trim_end_matches('0');
    if frac_trimmed.is_empty() {
        format!("{whole}")
    } else {
        format!("{whole}.{frac_trimmed}")
    }
}

pub async fn run(args: WalletArgs, registry: &Registry, output: &OutputMode) -> Result<()> {
    match args.command {
        WalletCommand::Create { name } => {
            let label = name.as_deref().unwrap_or("default");
            let warning = serde_json::json!({
                "warning": "Wallet creation via CLI is not recommended for security reasons.",
                "suggestion": "Use a hardware wallet (Ledger, Trezor) or a dedicated wallet application (MetaMask, Rabby) to generate keys securely.",
                "label": label,
            });
            output.print(&warning)?;
            Ok(())
        }
        WalletCommand::Import { name, .. } => {
            let label = name.as_deref().unwrap_or("default");
            let warning = serde_json::json!({
                "warning": "Importing private keys via CLI is a security risk. Keys may be stored in shell history.",
                "suggestion": "Use a hardware wallet or a dedicated wallet application. If you must import, ensure your terminal history is cleared afterward.",
                "label": label,
            });
            output.print(&warning)?;
            Ok(())
        }
        WalletCommand::Balance {
            address,
            all_tokens,
        } => {
            let addr_str = address.ok_or_else(|| {
                DefiError::InvalidParam("--address is required for balance query".to_string())
            })?;
            let addr: Address = addr_str
                .parse()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid address: {e}")))?;

            let chain = registry.get_chain("hyperevm")?;
            let provider = build_provider(chain)?;

            // Query native balance
            let native_balance = provider
                .get_balance(addr)
                .await
                .map_err(|e| DefiError::RpcError(format!("Failed to get native balance: {e}")))?;

            let native_formatted = format!(
                "{} {}",
                format_units(native_balance, 18),
                chain.native_token
            );

            // Query ERC-20 token balances
            let mut token_balances = Vec::new();

            if all_tokens && let Some(tokens) = registry.tokens.get("hyperevm") {
                for token_entry in tokens {
                    let contract = IERC20::new(token_entry.address, &provider);
                    match contract.balanceOf(addr).call().await {
                        Ok(result) => {
                            let raw = result;
                            if !raw.is_zero() {
                                token_balances.push(TokenBalance {
                                    symbol: token_entry.symbol.clone(),
                                    balance: format_units(raw, token_entry.decimals),
                                    raw: raw.to_string(),
                                });
                            }
                        }
                        Err(_) => {
                            // Skip tokens that fail (contract may not exist)
                        }
                    }
                }
            }

            let result = BalanceOutput {
                address: addr_str,
                native_balance: native_formatted,
                tokens: token_balances,
            };

            output.print(&result)?;
            Ok(())
        }
    }
}
