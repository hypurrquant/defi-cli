use alloy::primitives::{Address, FixedBytes};
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Bridge;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IMailbox {
        function dispatch(
            uint32 destinationDomain,
            bytes32 recipientAddress,
            bytes calldata messageBody
        ) external payable returns (bytes32);

        function quoteDispatch(
            uint32 destinationDomain,
            bytes32 recipientAddress,
            bytes calldata messageBody
        ) external view returns (uint256);
    }
}

/// Known Hyperlane domain IDs for common chains.
fn chain_name_to_domain(chain: &str) -> Option<u32> {
    match chain.to_lowercase().as_str() {
        "ethereum" | "eth" => Some(1),
        "optimism" | "op" => Some(10),
        "bsc" | "binance" => Some(56),
        "polygon" => Some(137),
        "arbitrum" | "arb" => Some(42161),
        "avalanche" | "avax" => Some(43114),
        "base" => Some(8453),
        "hyperevm" | "hyper" => Some(999),
        _ => None,
    }
}

/// Convert an Ethereum address to a bytes32 (left-padded with zeros).
fn address_to_bytes32(addr: Address) -> FixedBytes<32> {
    let mut bytes = [0u8; 32];
    bytes[12..32].copy_from_slice(addr.as_slice());
    FixedBytes::from(bytes)
}

pub struct HyperlaneBridge {
    name: String,
    mailbox: Address,
}

impl HyperlaneBridge {
    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
    ) -> Result<Self> {
        let mailbox = contracts.get("mailbox").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'mailbox' contract address for Hyperlane".to_string())
        })?;
        Ok(Self { name, mailbox })
    }
}

#[async_trait]
impl Bridge for HyperlaneBridge {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_send(&self, params: BridgeSendParams) -> Result<DeFiTx> {
        let destination_domain = chain_name_to_domain(&params.destination_chain)
            .ok_or_else(|| DefiError::ContractError(format!(
                "Unknown Hyperlane domain for chain '{}'. Supported: ethereum, optimism, bsc, polygon, arbitrum, avalanche, base, hyperevm",
                params.destination_chain
            )))?;

        let recipient_bytes32 = address_to_bytes32(params.recipient);

        // Encode the token transfer as the message body:
        // [token_address (32 bytes)] [amount (32 bytes)]
        let mut message_body = Vec::with_capacity(64);
        message_body.extend_from_slice(address_to_bytes32(params.token).as_slice());
        message_body.extend_from_slice(&params.amount.to_be_bytes::<32>());

        let call = IMailbox::dispatchCall {
            destinationDomain: destination_domain,
            recipientAddress: recipient_bytes32,
            messageBody: message_body.into(),
        };

        Ok(DeFiTx {
            description: format!(
                "[{}] Hyperlane dispatch to {} (domain {}) for {} tokens",
                self.name, params.destination_chain, destination_domain, params.amount
            ),
            to: self.mailbox,
            data: call.abi_encode().into(),
            // Hyperlane dispatch requires native token payment for interchain gas
            value: params.amount,
            gas_estimate: Some(350_000),
        })
    }

    async fn quote(&self, _params: BridgeSendParams) -> Result<BridgeQuoteResult> {
        Err(DefiError::Unsupported(format!(
            "[{}] Hyperlane quote requires RPC to call quoteDispatch on the mailbox",
            self.name
        )))
    }
}
