use std::io::{BufRead, Write};

use alloy::primitives::{Address, U256};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

use defi_core::error::{DefiError, Result};
use defi_core::registry::Registry;
use defi_core::types::*;

// === JSON-RPC types ===

#[derive(Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

impl JsonRpcResponse {
    fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    fn error(id: Option<Value>, code: i32, message: String) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError { code, message }),
        }
    }
}

// === Executor (dry-run only for MCP) ===

struct Executor;

impl Executor {
    async fn execute(&self, tx: DeFiTx) -> Result<ActionResult> {
        Ok(ActionResult {
            tx_hash: None,
            status: TxStatus::DryRun,
            gas_used: tx.gas_estimate,
            description: tx.description,
            details: serde_json::json!({
                "to": tx.to.to_string(),
                "data": tx.data.to_string(),
                "value": tx.value.to_string(),
                "mode": "dry_run",
            }),
        })
    }
}

// === MCP Protocol Handlers ===

fn handle_initialize() -> Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "defi-mcp",
            "version": "0.1.0"
        }
    })
}

fn handle_tools_list() -> Value {
    serde_json::json!({
        "tools": [
            {
                "name": "defi_status",
                "description": "Get HyperEVM chain info and list of 60 supported DeFi protocols",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "defi_list_protocols",
                "description": "List DeFi protocols, optionally filtered by category (dex, lending, cdp, bridge, liquid_staking, yield_source, vault, derivatives, options)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Filter by category (e.g. dex, lending, cdp, bridge, liquid_staking, yield_source, yield_aggregator, vault, derivatives, options)"
                        }
                    }
                }
            },
            {
                "name": "defi_dex_swap",
                "description": "Build a DEX swap transaction (dry-run). Returns encoded calldata for the swap.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "protocol": {"type": "string", "description": "Protocol slug (e.g. hyperswap-v3, kittenswap, curve)"},
                        "token_in": {"type": "string", "description": "Input token symbol (e.g. WHYPE) or address"},
                        "token_out": {"type": "string", "description": "Output token symbol (e.g. USDC) or address"},
                        "amount": {"type": "string", "description": "Amount in human-readable format (e.g. '1.5')"},
                        "slippage_bps": {"type": "number", "description": "Slippage tolerance in basis points (default: 50 = 0.5%)"}
                    },
                    "required": ["protocol", "token_in", "token_out", "amount"]
                }
            },
            {
                "name": "defi_lending_supply",
                "description": "Build a lending supply/deposit transaction (dry-run). Supply assets to earn interest.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "protocol": {"type": "string", "description": "Protocol slug (e.g. hyperlend, morpho, euler)"},
                        "asset": {"type": "string", "description": "Token symbol (e.g. USDC) or address"},
                        "amount": {"type": "string", "description": "Amount in human-readable format"}
                    },
                    "required": ["protocol", "asset", "amount"]
                }
            },
            {
                "name": "defi_lending_rates",
                "description": "Get real-time lending rates from on-chain data for a specific asset on a lending protocol",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "protocol": {"type": "string", "description": "Protocol slug (e.g. hyperlend, morpho, euler)"},
                        "asset": {"type": "string", "description": "Token symbol (e.g. USDC) or address"}
                    },
                    "required": ["protocol", "asset"]
                }
            },
            {
                "name": "defi_staking_stake",
                "description": "Build a liquid staking transaction (dry-run). Stake HYPE to receive liquid staking tokens.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "protocol": {"type": "string", "description": "Protocol slug (e.g. kinetiq, sthype, hyperbeat)"},
                        "amount": {"type": "string", "description": "Amount of HYPE to stake (human-readable)"}
                    },
                    "required": ["protocol", "amount"]
                }
            },
            {
                "name": "defi_vault_deposit",
                "description": "Build an ERC-4626 vault deposit transaction (dry-run). Deposit into yield-generating vaults.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "protocol": {"type": "string", "description": "Protocol slug (e.g. veda, upshift, felix-vaults, d2-finance)"},
                        "amount": {"type": "string", "description": "Amount to deposit (human-readable)"}
                    },
                    "required": ["protocol", "amount"]
                }
            }
        ]
    })
}

async fn handle_tool_call(
    registry: &Registry,
    executor: &Executor,
    name: &str,
    arguments: &Value,
) -> std::result::Result<Value, String> {
    match name {
        "defi_status" => tool_status(registry).map_err(|e| e.to_string()),
        "defi_list_protocols" => {
            tool_list_protocols(registry, arguments).map_err(|e| e.to_string())
        }
        "defi_dex_swap" => tool_dex_swap(registry, executor, arguments)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_supply" => tool_lending_supply(registry, executor, arguments)
            .await
            .map_err(|e| e.to_string()),
        "defi_lending_rates" => tool_lending_rates(registry, arguments)
            .await
            .map_err(|e| e.to_string()),
        "defi_staking_stake" => tool_staking_stake(registry, executor, arguments)
            .await
            .map_err(|e| e.to_string()),
        "defi_vault_deposit" => tool_vault_deposit(registry, executor, arguments)
            .await
            .map_err(|e| e.to_string()),
        _ => Err(format!("Unknown tool: {name}")),
    }
}

// === Tool Implementations ===

fn tool_status(registry: &Registry) -> Result<Value> {
    let chain = registry.get_chain("hyperevm")?;
    let protocols: Vec<Value> = registry
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

fn tool_list_protocols(registry: &Registry, params: &Value) -> Result<Value> {
    let category_filter = params.get("category").and_then(|v| v.as_str());

    let protocols: Vec<Value> = registry
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
                "description": p.description,
            })
        })
        .collect();

    Ok(serde_json::json!({ "protocols": protocols }))
}

async fn tool_dex_swap(registry: &Registry, executor: &Executor, params: &Value) -> Result<Value> {
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

    let entry = registry.get_protocol(protocol)?;
    let dex = defi_protocols::factory::create_dex(entry)?;

    let token_in_addr = resolve_token(registry, token_in)?;
    let token_out_addr = resolve_token(registry, token_out)?;
    let decimals = registry
        .resolve_token("hyperevm", token_in)
        .map(|t| t.decimals)
        .unwrap_or(18);
    let amount_in = parse_amount(amount, decimals)?;

    let swap_params = SwapParams {
        protocol: protocol.to_string(),
        token_in: token_in_addr,
        token_out: token_out_addr,
        amount_in,
        slippage: Slippage::new(slippage_bps),
        recipient: Address::ZERO,
        deadline: None,
    };

    let tx = dex.build_swap(swap_params).await?;
    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_lending_supply(
    registry: &Registry,
    executor: &Executor,
    params: &Value,
) -> Result<Value> {
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

    let tx = lending
        .build_supply(SupplyParams {
            protocol: protocol.to_string(),
            asset: asset_addr,
            amount: amount_val,
            on_behalf_of: Address::ZERO,
        })
        .await?;

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_lending_rates(registry: &Registry, params: &Value) -> Result<Value> {
    let protocol = params
        .get("protocol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'protocol'".to_string()))?;
    let asset = params
        .get("asset")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DefiError::InvalidParam("Missing 'asset'".to_string()))?;

    let rpc_url = std::env::var("HYPEREVM_RPC_URL").ok();
    let entry = registry.get_protocol(protocol)?;
    let lending = defi_protocols::factory::create_lending_with_rpc(entry, rpc_url.as_deref())?;
    let asset_addr = resolve_token(registry, asset)?;

    let rates = lending.get_rates(asset_addr).await?;
    serde_json::to_value(&rates).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_staking_stake(
    registry: &Registry,
    executor: &Executor,
    params: &Value,
) -> Result<Value> {
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

    let tx = staking
        .build_stake(StakeParams {
            protocol: protocol.to_string(),
            amount: amount_val,
            recipient: Address::ZERO,
        })
        .await?;

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

async fn tool_vault_deposit(
    registry: &Registry,
    executor: &Executor,
    params: &Value,
) -> Result<Value> {
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

    let tx = vault.build_deposit(amount_val, Address::ZERO).await?;

    let result = executor.execute(tx).await?;
    serde_json::to_value(&result).map_err(|e| DefiError::Internal(e.to_string()))
}

// === Helper Functions ===

fn resolve_token(registry: &Registry, token: &str) -> Result<Address> {
    if let Ok(addr) = token.parse::<Address>() {
        return Ok(addr);
    }
    Ok(registry.resolve_token("hyperevm", token)?.address)
}

fn parse_amount(amount: &str, decimals: u8) -> Result<U256> {
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

// === Main ===

fn main() {
    // Initialize tracing to stderr so it doesn't interfere with JSON-RPC on stdout
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("defi_mcp=info".parse().unwrap()),
        )
        .with_writer(std::io::stderr)
        .init();

    info!("Starting defi-mcp server (JSON-RPC over stdio)");

    let registry = match Registry::load_embedded() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to load registry: {e}");
            std::process::exit(1);
        }
    };
    let executor = Executor;

    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("stdin read error: {e}");
                break;
            }
        };
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let resp = JsonRpcResponse::error(None, -32700, format!("Parse error: {e}"));
                let mut out = stdout.lock();
                let _ = writeln!(out, "{}", serde_json::to_string(&resp).unwrap());
                let _ = out.flush();
                continue;
            }
        };

        let response = match request.method.as_str() {
            "initialize" => JsonRpcResponse::success(request.id, handle_initialize()),

            "notifications/initialized" => {
                // Client acknowledgement — no response needed for notifications
                continue;
            }

            "tools/list" => JsonRpcResponse::success(request.id, handle_tools_list()),

            "tools/call" => {
                let params = request.params.unwrap_or(Value::Object(Default::default()));
                let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default()));

                match rt.block_on(handle_tool_call(
                    &registry, &executor, tool_name, &arguments,
                )) {
                    Ok(result) => {
                        let content = serde_json::json!({
                            "content": [
                                {
                                    "type": "text",
                                    "text": serde_json::to_string_pretty(&result).unwrap_or_default()
                                }
                            ]
                        });
                        JsonRpcResponse::success(request.id, content)
                    }
                    Err(e) => {
                        let content = serde_json::json!({
                            "content": [
                                {
                                    "type": "text",
                                    "text": format!("Error: {e}")
                                }
                            ],
                            "isError": true
                        });
                        JsonRpcResponse::success(request.id, content)
                    }
                }
            }

            _ => JsonRpcResponse::error(
                request.id,
                -32601,
                format!("Method not found: {}", request.method),
            ),
        };

        let mut out = stdout.lock();
        let _ = writeln!(out, "{}", serde_json::to_string(&response).unwrap());
        let _ = out.flush();
    }
}
