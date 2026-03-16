use alloy::providers::ProviderBuilder;
use url::Url;

use crate::error::{DefiError, Result};
use crate::registry::ChainConfig;

/// Build a provider using the effective RPC URL (env var override supported).
pub fn build_provider(chain: &ChainConfig) -> Result<impl alloy::providers::Provider> {
    let rpc = chain.effective_rpc_url();
    let url: Url = rpc
        .parse()
        .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;
    Ok(ProviderBuilder::new().connect_http(url))
}

/// Build a provider from a raw URL string.
pub fn build_provider_from_url(rpc_url: &str) -> Result<impl alloy::providers::Provider> {
    let url: Url = rpc_url
        .parse()
        .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))?;
    Ok(ProviderBuilder::new().connect_http(url))
}

/// Retry an async RPC operation with exponential backoff on rate limit errors.
/// Retries up to `max_retries` times with initial delay `initial_delay_ms`.
pub async fn with_retry<F, Fut, T>(
    max_retries: u32,
    initial_delay_ms: u64,
    mut operation: F,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut delay = initial_delay_ms;
    for attempt in 0..=max_retries {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                let err_str = e.to_string();
                let is_rate_limit = err_str.contains("rate limit")
                    || err_str.contains("-32005")
                    || err_str.contains("429");

                if !is_rate_limit || attempt == max_retries {
                    return Err(e);
                }

                eprintln!(
                    "Rate limited (attempt {}/{}), retrying in {}ms...",
                    attempt + 1,
                    max_retries,
                    delay
                );
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                delay = (delay * 2).min(30_000); // exponential backoff, max 30s
            }
        }
    }
    unreachable!()
}
