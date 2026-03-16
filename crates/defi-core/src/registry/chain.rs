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
    /// Priority: HYPEREVM_RPC_URL env var > chains.toml rpc_url
    pub fn effective_rpc_url(&self) -> String {
        std::env::var("HYPEREVM_RPC_URL").unwrap_or_else(|_| self.rpc_url.clone())
    }
}
