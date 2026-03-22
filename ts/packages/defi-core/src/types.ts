import type { Address, Hex } from "viem";

// === Transaction Types ===

/** A built DeFi transaction ready for simulation or broadcast */
export interface DeFiTx {
  description: string;
  to: Address;
  data: Hex;
  value: bigint;
  gas_estimate?: number;
}

/** Result of executing or simulating a transaction */
export interface ActionResult {
  tx_hash?: string;
  status: TxStatus;
  gas_used?: number;
  description: string;
  details: Record<string, unknown>;
}

/** Transaction status (serde: snake_case) */
export enum TxStatus {
  DryRun = "dry_run",
  Simulated = "simulated",
  SimulationFailed = "simulation_failed",
  Pending = "pending",
  Confirmed = "confirmed",
  Failed = "failed",
}

// === Token Types ===

/** Token amount with decimals-aware formatting */
export interface TokenAmount {
  token: Address;
  symbol: string;
  amount: bigint;
  decimals: number;
}

export function formatHuman(t: TokenAmount): string {
  const divisor = 10n ** BigInt(t.decimals);
  const whole = t.amount / divisor;
  const frac = t.amount % divisor;
  return `${whole}.${frac.toString().padStart(t.decimals, "0")} ${t.symbol}`;
}

/** Slippage tolerance in basis points */
export interface Slippage {
  bps: number;
}

export function newSlippage(bps: number): Slippage {
  return { bps };
}

export function defaultSwapSlippage(): Slippage {
  return { bps: 50 };
}

export function applyMinSlippage(slippage: Slippage, amount: bigint): bigint {
  return (amount * BigInt(10000 - slippage.bps)) / 10000n;
}

// === Oracle / Price Types ===

export interface PriceData {
  source: string;
  source_type: string;
  asset: Address;
  price_usd: bigint;
  price_f64: number;
  block_number?: number;
  timestamp?: number;
}

// === DEX Types ===

export interface SwapParams {
  protocol: string;
  token_in: Address;
  token_out: Address;
  amount_in: bigint;
  slippage: Slippage;
  recipient: Address;
  deadline?: number;
}

export interface QuoteParams {
  protocol: string;
  token_in: Address;
  token_out: Address;
  amount_in: bigint;
}

export interface QuoteResult {
  protocol: string;
  amount_out: bigint;
  price_impact_bps?: number;
  fee_bps?: number;
  route: string[];
}

export interface AddLiquidityParams {
  protocol: string;
  token_a: Address;
  token_b: Address;
  amount_a: bigint;
  amount_b: bigint;
  recipient: Address;
}

export interface RemoveLiquidityParams {
  protocol: string;
  token_a: Address;
  token_b: Address;
  liquidity: bigint;
  recipient: Address;
}

// === Lending Types ===

export interface SupplyParams {
  protocol: string;
  asset: Address;
  amount: bigint;
  on_behalf_of: Address;
}

export interface BorrowParams {
  protocol: string;
  asset: Address;
  amount: bigint;
  interest_rate_mode: InterestRateMode;
  on_behalf_of: Address;
}

/** Interest rate mode (serde: snake_case) */
export enum InterestRateMode {
  Variable = "variable",
  Stable = "stable",
}

export interface RepayParams {
  protocol: string;
  asset: Address;
  amount: bigint;
  interest_rate_mode: InterestRateMode;
  on_behalf_of: Address;
}

export interface WithdrawParams {
  protocol: string;
  asset: Address;
  amount: bigint;
  to: Address;
}

export interface LendingRates {
  protocol: string;
  asset: Address;
  supply_apy: number;
  borrow_variable_apy: number;
  borrow_stable_apy?: number;
  utilization: number;
  total_supply: bigint;
  total_borrow: bigint;
}

export interface UserPosition {
  protocol: string;
  user: Address;
  supplies: PositionAsset[];
  borrows: PositionAsset[];
  health_factor?: number;
  net_apy?: number;
}

export interface PositionAsset {
  asset: Address;
  symbol: string;
  amount: bigint;
  value_usd?: number;
}

// === CDP Types ===

export interface OpenCdpParams {
  protocol: string;
  collateral: Address;
  collateral_amount: bigint;
  debt_amount: bigint;
  recipient: Address;
}

export interface AdjustCdpParams {
  protocol: string;
  cdp_id: bigint;
  collateral_delta?: bigint;
  debt_delta?: bigint;
  add_collateral: boolean;
  add_debt: boolean;
}

export interface CloseCdpParams {
  protocol: string;
  cdp_id: bigint;
}

export interface CdpInfo {
  protocol: string;
  cdp_id: bigint;
  collateral: TokenAmount;
  debt: TokenAmount;
  collateral_ratio: number;
  liquidation_price?: number;
}

// === Liquid Staking Types ===

export interface StakeParams {
  protocol: string;
  amount: bigint;
  recipient: Address;
}

export interface UnstakeParams {
  protocol: string;
  amount: bigint;
  recipient: Address;
}

export interface StakingInfo {
  protocol: string;
  staked_token: Address;
  liquid_token: Address;
  exchange_rate: number;
  apy?: number;
  total_staked: bigint;
}

// === Vault Types (ERC-4626) ===

export interface VaultInfo {
  protocol: string;
  vault_address: Address;
  asset: Address;
  total_assets: bigint;
  total_supply: bigint;
  apy?: number;
}

// === Derivatives Types ===

export interface DerivativesPositionParams {
  protocol: string;
  market: string;
  size: bigint;
  collateral: bigint;
  is_long: boolean;
}

// === Options Types ===

export interface OptionParams {
  protocol: string;
  underlying: Address;
  strike_price: bigint;
  expiry: number;
  is_call: boolean;
  amount: bigint;
}

// === ve(3,3) Types ===

export interface RewardInfo {
  token: Address;
  symbol: string;
  amount: bigint;
  value_usd?: number;
}

export interface GaugeInfo {
  gauge: Address;
  pool: Address;
  total_staked: bigint;
  reward_rate: bigint;
  rewards: RewardInfo[];
}

export interface VeNftInfo {
  token_id: bigint;
  amount: bigint;
  unlock_time: number;
  voting_power: bigint;
}

// === Yield Types ===

export interface YieldInfo {
  protocol: string;
  pool: string;
  apy: number;
  tvl: bigint;
  tokens: Address[];
}

// === Portfolio Tracker Types ===
export interface PortfolioSnapshot {
  timestamp: number;
  chain: string;
  wallet: string;
  tokens: TokenBalance[];
  defi_positions: DefiPosition[];
  total_value_usd: number;
}

export interface TokenBalance {
  token: string;
  symbol: string;
  balance: bigint;
  value_usd: number;
  price_usd: number;
}

export interface DefiPosition {
  protocol: string;
  type: "lending_supply" | "lending_borrow" | "lp" | "staking" | "vault";
  asset: string;
  amount: bigint;
  value_usd: number;
}

export interface PortfolioPnL {
  period: string;
  start_value_usd: number;
  end_value_usd: number;
  pnl_usd: number;
  pnl_pct: number;
  token_changes: TokenChange[];
}

export interface TokenChange {
  symbol: string;
  balance_change: bigint;
  value_change_usd: number;
}
