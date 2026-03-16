use crate::executor::Executor;
use defi_core::error::{DefiError, Result};
use defi_core::registry::Registry;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AgentCommand {
    pub action: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct AgentResponse {
    pub action: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn run_agent(registry: &Registry, executor: &Executor) -> Result<()> {
    use std::io::BufRead;
    let stdin = std::io::stdin();

    for line in stdin.lock().lines() {
        let line = line.map_err(|e| DefiError::Internal(format!("stdin read error: {e}")))?;
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let cmd: AgentCommand = match serde_json::from_str(&line) {
            Ok(cmd) => cmd,
            Err(e) => {
                let resp = AgentResponse {
                    action: "unknown".to_string(),
                    success: false,
                    result: None,
                    error: Some(format!("Invalid JSON: {e}")),
                };
                println!("{}", serde_json::to_string(&resp).unwrap());
                continue;
            }
        };

        let resp = dispatch_command(&cmd, registry, executor).await;
        println!("{}", serde_json::to_string(&resp).unwrap());
    }

    Ok(())
}

async fn dispatch_command(
    cmd: &AgentCommand,
    registry: &Registry,
    executor: &Executor,
) -> AgentResponse {
    let result = match cmd.action.as_str() {
        "status" => handle_status(registry),
        "list_protocols" => handle_list_protocols(registry, &cmd.params),
        "dex.swap" => handle_dex_swap(registry, executor, &cmd.params).await,
        "dex.quote" => handle_dex_quote(registry, &cmd.params).await,
        "lending.supply" => handle_lending_action(registry, executor, &cmd.params, "supply").await,
        "lending.borrow" => handle_lending_action(registry, executor, &cmd.params, "borrow").await,
        "lending.repay" => handle_lending_action(registry, executor, &cmd.params, "repay").await,
        "lending.withdraw" => {
            handle_lending_action(registry, executor, &cmd.params, "withdraw").await
        }
        "staking.stake" => handle_staking(registry, executor, &cmd.params, "stake").await,
        "staking.unstake" => handle_staking(registry, executor, &cmd.params, "unstake").await,
        "vault.deposit" => handle_vault(registry, executor, &cmd.params, "deposit").await,
        "vault.withdraw" => handle_vault(registry, executor, &cmd.params, "withdraw").await,
        "cdp.open" => handle_cdp(registry, executor, &cmd.params).await,
        "schema" => handle_schema(&cmd.params),
        other => Err(DefiError::Unsupported(format!("Unknown action: {other}"))),
    };

    match result {
        Ok(value) => AgentResponse {
            action: cmd.action.clone(),
            success: true,
            result: Some(value),
            error: None,
        },
        Err(e) => AgentResponse {
            action: cmd.action.clone(),
            success: false,
            result: None,
            error: Some(e.to_string()),
        },
    }
}

fn handle_status(registry: &Registry) -> Result<serde_json::Value> {
    let chain = registry.get_chain("hyperevm")?;
    let protocols: Vec<serde_json::Value> = registry
        .protocols
        .iter()
        .map(|p| {
            serde_json::json!({
                "name": p.name,
                "slug": p.slug,
                "category": p.category.to_string(),
                "interface": p.interface,
                "native": p.native,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "chain": chain.name,
        "chain_id": chain.chain_id,
        "protocol_count": protocols.len(),
        "protocols": protocols,
    }))
}

fn handle_list_protocols(
    registry: &Registry,
    params: &serde_json::Value,
) -> Result<serde_json::Value> {
    let category_filter = params.get("category").and_then(|v| v.as_str());

    let protocols: Vec<serde_json::Value> = registry
        .protocols
        .iter()
        .filter(|p| {
            category_filter.map_or(true, |c| p.category.to_string().eq_ignore_ascii_case(c))
        })
        .map(|p| {
            serde_json::json!({
                "name": p.name,
                "slug": p.slug,
                "category": p.category.to_string(),
                "interface": p.interface,
            })
        })
        .collect();

    Ok(serde_json::json!({ "protocols": protocols }))
}

async fn handle_dex_swap(
    registry: &Registry,
    executor: &Executor,
    params: &serde_json::Value,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let token_in = params
        .get("token_in")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'token_in'".to_string()))?;
    let token_out = params
        .get("token_out")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'token_out'".to_string()))?;
    let amount = params
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'amount'".to_string()))?;
    let slippage_bps = params
        .get("slippage_bps")
        .and_then(|v| v.as_u64())
        .unwrap_or(50) as u16;
    let recipient = params.get("recipient").and_then(|v| v.as_str());

    let entry = registry.get_protocol(protocol)?;
    let dex = defi_protocols::factory::create_dex(entry)?;

    let token_in_addr = resolve_token(registry, token_in)?;
    let token_out_addr = resolve_token(registry, token_out)?;
    let decimals = registry
        .resolve_token("hyperevm", token_in)
        .map(|t| t.decimals)
        .unwrap_or(18);
    let amount_in = parse_amount(amount, decimals)?;
    let recipient_addr = match recipient {
        Some(r) => r
            .parse()
            .map_err(|e| DefiError::InvalidParam(format!("{e}")))?,
        None => alloy::primitives::Address::ZERO,
    };

    let swap_params = defi_core::types::SwapParams {
        protocol: protocol.to_string(),
        token_in: token_in_addr,
        token_out: token_out_addr,
        amount_in,
        slippage: defi_core::types::Slippage::new(slippage_bps),
        recipient: recipient_addr,
        deadline: None,
    };

    let tx = dex.build_swap(swap_params).await?;
    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn handle_dex_quote(
    registry: &Registry,
    params: &serde_json::Value,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let token_in = params
        .get("token_in")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'token_in'".to_string()))?;
    let token_out = params
        .get("token_out")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'token_out'".to_string()))?;
    let amount = params
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'amount'".to_string()))?;

    let entry = registry.get_protocol(protocol)?;
    let dex = defi_protocols::factory::create_dex(entry)?;

    let token_in_addr = resolve_token(registry, token_in)?;
    let token_out_addr = resolve_token(registry, token_out)?;
    let decimals = registry
        .resolve_token("hyperevm", token_in)
        .map(|t| t.decimals)
        .unwrap_or(18);
    let amount_in = parse_amount(amount, decimals)?;

    let quote_params = defi_core::types::QuoteParams {
        protocol: protocol.to_string(),
        token_in: token_in_addr,
        token_out: token_out_addr,
        amount_in,
    };

    let result = dex.quote(quote_params).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn handle_lending_action(
    registry: &Registry,
    executor: &Executor,
    params: &serde_json::Value,
    action: &str,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let asset = params
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'asset'".to_string()))?;
    let amount = params
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'amount'".to_string()))?;

    let entry = registry.get_protocol(protocol)?;
    let lending = defi_protocols::factory::create_lending(entry)?;
    let asset_addr = resolve_token(registry, asset)?;
    let decimals = registry
        .resolve_token("hyperevm", asset)
        .map(|t| t.decimals)
        .unwrap_or(18);
    let amount_val = parse_amount(amount, decimals)?;

    let tx = match action {
        "supply" => {
            lending
                .build_supply(defi_core::types::SupplyParams {
                    protocol: protocol.to_string(),
                    asset: asset_addr,
                    amount: amount_val,
                    on_behalf_of: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        "borrow" => {
            lending
                .build_borrow(defi_core::types::BorrowParams {
                    protocol: protocol.to_string(),
                    asset: asset_addr,
                    amount: amount_val,
                    interest_rate_mode: defi_core::types::InterestRateMode::Variable,
                    on_behalf_of: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        "repay" => {
            lending
                .build_repay(defi_core::types::RepayParams {
                    protocol: protocol.to_string(),
                    asset: asset_addr,
                    amount: amount_val,
                    interest_rate_mode: defi_core::types::InterestRateMode::Variable,
                    on_behalf_of: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        "withdraw" => {
            lending
                .build_withdraw(defi_core::types::WithdrawParams {
                    protocol: protocol.to_string(),
                    asset: asset_addr,
                    amount: amount_val,
                    to: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        _ => {
            return Err(DefiError::InvalidParam(format!(
                "Unknown lending action: {action}"
            )));
        }
    };

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn handle_staking(
    registry: &Registry,
    executor: &Executor,
    params: &serde_json::Value,
    action: &str,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let amount = params
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'amount'".to_string()))?;

    let entry = registry.get_protocol(protocol)?;
    let staking = defi_protocols::factory::create_liquid_staking(entry)?;
    let amount_val = parse_amount(amount, 18)?;

    let tx = match action {
        "stake" => {
            staking
                .build_stake(defi_core::types::StakeParams {
                    protocol: protocol.to_string(),
                    amount: amount_val,
                    recipient: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        "unstake" => {
            staking
                .build_unstake(defi_core::types::UnstakeParams {
                    protocol: protocol.to_string(),
                    amount: amount_val,
                    recipient: alloy::primitives::Address::ZERO,
                })
                .await?
        }
        _ => {
            return Err(DefiError::InvalidParam(format!(
                "Unknown staking action: {action}"
            )));
        }
    };

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn handle_vault(
    registry: &Registry,
    executor: &Executor,
    params: &serde_json::Value,
    action: &str,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let amount = params
        .get("amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'amount'".to_string()))?;

    let entry = registry.get_protocol(protocol)?;
    let vault = defi_protocols::factory::create_vault(entry)?;
    let amount_val = parse_amount(amount, 18)?;

    let tx = match action {
        "deposit" => {
            vault
                .build_deposit(amount_val, alloy::primitives::Address::ZERO)
                .await?
        }
        "withdraw" => {
            vault
                .build_withdraw(
                    amount_val,
                    alloy::primitives::Address::ZERO,
                    alloy::primitives::Address::ZERO,
                )
                .await?
        }
        _ => {
            return Err(DefiError::InvalidParam(format!(
                "Unknown vault action: {action}"
            )));
        }
    };

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn handle_cdp(
    registry: &Registry,
    executor: &Executor,
    params: &serde_json::Value,
) -> Result<serde_json::Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let collateral = params
        .get("collateral")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'collateral'".to_string()))?;
    let collateral_amount = params
        .get("collateral_amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'collateral_amount'".to_string()))?;
    let debt_amount = params
        .get("debt_amount")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'debt_amount'".to_string()))?;

    let entry = registry.get_protocol(protocol)?;
    let cdp = defi_protocols::factory::create_cdp(entry)?;
    let collateral_addr = resolve_token(registry, collateral)?;
    let coll_val = parse_amount(collateral_amount, 18)?;
    let debt_val = parse_amount(debt_amount, 18)?;

    let tx = cdp
        .build_open(defi_core::types::OpenCdpParams {
            protocol: protocol.to_string(),
            collateral: collateral_addr,
            collateral_amount: coll_val,
            debt_amount: debt_val,
            recipient: alloy::primitives::Address::ZERO,
        })
        .await?;

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

pub fn handle_schema(params: &serde_json::Value) -> Result<serde_json::Value> {
    let action = params
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("all");

    let schemas = match action {
        "dex.swap" => serde_json::json!({
            "action": "dex.swap",
            "params": {
                "protocol": {"type": "string", "required": true, "description": "Protocol slug (e.g. hyperswap-v3)"},
                "token_in": {"type": "string", "required": true, "description": "Input token symbol or address"},
                "token_out": {"type": "string", "required": true, "description": "Output token symbol or address"},
                "amount": {"type": "string", "required": true, "description": "Amount (human-readable, e.g. '1.5')"},
                "slippage_bps": {"type": "number", "required": false, "default": 50, "description": "Slippage in basis points"},
                "recipient": {"type": "string", "required": false, "description": "Recipient address"},
            }
        }),
        "dex.quote" => serde_json::json!({
            "action": "dex.quote",
            "params": {
                "protocol": {"type": "string", "required": true, "description": "Protocol slug"},
                "token_in": {"type": "string", "required": true, "description": "Input token symbol or address"},
                "token_out": {"type": "string", "required": true, "description": "Output token symbol or address"},
                "amount": {"type": "string", "required": true, "description": "Amount (human-readable)"},
            }
        }),
        "lending.supply" | "lending.borrow" | "lending.repay" | "lending.withdraw" => {
            serde_json::json!({
                "action": action,
                "params": {
                    "protocol": {"type": "string", "required": true, "description": "Protocol slug"},
                    "asset": {"type": "string", "required": true, "description": "Token symbol or address"},
                    "amount": {"type": "string", "required": true, "description": "Amount (human-readable)"},
                }
            })
        }
        "staking.stake" | "staking.unstake" => serde_json::json!({
            "action": action,
            "params": {
                "protocol": {"type": "string", "required": true, "description": "Protocol slug"},
                "amount": {"type": "string", "required": true, "description": "Amount (human-readable)"},
            }
        }),
        "vault.deposit" | "vault.withdraw" => serde_json::json!({
            "action": action,
            "params": {
                "protocol": {"type": "string", "required": true, "description": "Protocol slug"},
                "amount": {"type": "string", "required": true, "description": "Amount (human-readable)"},
            }
        }),
        "cdp.open" => serde_json::json!({
            "action": "cdp.open",
            "params": {
                "protocol": {"type": "string", "required": true, "description": "Protocol slug"},
                "collateral": {"type": "string", "required": true, "description": "Collateral token symbol or address"},
                "collateral_amount": {"type": "string", "required": true, "description": "Collateral amount (human-readable)"},
                "debt_amount": {"type": "string", "required": true, "description": "Debt amount (human-readable)"},
            }
        }),
        "status" => serde_json::json!({
            "action": "status",
            "params": {}
        }),
        "list_protocols" => serde_json::json!({
            "action": "list_protocols",
            "params": {
                "category": {"type": "string", "required": false, "description": "Filter by category (e.g. dex, lending, vault)"},
            }
        }),
        _ => {
            // Return all schemas
            serde_json::json!({
                "actions": [
                    "status", "list_protocols", "schema",
                    "dex.swap", "dex.quote",
                    "lending.supply", "lending.borrow", "lending.repay", "lending.withdraw",
                    "staking.stake", "staking.unstake",
                    "vault.deposit", "vault.withdraw",
                    "cdp.open"
                ]
            })
        }
    };

    Ok(schemas)
}

// Helper functions
fn resolve_token(registry: &Registry, token: &str) -> Result<alloy::primitives::Address> {
    if let Ok(addr) = token.parse::<alloy::primitives::Address>() {
        return Ok(addr);
    }
    Ok(registry.resolve_token("hyperevm", token)?.address)
}

fn parse_amount(amount: &str, decimals: u8) -> Result<alloy::primitives::U256> {
    use alloy::primitives::U256;
    if amount == "max" {
        return Ok(U256::MAX);
    }
    let parts: Vec<&str> = amount.split('.').collect();
    let (whole, frac) = match parts.len() {
        1 => (parts[0], ""),
        2 => (parts[0], parts[1]),
        _ => return Err(DefiError::InvalidParam("Invalid amount format".to_string())),
    };
    let whole_val = U256::from(
        whole
            .parse::<u64>()
            .map_err(|e| DefiError::InvalidParam(format!("Invalid whole part: {e}")))?,
    );
    let frac_val = if frac.is_empty() {
        U256::ZERO
    } else {
        let padded = format!("{:0<width$}", frac, width = decimals as usize);
        U256::from(
            padded[..decimals as usize]
                .parse::<u64>()
                .map_err(|e| DefiError::InvalidParam(format!("Invalid fractional part: {e}")))?,
        )
    };
    Ok(whole_val * U256::from(10u64).pow(U256::from(decimals)) + frac_val)
}
