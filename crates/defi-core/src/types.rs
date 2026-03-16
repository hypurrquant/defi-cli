use alloy::primitives::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};

/// A built DeFi transaction ready for simulation or broadcast
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeFiTx {
    /// Human-readable description of the transaction
    pub description: String,
    /// Target contract address
    pub to: Address,
    /// Calldata
    pub data: Bytes,
    /// Native token value to send (wei)
    pub value: U256,
    /// Estimated gas limit
    pub gas_estimate: Option<u64>,
}

/// Result of executing or simulating a transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub tx_hash: Option<String>,
    pub status: TxStatus,
    pub gas_used: Option<u64>,
    pub description: String,
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TxStatus {
    DryRun,
    Pending,
    Confirmed,
    Failed,
}

/// Token amount with decimals-aware formatting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenAmount {
    pub token: Address,
    pub symbol: String,
    pub amount: U256,
    pub decimals: u8,
}

impl TokenAmount {
    pub fn format_human(&self) -> String {
        let divisor = U256::from(10u64).pow(U256::from(self.decimals));
        let whole = self.amount / divisor;
        let frac = self.amount % divisor;
        format!(
            "{}.{:0>width$} {}",
            whole,
            frac,
            self.symbol,
            width = self.decimals as usize
        )
    }
}

/// Slippage tolerance
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Slippage {
    /// Basis points (e.g. 50 = 0.5%)
    pub bps: u16,
}

impl Slippage {
    pub fn new(bps: u16) -> Self {
        Self { bps }
    }

    pub fn default_swap() -> Self {
        Self { bps: 50 }
    }

    pub fn apply_min(&self, amount: U256) -> U256 {
        amount * U256::from(10000 - self.bps as u64) / U256::from(10000)
    }
}

impl Default for Slippage {
    fn default() -> Self {
        Self::default_swap()
    }
}

// === DEX Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapParams {
    pub protocol: String,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: U256,
    pub slippage: Slippage,
    pub recipient: Address,
    pub deadline: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteParams {
    pub protocol: String,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteResult {
    pub protocol: String,
    pub amount_out: U256,
    pub price_impact_bps: Option<u16>,
    pub fee_bps: Option<u16>,
    pub route: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddLiquidityParams {
    pub protocol: String,
    pub token_a: Address,
    pub token_b: Address,
    pub amount_a: U256,
    pub amount_b: U256,
    pub recipient: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveLiquidityParams {
    pub protocol: String,
    pub token_a: Address,
    pub token_b: Address,
    pub liquidity: U256,
    pub recipient: Address,
}

// === Lending Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplyParams {
    pub protocol: String,
    pub asset: Address,
    pub amount: U256,
    pub on_behalf_of: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BorrowParams {
    pub protocol: String,
    pub asset: Address,
    pub amount: U256,
    pub interest_rate_mode: InterestRateMode,
    pub on_behalf_of: Address,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterestRateMode {
    Variable,
    Stable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepayParams {
    pub protocol: String,
    pub asset: Address,
    pub amount: U256,
    pub interest_rate_mode: InterestRateMode,
    pub on_behalf_of: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawParams {
    pub protocol: String,
    pub asset: Address,
    pub amount: U256,
    pub to: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LendingRates {
    pub protocol: String,
    pub asset: Address,
    pub supply_apy: f64,
    pub borrow_variable_apy: f64,
    pub borrow_stable_apy: Option<f64>,
    pub utilization: f64,
    pub total_supply: U256,
    pub total_borrow: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPosition {
    pub protocol: String,
    pub user: Address,
    pub supplies: Vec<PositionAsset>,
    pub borrows: Vec<PositionAsset>,
    pub health_factor: Option<f64>,
    pub net_apy: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionAsset {
    pub asset: Address,
    pub symbol: String,
    pub amount: U256,
    pub value_usd: Option<f64>,
}

// === CDP Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCdpParams {
    pub protocol: String,
    pub collateral: Address,
    pub collateral_amount: U256,
    pub debt_amount: U256,
    pub recipient: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdjustCdpParams {
    pub protocol: String,
    pub cdp_id: U256,
    pub collateral_delta: Option<U256>,
    pub debt_delta: Option<U256>,
    pub add_collateral: bool,
    pub add_debt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloseCdpParams {
    pub protocol: String,
    pub cdp_id: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CdpInfo {
    pub protocol: String,
    pub cdp_id: U256,
    pub collateral: TokenAmount,
    pub debt: TokenAmount,
    pub collateral_ratio: f64,
    pub liquidation_price: Option<f64>,
}

// === Bridge Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeSendParams {
    pub protocol: String,
    pub token: Address,
    pub amount: U256,
    pub destination_chain: String,
    pub recipient: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeQuoteResult {
    pub protocol: String,
    pub fee: U256,
    pub estimated_time_secs: u64,
    pub amount_out: U256,
}

// === Liquid Staking Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StakeParams {
    pub protocol: String,
    pub amount: U256,
    pub recipient: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnstakeParams {
    pub protocol: String,
    pub amount: U256,
    pub recipient: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StakingInfo {
    pub protocol: String,
    pub staked_token: Address,
    pub liquid_token: Address,
    pub exchange_rate: f64,
    pub apy: Option<f64>,
    pub total_staked: U256,
}

// === Vault Types (ERC-4626) ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub protocol: String,
    pub vault_address: Address,
    pub asset: Address,
    pub total_assets: U256,
    pub total_supply: U256,
    pub apy: Option<f64>,
}

// === Derivatives Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DerivativesPositionParams {
    pub protocol: String,
    pub market: String,
    pub size: U256,
    pub collateral: U256,
    pub is_long: bool,
}

// === Options Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionParams {
    pub protocol: String,
    pub underlying: Address,
    pub strike_price: U256,
    pub expiry: u64,
    pub is_call: bool,
    pub amount: U256,
}

// === Yield Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YieldInfo {
    pub protocol: String,
    pub pool: String,
    pub apy: f64,
    pub tvl: U256,
    pub tokens: Vec<Address>,
}
