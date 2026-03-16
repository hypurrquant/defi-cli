use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};
use serde::Serialize;

use defi_core::erc20::{self, IERC20};
use defi_core::error::{DefiError, Result};
use defi_core::provider::build_provider;
use defi_core::registry::{ChainConfig, Registry};

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct TokenArgs {
    #[command(subcommand)]
    pub command: TokenCommand,
}

#[derive(Subcommand)]
pub enum TokenCommand {
    /// Query token balance for an address
    Balance {
        /// Token symbol or address
        #[arg(long)]
        token: String,
        /// Wallet address to query
        #[arg(long)]
        owner: String,
    },
    /// Approve a spender for a token
    Approve {
        /// Token symbol or address
        #[arg(long)]
        token: String,
        /// Spender address or protocol name
        #[arg(long)]
        spender: String,
        /// Amount to approve (use "max" for unlimited)
        #[arg(long, default_value = "max")]
        amount: String,
    },
    /// Check token allowance
    Allowance {
        /// Token symbol or address
        #[arg(long)]
        token: String,
        /// Owner address
        #[arg(long)]
        owner: String,
        /// Spender address or protocol name
        #[arg(long)]
        spender: String,
    },
    /// Transfer tokens to an address
    Transfer {
        /// Token symbol or address
        #[arg(long)]
        token: String,
        /// Recipient address
        #[arg(long)]
        to: String,
        /// Amount to transfer
        #[arg(long)]
        amount: String,
    },
}

#[derive(Serialize)]
struct TokenBalanceOutput {
    token: String,
    owner: String,
    balance: String,
    raw: String,
    decimals: u8,
}

#[derive(Serialize)]
struct AllowanceOutput {
    token: String,
    owner: String,
    spender: String,
    allowance: String,
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
    let frac_trimmed = frac_str.trim_end_matches('0');
    if frac_trimmed.is_empty() {
        format!("{whole}")
    } else {
        format!("{whole}.{frac_trimmed}")
    }
}

/// Resolve a token string to an address and decimals.
/// Accepts either a symbol (looked up in registry) or a hex address.
fn resolve_token(registry: &Registry, chain: &str, token: &str) -> Result<(Address, u8, String)> {
    if let Ok(entry) = registry.resolve_token(chain, token) {
        Ok((entry.address, entry.decimals, entry.symbol.clone()))
    } else if let Ok(addr) = token.parse::<Address>() {
        // Raw address provided; default to 18 decimals, symbol unknown
        Ok((addr, 18, token.to_string()))
    } else {
        Err(DefiError::TokenNotFound(token.to_string()))
    }
}

fn parse_address(s: &str) -> Result<Address> {
    s.parse::<Address>()
        .map_err(|e| DefiError::InvalidParam(format!("Invalid address '{s}': {e}")))
}

/// Parse a human-readable amount string into raw U256 given decimals.
fn parse_amount(amount_str: &str, decimals: u8) -> Result<U256> {
    if amount_str == "max" {
        return Ok(U256::MAX);
    }

    let parts: Vec<&str> = amount_str.split('.').collect();
    match parts.len() {
        1 => {
            let whole: U256 = parts[0]
                .parse()
                .map_err(|_| DefiError::InvalidParam(format!("Invalid amount: {amount_str}")))?;
            Ok(whole * U256::from(10u64).pow(U256::from(decimals)))
        }
        2 => {
            let whole: U256 = parts[0]
                .parse()
                .map_err(|_| DefiError::InvalidParam(format!("Invalid amount: {amount_str}")))?;
            let frac_str = parts[1];
            let frac_len = frac_str.len();
            if frac_len > decimals as usize {
                return Err(DefiError::InvalidParam(format!(
                    "Too many decimal places: {frac_len} (token has {decimals} decimals)"
                )));
            }
            let frac_padded = format!("{:0<width$}", frac_str, width = decimals as usize);
            let frac: U256 = frac_padded
                .parse()
                .map_err(|_| DefiError::InvalidParam(format!("Invalid amount: {amount_str}")))?;
            Ok(whole * U256::from(10u64).pow(U256::from(decimals)) + frac)
        }
        _ => Err(DefiError::InvalidParam(format!(
            "Invalid amount format: {amount_str}"
        ))),
    }
}

pub async fn run(
    args: TokenArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        TokenCommand::Balance { token, owner } => {
            let (token_addr, decimals, symbol) =
                resolve_token(registry, &chain.name.to_lowercase(), &token)?;
            let owner_addr = parse_address(&owner)?;

            let provider = build_provider(chain)?;
            let contract = IERC20::new(token_addr, &provider);

            let result = contract
                .balanceOf(owner_addr)
                .call()
                .await
                .map_err(|e| DefiError::ContractError(format!("balanceOf failed: {e}")))?;

            let balance_output = TokenBalanceOutput {
                token: symbol,
                owner,
                balance: format_units(result, decimals),
                raw: result.to_string(),
                decimals,
            };

            output.print(&balance_output)?;
            Ok(())
        }
        TokenCommand::Approve {
            token,
            spender,
            amount,
        } => {
            let (token_addr, decimals, symbol) =
                resolve_token(registry, &chain.name.to_lowercase(), &token)?;
            let spender_addr = parse_address(&spender)?;
            let raw_amount = parse_amount(&amount, decimals)?;

            let tx = erc20::build_approve(token_addr, spender_addr, raw_amount)?;

            let amount_display = if amount == "max" {
                "unlimited".to_string()
            } else {
                format!("{amount} {symbol}")
            };

            eprintln!("Approve {spender} to spend {amount_display} of {symbol} ({token_addr})");

            let result = executor.execute(tx).await?;
            output.print(&result)?;
            Ok(())
        }
        TokenCommand::Allowance {
            token,
            owner,
            spender,
        } => {
            let (token_addr, decimals, symbol) =
                resolve_token(registry, &chain.name.to_lowercase(), &token)?;
            let owner_addr = parse_address(&owner)?;
            let spender_addr = parse_address(&spender)?;

            let provider = build_provider(chain)?;
            let contract = IERC20::new(token_addr, &provider);

            let result = contract
                .allowance(owner_addr, spender_addr)
                .call()
                .await
                .map_err(|e| DefiError::ContractError(format!("allowance failed: {e}")))?;

            let allowance_output = AllowanceOutput {
                token: symbol,
                owner,
                spender,
                allowance: format_units(result, decimals),
                raw: result.to_string(),
            };

            output.print(&allowance_output)?;
            Ok(())
        }
        TokenCommand::Transfer { token, to, amount } => {
            let (token_addr, decimals, symbol) =
                resolve_token(registry, &chain.name.to_lowercase(), &token)?;
            let to_addr = parse_address(&to)?;
            let raw_amount = parse_amount(&amount, decimals)?;

            let tx = erc20::build_transfer(token_addr, to_addr, raw_amount)?;

            eprintln!("Transfer {amount} {symbol} to {to}");

            let result = executor.execute(tx).await?;
            output.print(&result)?;
            Ok(())
        }
    }
}
