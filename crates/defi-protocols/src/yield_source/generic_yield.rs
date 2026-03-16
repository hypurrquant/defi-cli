use alloy::primitives::{Address, U256};
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::YieldSource;
use defi_core::types::*;

pub struct GenericYield {
    name: String,
    interface: String,
}

impl GenericYield {
    pub fn from_entry(name: String, interface: String) -> Self {
        Self { name, interface }
    }
}

#[async_trait]
impl YieldSource for GenericYield {
    fn name(&self) -> &str {
        &self.name
    }

    async fn get_yields(&self) -> Result<Vec<YieldInfo>> {
        Err(DefiError::Unsupported(format!(
            "[{}] get_yields requires RPC",
            self.name
        )))
    }

    async fn build_deposit(
        &self,
        _pool: &str,
        _amount: U256,
        _recipient: Address,
    ) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Yield interface '{}' requires a protocol-specific adapter. \
            Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), \
            Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.",
            self.name, self.interface
        )))
    }

    async fn build_withdraw(
        &self,
        _pool: &str,
        _amount: U256,
        _recipient: Address,
    ) -> Result<DeFiTx> {
        Err(DefiError::Unsupported(format!(
            "[{}] Yield interface '{}' requires a protocol-specific adapter. \
            Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), \
            Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.",
            self.name, self.interface
        )))
    }
}
