use alloy::providers::ProviderBuilder;
use url::Url;

use crate::error::{DefiError, Result};
use crate::registry::ChainConfig;

pub fn build_provider(chain: &ChainConfig) -> Result<impl alloy::providers::Provider> {
    let url: Url = chain
        .rpc_url
        .parse()
        .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;
    Ok(ProviderBuilder::new().connect_http(url))
}
