use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Bridge;
use defi_core::types::*;

pub struct GenericBridge {
    name: String,
    interface: String,
}

impl GenericBridge {
    pub fn from_entry(name: String, interface: String) -> Self {
        Self { name, interface }
    }
}

#[async_trait]
impl Bridge for GenericBridge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_send(&self, _params: BridgeSendParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Bridge interface '{}' requires protocol-specific implementation. \
            Supported bridge interfaces: 'native_bridge' (Hyperliquid L1), 'hyperlane' (Hyperlane Mailbox). \
            For other bridges, a custom adapter is needed.",
            self.name, self.interface
        )))
    }

    async fn quote(&self, _params: BridgeSendParams) -> Result<BridgeQuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] Bridge quote for interface '{}' requires RPC and protocol-specific logic",
            self.name, self.interface
        )))
    }
}
