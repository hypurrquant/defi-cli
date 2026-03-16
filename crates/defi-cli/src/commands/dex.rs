use alloy::primitives::{Address, U256};
use clap::{Args, Subcommand};

use defi_core::error::{DefiError, Result};
use defi_core::registry::{ChainConfig, ProtocolCategory, Registry};
use defi_core::types::*;

use crate::executor::Executor;
use crate::output::OutputMode;

#[derive(Args)]
pub struct DexArgs {
    #[command(subcommand)]
    pub command: DexCommand,
}

#[derive(Subcommand)]
pub enum DexCommand {
    /// Execute a token swap
    Swap {
        /// Protocol to use (e.g., hyperswap-v3, kittenswap)
        #[arg(long)]
        protocol: String,
        /// Input token symbol or address
        #[arg(long)]
        token_in: String,
        /// Output token symbol or address
        #[arg(long)]
        token_out: String,
        /// Amount of input token (human-readable, e.g. "1.5")
        #[arg(long)]
        amount: String,
        /// Slippage tolerance in basis points (e.g., 50 = 0.5%)
        #[arg(long, default_value = "50")]
        slippage: u16,
        /// Recipient address (defaults to zero — must set for broadcast)
        #[arg(long)]
        recipient: Option<String>,
    },
    /// Get a swap quote without executing
    Quote {
        /// Protocol to use
        #[arg(long)]
        protocol: String,
        /// Input token symbol or address
        #[arg(long)]
        token_in: String,
        /// Output token symbol or address
        #[arg(long)]
        token_out: String,
        /// Amount of input token
        #[arg(long)]
        amount: String,
    },
    /// Compare quotes across DEXes
    Compare {
        /// Input token symbol or address
        #[arg(long)]
        token_in: String,
        /// Output token symbol or address
        #[arg(long)]
        token_out: String,
        /// Amount of input token
        #[arg(long)]
        amount: String,
    },
}

fn resolve_token_address(registry: &Registry, chain: &str, token: &str) -> Result<Address> {
    // Try parsing as address first
    if let Ok(addr) = token.parse::<Address>() {
        return Ok(addr);
    }
    // Resolve from registry
    let entry = registry.resolve_token(chain, token)?;
    Ok(entry.address)
}

fn parse_amount(amount: &str, decimals: u8) -> Result<U256> {
    let parts: Vec<&str> = amount.split('.').collect();
    let (whole, frac) = match parts.len() {
        1 => (parts[0], ""),
        2 => (parts[0], parts[1]),
        _ => return Err(DefiError::InvalidParam("Invalid amount format".to_string())),
    };
    let whole_val = U256::from(
        whole
            .parse::<u64>()
            .map_err(|e| DefiError::InvalidParam(format!("Invalid amount: {e}")))?,
    );
    let frac_val = if frac.is_empty() {
        U256::ZERO
    } else {
        let frac_padded = format!("{:0<width$}", frac, width = decimals as usize);
        let frac_trimmed = &frac_padded[..decimals as usize];
        U256::from(
            frac_trimmed
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid fractional amount: {e}")))?,
        )
    };
    let decimals_mul = U256::from(10u64).pow(U256::from(decimals));
    Ok(whole_val * decimals_mul + frac_val)
}

pub async fn run(
    args: DexArgs,
    registry: &Registry,
    chain: &ChainConfig,
    executor: &Executor,
    output: &OutputMode,
) -> Result<()> {
    match args.command {
        DexCommand::Swap {
            protocol,
            token_in,
            token_out,
            amount,
            slippage,
            recipient,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let dex = defi_protocols::factory::create_dex(entry)?;

            let token_in_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_in)?;
            let token_out_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_out)?;

            // Try to get decimals from registry, default to 18
            let decimals = registry
                .resolve_token(&chain.name.to_lowercase(), &token_in)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_in = parse_amount(&amount, decimals)?;

            let recipient_addr = match recipient {
                Some(r) => r.parse::<Address>().map_err(|e| {
                    DefiError::InvalidParam(format!("Invalid recipient address: {e}"))
                })?,
                None => Address::ZERO,
            };

            let params = SwapParams {
                protocol: protocol.clone(),
                token_in: token_in_addr,
                token_out: token_out_addr,
                amount_in,
                slippage: Slippage::new(slippage),
                recipient: recipient_addr,
                deadline: None,
            };

            let tx = dex.build_swap(params).await?;
            let result = executor.execute(tx).await?;
            output.print(&result)?;
        }
        DexCommand::Quote {
            protocol,
            token_in,
            token_out,
            amount,
        } => {
            let entry = registry.get_protocol(&protocol)?;
            let dex = defi_protocols::factory::create_dex_with_rpc(entry, Some(&chain.rpc_url))?;

            let token_in_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_in)?;
            let token_out_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_out)?;

            let decimals = registry
                .resolve_token(&chain.name.to_lowercase(), &token_in)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_in = parse_amount(&amount, decimals)?;

            let params = QuoteParams {
                protocol: protocol.clone(),
                token_in: token_in_addr,
                token_out: token_out_addr,
                amount_in,
            };

            let result = dex.quote(params).await?;
            output.print(&result)?;
        }
        DexCommand::Compare {
            token_in,
            token_out,
            amount,
        } => {
            let dex_protocols = registry.get_protocols_by_category(ProtocolCategory::Dex);
            let token_in_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_in)?;
            let token_out_addr =
                resolve_token_address(registry, &chain.name.to_lowercase(), &token_out)?;

            let decimals = registry
                .resolve_token(&chain.name.to_lowercase(), &token_in)
                .map(|t| t.decimals)
                .unwrap_or(18);
            let amount_in = parse_amount(&amount, decimals)?;

            let mut quotes: Vec<QuoteResult> = Vec::new();

            for entry in &dex_protocols {
                match defi_protocols::factory::create_dex_with_rpc(entry, Some(&chain.rpc_url)) {
                    Ok(dex) => {
                        let params = QuoteParams {
                            protocol: entry.slug.clone(),
                            token_in: token_in_addr,
                            token_out: token_out_addr,
                            amount_in,
                        };
                        match dex.quote(params).await {
                            Ok(quote) => quotes.push(quote),
                            Err(e) => {
                                eprintln!("Warning: {} quote failed: {}", entry.name, e);
                            }
                        }
                        // Brief pause between RPC calls to avoid rate limiting
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    Err(_) => continue,
                }
            }

            quotes.sort_by(|a, b| b.amount_out.cmp(&a.amount_out));

            output.print(&serde_json::json!({
                "token_in": token_in,
                "token_out": token_out,
                "amount_in": amount,
                "quotes": quotes,
                "best": quotes.first().map(|q| &q.protocol),
            }))?;
        }
    }
    Ok(())
}
