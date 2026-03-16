use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Derivatives;
use defi_core::types::*;

pub struct GenericDerivatives {
    name: String,
    interface: String,
}

impl GenericDerivatives {
    pub fn from_entry(name: String, interface: String) -> Self {
        Self { name, interface }
    }
}

#[async_trait]
impl Derivatives for GenericDerivatives {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_open_position(&self, _params: DerivativesPositionParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Derivatives interface '{}' requires a protocol-specific adapter. \
            Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.",
            self.name, self.interface
        )))
    }

    async fn build_close_position(&self, _params: DerivativesPositionParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Derivatives interface '{}' requires a protocol-specific adapter. \
            Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.",
            self.name, self.interface
        )))
    }
}
