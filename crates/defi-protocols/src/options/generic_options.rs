use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Options;
use defi_core::types::*;

pub struct GenericOptions {
    name: String,
    interface: String,
}

impl GenericOptions {
    pub fn from_entry(name: String, interface: String) -> Self {
        Self { name, interface }
    }
}

#[async_trait]
impl Options for GenericOptions {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_buy(&self, _params: OptionParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Options interface '{}' requires a protocol-specific adapter. \
            Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.",
            self.name, self.interface
        )))
    }

    async fn build_sell(&self, _params: OptionParams) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Options interface '{}' requires a protocol-specific adapter. \
            Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.",
            self.name, self.interface
        )))
    }
}
