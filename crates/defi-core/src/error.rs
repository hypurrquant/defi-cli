use alloy::primitives::Address;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DefiError {
    #[error("Protocol not found: {0}")]
    ProtocolNotFound(String),

    #[error("Token not found: {0}")]
    TokenNotFound(String),

    #[error("Chain not found: {0}")]
    ChainNotFound(String),

    #[error("Insufficient balance: need {needed}, have {available}")]
    InsufficientBalance { needed: String, available: String },

    #[error("Insufficient allowance for spender {spender}")]
    InsufficientAllowance { spender: Address },

    #[error("Slippage exceeded: expected {expected}, got {actual}")]
    SlippageExceeded { expected: String, actual: String },

    #[error("Transaction simulation failed: {0}")]
    SimulationFailed(String),

    #[error("ABI encoding error: {0}")]
    AbiError(String),

    #[error("Registry error: {0}")]
    RegistryError(String),

    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Provider error: {0}")]
    ProviderError(#[from] alloy::transports::RpcError<alloy::transports::TransportErrorKind>),

    #[error("Contract error: {0}")]
    ContractError(String),

    #[error("Invalid parameter: {0}")]
    InvalidParam(String),

    #[error("Unsupported operation: {0}")]
    Unsupported(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, DefiError>;
