use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub name: String,
    pub chain_id: u64,
    pub rpc_url: String,
    pub explorer_url: Option<String>,
    pub native_token: String,
    pub wrapped_native: Option<String>,
    pub multicall3: Option<String>,
}

impl ChainConfig {
    /// Get the effective RPC URL, checking environment variable override first.
    /// Priority: {CHAIN}_RPC_URL env var > HYPEREVM_RPC_URL (legacy) > chains.toml rpc_url
    pub fn effective_rpc_url(&self) -> String {
        let chain_env = format!("{}_RPC_URL", self.name.to_uppercase().replace(' ', "_"));
        std::env::var(&chain_env)
            .or_else(|_| std::env::var("HYPEREVM_RPC_URL"))
            .unwrap_or_else(|_| self.rpc_url.clone())
    }

    /// Get wrapped native token address
    pub fn wrapped_native_address(&self) -> alloy::primitives::Address {
        self.wrapped_native
            .as_ref()
            .and_then(|s| s.parse().ok())
            .unwrap_or(alloy::primitives::Address::ZERO)
    }
}
