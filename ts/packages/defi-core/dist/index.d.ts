import { Address, Hex, PublicClient } from 'viem';

/** A built DeFi transaction ready for simulation or broadcast */
interface DeFiTx {
    description: string;
    to: Address;
    data: Hex;
    value: bigint;
    gas_estimate?: number;
    /** ERC20 approvals to check and send before broadcasting this tx */
    approvals?: Array<{
        token: Address;
        spender: Address;
        amount: bigint;
    }>;
    /** Pre-transactions to execute before the main tx (e.g. farming approval) */
    pre_txs?: DeFiTx[];
}
/** Result of executing or simulating a transaction */
interface ActionResult {
    tx_hash?: string;
    status: TxStatus;
    gas_used?: number;
    description: string;
    details: Record<string, unknown>;
}
/** Transaction status (serde: snake_case) */
declare enum TxStatus {
    DryRun = "dry_run",
    Simulated = "simulated",
    SimulationFailed = "simulation_failed",
    NeedsApproval = "needs_approval",
    Pending = "pending",
    Confirmed = "confirmed",
    Failed = "failed"
}
/** Token amount with decimals-aware formatting */
interface TokenAmount {
    token: Address;
    symbol: string;
    amount: bigint;
    decimals: number;
}
declare function formatHuman(t: TokenAmount): string;
/** Slippage tolerance in basis points */
interface Slippage {
    bps: number;
}
declare function newSlippage(bps: number): Slippage;
declare function defaultSwapSlippage(): Slippage;
declare function applyMinSlippage(slippage: Slippage, amount: bigint): bigint;
interface PriceData {
    source: string;
    source_type: string;
    asset: Address;
    price_usd: bigint;
    price_f64: number;
    block_number?: number;
    timestamp?: number;
}
interface SwapParams {
    protocol: string;
    token_in: Address;
    token_out: Address;
    amount_in: bigint;
    slippage: Slippage;
    recipient: Address;
    deadline?: number;
}
interface QuoteParams {
    protocol: string;
    token_in: Address;
    token_out: Address;
    amount_in: bigint;
}
interface QuoteResult {
    protocol: string;
    amount_out: bigint;
    price_impact_bps?: number;
    fee_bps?: number;
    route: string[];
}
interface AddLiquidityParams {
    protocol: string;
    token_a: Address;
    token_b: Address;
    amount_a: bigint;
    amount_b: bigint;
    recipient: Address;
    /** Optional lower tick for concentrated LP (defaults to full range) */
    tick_lower?: number;
    /** Optional upper tick for concentrated LP (defaults to full range) */
    tick_upper?: number;
    /** ±N% concentrated range around current price (e.g. 2 for ±2%) */
    range_pct?: number;
    /** Optional pool address for tick detection / single-side LP */
    pool?: Address;
}
interface RemoveLiquidityParams {
    protocol: string;
    token_a: Address;
    token_b: Address;
    liquidity: bigint;
    recipient: Address;
}
interface SupplyParams {
    protocol: string;
    asset: Address;
    amount: bigint;
    on_behalf_of: Address;
}
interface BorrowParams {
    protocol: string;
    asset: Address;
    amount: bigint;
    interest_rate_mode: InterestRateMode;
    on_behalf_of: Address;
}
/** Interest rate mode (serde: snake_case) */
declare enum InterestRateMode {
    Variable = "variable",
    Stable = "stable"
}
interface RepayParams {
    protocol: string;
    asset: Address;
    amount: bigint;
    interest_rate_mode: InterestRateMode;
    on_behalf_of: Address;
}
interface WithdrawParams {
    protocol: string;
    asset: Address;
    amount: bigint;
    to: Address;
}
interface LendingRates {
    protocol: string;
    asset: Address;
    supply_apy: number;
    borrow_variable_apy: number;
    borrow_stable_apy?: number;
    utilization: number;
    total_supply: bigint;
    total_borrow: bigint;
    /** Reward token addresses for supply-side incentives */
    supply_reward_tokens?: string[];
    /** Reward token addresses for borrow-side incentives */
    borrow_reward_tokens?: string[];
    /** Emissions per second per supply reward token (raw uint256 as string) */
    supply_emissions_per_second?: string[];
    /** Emissions per second per borrow reward token (raw uint256 as string) */
    borrow_emissions_per_second?: string[];
    /** Supply-side incentive APY (%) from reward token emissions */
    supply_incentive_apy?: number;
    /** Borrow-side incentive APY (%) from reward token emissions (negative = subsidized) */
    borrow_incentive_apy?: number;
}
interface UserPosition {
    protocol: string;
    user: Address;
    supplies: PositionAsset[];
    borrows: PositionAsset[];
    health_factor?: number;
    net_apy?: number;
}
interface PositionAsset {
    asset: Address;
    symbol: string;
    amount: bigint;
    value_usd?: number;
}
interface OpenCdpParams {
    protocol: string;
    collateral: Address;
    collateral_amount: bigint;
    debt_amount: bigint;
    recipient: Address;
}
interface AdjustCdpParams {
    protocol: string;
    cdp_id: bigint;
    collateral_delta?: bigint;
    debt_delta?: bigint;
    add_collateral: boolean;
    add_debt: boolean;
}
interface CloseCdpParams {
    protocol: string;
    cdp_id: bigint;
}
interface CdpInfo {
    protocol: string;
    cdp_id: bigint;
    collateral: TokenAmount;
    debt: TokenAmount;
    collateral_ratio: number;
    liquidation_price?: number;
}
interface StakeParams {
    protocol: string;
    amount: bigint;
    recipient: Address;
}
interface UnstakeParams {
    protocol: string;
    amount: bigint;
    recipient: Address;
}
interface StakingInfo {
    protocol: string;
    staked_token: Address;
    liquid_token: Address;
    exchange_rate: number;
    apy?: number;
    total_staked: bigint;
}
interface VaultInfo {
    protocol: string;
    vault_address: Address;
    asset: Address;
    total_assets: bigint;
    total_supply: bigint;
    apy?: number;
}
interface DerivativesPositionParams {
    protocol: string;
    market: string;
    size: bigint;
    collateral: bigint;
    is_long: boolean;
}
interface OptionParams {
    protocol: string;
    underlying: Address;
    strike_price: bigint;
    expiry: number;
    is_call: boolean;
    amount: bigint;
}
/** A pool that has an active emission gauge */
interface GaugedPool {
    pool: Address;
    gauge: Address;
    token0: string;
    token1: string;
    type: "V2" | "CL";
    tickSpacing?: number;
    stable?: boolean;
}
interface RewardInfo {
    token: Address;
    symbol: string;
    amount: bigint;
    value_usd?: number;
}
interface GaugeInfo {
    gauge: Address;
    pool: Address;
    total_staked: bigint;
    reward_rate: bigint;
    rewards: RewardInfo[];
}
interface VeNftInfo {
    token_id: bigint;
    amount: bigint;
    unlock_time: number;
    voting_power: bigint;
}
interface YieldInfo {
    protocol: string;
    pool: string;
    apy: number;
    tvl: bigint;
    tokens: Address[];
}
interface PortfolioSnapshot {
    timestamp: number;
    chain: string;
    wallet: string;
    tokens: TokenBalance[];
    defi_positions: DefiPosition[];
    total_value_usd: number;
}
interface TokenBalance {
    token: string;
    symbol: string;
    balance: bigint;
    value_usd: number;
    price_usd: number;
}
interface DefiPosition {
    protocol: string;
    type: "lending_supply" | "lending_borrow" | "lp" | "staking" | "vault";
    asset: string;
    amount: bigint;
    value_usd: number;
}
interface PortfolioPnL {
    period: string;
    start_value_usd: number;
    end_value_usd: number;
    pnl_usd: number;
    pnl_pct: number;
    token_changes: TokenChange[];
}
interface TokenChange {
    symbol: string;
    balance_change: bigint;
    value_change_usd: number;
}

type DefiErrorCode = "PROTOCOL_NOT_FOUND" | "TOKEN_NOT_FOUND" | "CHAIN_NOT_FOUND" | "INSUFFICIENT_BALANCE" | "INSUFFICIENT_ALLOWANCE" | "SLIPPAGE_EXCEEDED" | "SIMULATION_FAILED" | "ABI_ERROR" | "REGISTRY_ERROR" | "RPC_ERROR" | "PROVIDER_ERROR" | "CONTRACT_ERROR" | "INVALID_PARAM" | "UNSUPPORTED" | "TX_FAILED" | "INTERNAL";
declare class DefiError extends Error {
    readonly code: DefiErrorCode;
    constructor(code: DefiErrorCode, message: string);
    static protocolNotFound(name: string): DefiError;
    static tokenNotFound(name: string): DefiError;
    static chainNotFound(name: string): DefiError;
    static insufficientBalance(needed: string, available: string): DefiError;
    static insufficientAllowance(spender: Address): DefiError;
    static slippageExceeded(expected: string, actual: string): DefiError;
    static simulationFailed(reason: string): DefiError;
    static abiError(reason: string): DefiError;
    static registryError(reason: string): DefiError;
    static rpcError(reason: string): DefiError;
    static providerError(reason: string): DefiError;
    static contractError(reason: string): DefiError;
    static invalidParam(reason: string): DefiError;
    static unsupported(operation: string): DefiError;
    static internal(reason: string): DefiError;
    toJSON(): {
        error: string;
    };
}
type Result<T> = T;

/**
 * BigInt JSON serialization utilities.
 *
 * Rust's alloy U256 (backed by ruint) serializes to JSON as 0x-prefixed
 * lowercase hex strings (e.g., "0x75bcd15"). We must match this exactly
 * for behavioral parity.
 */
/** JSON replacer for Rust parity — bigint becomes 0x-hex string */
declare function jsonReplacer(_key: string, value: unknown): unknown;
/** JSON replacer for SDK consumers — bigint becomes decimal string */
declare function jsonReplacerDecimal(_key: string, value: unknown): unknown;
/** Stringify with decimal bigint handling */
declare function jsonStringify(data: unknown, pretty?: boolean): string;
/** Parse a 0x-hex or decimal string to bigint */
declare function parseBigInt(value: string): bigint;

declare const erc20Abi: readonly [{
    readonly name: "name";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "symbol";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}, {
    readonly name: "decimals";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
}, {
    readonly name: "totalSupply";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "balanceOf";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "account";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "transfer";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "to";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "allowance";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "owner";
    }, {
        readonly type: "address";
        readonly name: "spender";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "approve";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "spender";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "transferFrom";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "from";
    }, {
        readonly type: "address";
        readonly name: "to";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}];

declare function buildApprove(token: Address, spender: Address, amount: bigint): DeFiTx;
declare function buildTransfer(token: Address, to: Address, amount: bigint): DeFiTx;

declare function getProvider(rpcUrl: string): PublicClient;
declare function clearProviderCache(): void;

declare const MULTICALL3_ADDRESS: Address;
declare function buildMulticall(calls: Array<[Address, Hex]>): DeFiTx;
declare function multicallRead(rpcUrl: string, calls: Array<[Address, Hex]>): Promise<(Hex | null)[]>;
declare function decodeU256(data: Hex | null): bigint;
declare function decodeU128(data: Hex | null): bigint;

interface IDex {
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

interface ILending {
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(user: Address): Promise<UserPosition>;
}

/** ve(3,3) Gauge operations — stake LP tokens to earn emissions */
interface IGauge {
    name(): string;
    /** Resolve gauge address from pool address via voter */
    resolveGauge?(pool: Address): Promise<Address>;
    /** Deposit LP tokens into gauge */
    buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint, lpToken?: Address): Promise<DeFiTx>;
    /** Withdraw LP tokens or NFT from gauge */
    buildWithdraw(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    /** Claim earned rewards from gauge */
    buildClaimRewards(gauge: Address, account?: Address): Promise<DeFiTx>;
    /** Claim rewards for a CL gauge NFT position (Hybra V4 style) */
    buildClaimRewardsByTokenId?(gauge: Address, tokenId: bigint): Promise<DeFiTx>;
    /** Get pending rewards for a user */
    getPendingRewards(gauge: Address, user: Address): Promise<RewardInfo[]>;
    /** Get pending rewards for a CL gauge NFT position */
    getPendingRewardsByTokenId?(gauge: Address, tokenId: bigint): Promise<bigint>;
    /** Discover all pools that have active emission gauges */
    discoverGaugedPools?(): Promise<GaugedPool[]>;
}
/** ve(3,3) Vote-escrow operations — lock tokens for veNFT */
interface IVoteEscrow {
    name(): string;
    /** Create a new veNFT lock */
    buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx>;
    /** Increase lock amount */
    buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx>;
    /** Increase lock duration */
    buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx>;
    /** Withdraw after lock expires */
    buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx>;
}
/** ve(3,3) Voter operations — vote on gauge emissions */
interface IVoter {
    name(): string;
    /** Vote for gauges with veNFT */
    buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx>;
    /** Claim bribes for voted pools */
    buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx>;
    /** Claim trading fees */
    buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx>;
}
/** Combined ve(3,3) system — gauge staking + vote-escrow + voter */
interface IGaugeSystem extends IGauge, IVoteEscrow, IVoter {
}

/** ERC-4626 Vault interface — covers Capital Allocators, Yield Aggregators, and Yield vaults */
interface IVault {
    name(): string;
    buildDeposit(assets: bigint, receiver: Address): Promise<DeFiTx>;
    buildWithdraw(assets: bigint, receiver: Address, owner: Address): Promise<DeFiTx>;
    totalAssets(): Promise<bigint>;
    convertToShares(assets: bigint): Promise<bigint>;
    convertToAssets(shares: bigint): Promise<bigint>;
    getVaultInfo(): Promise<VaultInfo>;
}

interface ILiquidStaking {
    name(): string;
    buildStake(params: StakeParams): Promise<DeFiTx>;
    buildUnstake(params: UnstakeParams): Promise<DeFiTx>;
    getInfo(): Promise<StakingInfo>;
}

interface ICdp {
    name(): string;
    buildOpen(params: OpenCdpParams): Promise<DeFiTx>;
    buildAdjust(params: AdjustCdpParams): Promise<DeFiTx>;
    buildClose(params: CloseCdpParams): Promise<DeFiTx>;
    getCdpInfo(cdpId: bigint): Promise<CdpInfo>;
}

/** Oracle price feed — reads prices from lending protocol oracles or price feeds */
interface IOracle {
    name(): string;
    /** Get price for an asset from this oracle */
    getPrice(asset: Address): Promise<PriceData>;
    /** Get prices for multiple assets */
    getPrices(assets: Address[]): Promise<PriceData[]>;
}

interface IDerivatives {
    name(): string;
    buildOpenPosition(params: DerivativesPositionParams): Promise<DeFiTx>;
    buildClosePosition(params: DerivativesPositionParams): Promise<DeFiTx>;
}

interface IOptions {
    name(): string;
    buildBuy(params: OptionParams): Promise<DeFiTx>;
    buildSell(params: OptionParams): Promise<DeFiTx>;
}

interface IYieldSource {
    name(): string;
    getYields(): Promise<YieldInfo[]>;
    buildDeposit(pool: string, amount: bigint, recipient: Address): Promise<DeFiTx>;
    buildWithdraw(pool: string, amount: bigint, recipient: Address): Promise<DeFiTx>;
}

interface IYieldAggregator {
    name(): string;
    getVaults(): Promise<VaultInfo[]>;
    buildDeposit(vault: Address, amount: bigint, recipient: Address): Promise<DeFiTx>;
    buildWithdraw(vault: Address, amount: bigint, recipient: Address, owner: Address): Promise<DeFiTx>;
}

interface NftCollectionInfo {
    address: Address;
    name: string;
    symbol: string;
    total_supply?: bigint;
    floor_price?: bigint;
    floor_price_currency?: string;
}
interface NftTokenInfo {
    collection: Address;
    token_id: bigint;
    owner: Address;
    token_uri?: string;
}
interface INft {
    name(): string;
    getCollectionInfo(collection: Address): Promise<NftCollectionInfo>;
    getTokenInfo(collection: Address, tokenId: bigint): Promise<NftTokenInfo>;
    getBalance(owner: Address, collection: Address): Promise<bigint>;
}

declare class ChainConfig {
    name: string;
    chain_id: number;
    rpc_url: string;
    explorer_url?: string;
    native_token: string;
    wrapped_native?: string;
    multicall3?: string;
    effectiveRpcUrl(): string;
}

interface TokenEntry {
    symbol: string;
    name: string;
    address: Address;
    decimals: number;
    is_native_wrapper?: boolean;
    tags?: string[];
}

declare enum ProtocolCategory {
    Dex = "dex",
    Lending = "lending",
    Cdp = "cdp",
    Bridge = "bridge",
    LiquidStaking = "liquid_staking",
    YieldSource = "yield_source",
    YieldAggregator = "yield_aggregator",
    Vault = "vault",
    Derivatives = "derivatives",
    Options = "options",
    LiquidityManager = "liquidity_manager",
    Nft = "nft",
    Other = "other"
}
declare function protocolCategoryLabel(category: ProtocolCategory): string;
interface PoolInfo {
    name: string;
    address: Address;
    token0: string;
    token1: string;
    tick_spacing?: number;
    gauge?: Address;
    stable?: boolean;
}
interface ProtocolEntry {
    name: string;
    slug: string;
    category: ProtocolCategory;
    interface: string;
    chain: string;
    native?: boolean;
    contracts?: Record<string, Address>;
    pools?: PoolInfo[];
    description?: string;
}

declare class Registry {
    chains: Map<string, ChainConfig>;
    tokens: Map<string, TokenEntry[]>;
    protocols: ProtocolEntry[];
    private constructor();
    static loadEmbedded(): Registry;
    private static loadChains;
    private static loadTokens;
    private static loadProtocols;
    getChain(name: string): ChainConfig;
    getProtocol(name: string): ProtocolEntry;
    getProtocolsByCategory(category: ProtocolCategory): ProtocolEntry[];
    getProtocolsForChain(chain: string): ProtocolEntry[];
    resolveToken(chain: string, symbol: string): TokenEntry;
    /**
     * Resolve a pool by name (e.g. "WHYPE/USDC") from a protocol's pool list.
     * Returns the pool info or throws if not found.
     */
    resolvePool(protocolSlug: string, poolName: string): PoolInfo;
}

export { type ActionResult, type AddLiquidityParams, type AdjustCdpParams, type BorrowParams, type CdpInfo, ChainConfig, type CloseCdpParams, type DeFiTx, DefiError, type DefiErrorCode, type DefiPosition, type DerivativesPositionParams, type GaugeInfo, type GaugedPool, type ICdp, type IDerivatives, type IDex, type IGauge, type IGaugeSystem, type ILending, type ILiquidStaking, type INft, type IOptions, type IOracle, type IVault, type IVoteEscrow, type IVoter, type IYieldAggregator, type IYieldSource, InterestRateMode, type LendingRates, MULTICALL3_ADDRESS, type NftCollectionInfo, type NftTokenInfo, type OpenCdpParams, type OptionParams, type PoolInfo, type PortfolioPnL, type PortfolioSnapshot, type PositionAsset, type PriceData, ProtocolCategory, type ProtocolEntry, type QuoteParams, type QuoteResult, Registry, type RemoveLiquidityParams, type RepayParams, type Result, type RewardInfo, type Slippage, type StakeParams, type StakingInfo, type SupplyParams, type SwapParams, type TokenAmount, type TokenBalance, type TokenChange, type TokenEntry, TxStatus, type UnstakeParams, type UserPosition, type VaultInfo, type VeNftInfo, type WithdrawParams, type YieldInfo, applyMinSlippage, buildApprove, buildMulticall, buildTransfer, clearProviderCache, decodeU128, decodeU256, defaultSwapSlippage, erc20Abi, formatHuman, getProvider, jsonReplacer, jsonReplacerDecimal, jsonStringify, multicallRead, newSlippage, parseBigInt, protocolCategoryLabel };
