import { ProtocolEntry, DeFiTx, RewardInfo, ICdp, IDerivatives, IDex, IGaugeSystem, ILending, ILiquidStaking, IGauge, INft, IOptions, IOracle, IVault, IYieldSource, SwapParams, QuoteParams, QuoteResult, AddLiquidityParams, RemoveLiquidityParams, PriceData, SupplyParams, BorrowParams, RepayParams, WithdrawParams, LendingRates, UserPosition, OpenCdpParams, AdjustCdpParams, CloseCdpParams, CdpInfo, VaultInfo, StakeParams, UnstakeParams, StakingInfo, YieldInfo, DerivativesPositionParams, OptionParams, NftCollectionInfo, NftTokenInfo } from '@hypurrquant/defi-core';
import { Address } from 'viem';

interface LBAddLiquidityParams {
    pool: Address;
    tokenX: Address;
    tokenY: Address;
    binStep: number;
    amountX: bigint;
    amountY: bigint;
    /** Number of bins on each side of active bin to distribute across (default: 5) */
    numBins?: number;
    /** Active bin id desired (defaults to on-chain query if rpcUrl provided) */
    activeIdDesired?: number;
    recipient: Address;
    deadline?: bigint;
}
interface LBRemoveLiquidityParams {
    tokenX: Address;
    tokenY: Address;
    binStep: number;
    binIds: number[];
    /** Amount of LB tokens to remove per bin (in order matching binIds) */
    amounts: bigint[];
    amountXMin?: bigint;
    amountYMin?: bigint;
    recipient: Address;
    deadline?: bigint;
}
interface LBPosition {
    binId: number;
    balance: bigint;
}
interface RewardedPool {
    pool: Address;
    rewarder: Address;
    rewardToken: Address;
    minBinId: number;
    maxBinId: number;
    pid: number;
    stopped: boolean;
    tokenX: Address;
    tokenY: Address;
    symbolX: string;
    symbolY: string;
    isTopPool: boolean;
    moePerDay: number;
    rangeTvlUsd: number;
    aprPercent: number;
    rewardedBins: number;
}
declare class MerchantMoeLBAdapter {
    private readonly protocolName;
    private readonly lbRouter;
    private readonly lbFactory;
    private readonly lbQuoter?;
    private readonly rpcUrl?;
    /** WMNT address (lb_mid_wmnt in config) used for MOE price routing */
    private readonly wmnt?;
    /** USDT address (lb_mid_usdt in config) used for MNT/USD price routing */
    private readonly usdt?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    private requireRpc;
    /**
     * Build an addLiquidity transaction for a Liquidity Book pair.
     * Distributes tokenX/tokenY uniformly across active bin ± numBins.
     */
    buildAddLiquidity(params: LBAddLiquidityParams): Promise<DeFiTx>;
    /**
     * Build a removeLiquidity transaction for specific LB bins.
     */
    buildRemoveLiquidity(params: LBRemoveLiquidityParams): Promise<DeFiTx>;
    /**
     * Auto-detect bin IDs for a pool from the rewarder's rewarded range.
     * Falls back to active bin ± 50 scan if no rewarder exists.
     */
    private autoDetectBins;
    /**
     * Get pending MOE rewards for a user across specified bin IDs.
     * If binIds is omitted, auto-detects from the rewarder's rewarded range.
     * Reads the rewarder address from the pool's hooks parameters.
     */
    getPendingRewards(user: Address, pool: Address, binIds?: number[]): Promise<RewardInfo[]>;
    /**
     * Build a claim rewards transaction for specific LB bins.
     * If binIds is omitted, auto-detects from the rewarder's rewarded range.
     */
    buildClaimRewards(user: Address, pool: Address, binIds?: number[]): Promise<DeFiTx>;
    /**
     * Discover all active rewarded LB pools by iterating the factory.
     * Uses 7 multicall batches to minimise RPC round-trips and avoid 429s.
     *
     * Batch 1: getNumberOfLBPairs(), then getLBPairAtIndex(i) for all i
     * Batch 2: getLBHooksParameters() for all pairs → extract rewarder addresses
     * Batch 3: isStopped/getRewardedRange/getRewardToken/getPid/getMasterChef for each rewarder
     * Batch 4: getTokenX/getTokenY for each rewarded pair, then symbol() for unique tokens
     * Batch 5: Bootstrap MasterChef→VeMoe, then getMoePerSecond/getTreasuryShare/getStaticShare/getTotalWeight/getTopPoolIds
     * Batch 6: VeMoe.getWeight(pid) for each rewarded pool
     * Batch 7: Pool.getBin(binId) for all bins in rewarded range of each pool
     * Price: LB Quoter findBestPathFromAmountIn for MOE/WMNT and WMNT/USDT prices
     */
    discoverRewardedPools(): Promise<RewardedPool[]>;
    /**
     * Get a user's LB positions (bin balances) across a range of bin IDs.
     * If binIds is omitted, auto-detects from the rewarder's rewarded range (or active ± 50).
     */
    getUserPositions(user: Address, pool: Address, binIds?: number[]): Promise<LBPosition[]>;
}

interface IncentiveKey {
    rewardToken: Address;
    bonusRewardToken: Address;
    pool: Address;
    nonce: bigint;
}
interface FarmingPool {
    pool: Address;
    key: IncentiveKey;
    totalReward: bigint;
    bonusReward: bigint;
    active: boolean;
}
declare class KittenSwapFarmingAdapter {
    private readonly protocolName;
    private readonly farmingCenter;
    private readonly eternalFarming;
    private readonly positionManager;
    private readonly rpcUrl;
    constructor(protocolName: string, farmingCenter: Address, eternalFarming: Address, positionManager: Address, rpcUrl: string);
    name(): string;
    /**
     * Discover the active IncentiveKey for a given pool.
     * 1. Check runtime cache
     * 2. Read numOfIncentives() for max nonce
     * 3. Batch-query via Multicall3 in reverse order (newest first)
     * 4. Return first active (non-deactivated, totalReward > 0) incentive
     */
    discoverIncentiveKey(pool: Address): Promise<IncentiveKey | null>;
    /**
     * Build approveForFarming tx on the PositionManager.
     * Required before enterFarming if not already approved.
     */
    buildApproveForFarming(tokenId: bigint): Promise<DeFiTx | null>;
    /**
     * Build enterFarming tx for a position NFT.
     * Checks farming approval first and returns pre_txs if needed.
     */
    buildEnterFarming(tokenId: bigint, pool: Address, _owner: Address): Promise<DeFiTx>;
    /**
     * Build a tx that exits farming for a position NFT (unstakes).
     */
    buildExitFarming(tokenId: bigint, pool: Address): Promise<DeFiTx>;
    /**
     * Build a multicall tx that collects rewards for a staked position and claims them.
     * Pattern: multicall([collectRewards(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
     */
    buildCollectRewards(tokenId: bigint, pool: Address, owner: Address): Promise<DeFiTx>;
    /**
     * Build a tx that only claims already-accumulated rewards (no position change needed).
     */
    buildClaimReward(owner: Address): Promise<DeFiTx>;
    /**
     * Query pending rewards for a staked position NFT.
     */
    getPendingRewards(tokenId: bigint, pool: Address): Promise<{
        reward: bigint;
        bonusReward: bigint;
    }>;
    /**
     * Discover all pools with active farming incentives.
     * Dynamically scans all nonces (0..numOfIncentives) via Multicall3 and
     * groups results by pool. Only returns the latest active incentive per pool.
     */
    discoverFarmingPools(): Promise<FarmingPool[]>;
}

/** Create a Dex implementation from a protocol registry entry */
declare function createDex(entry: ProtocolEntry, rpcUrl?: string): IDex;
/** Create a Lending implementation from a protocol registry entry */
declare function createLending(entry: ProtocolEntry, rpcUrl?: string): ILending;
/** Create a CDP implementation from a protocol registry entry */
declare function createCdp(entry: ProtocolEntry, rpcUrl?: string): ICdp;
/** Create a Vault implementation from a protocol registry entry */
declare function createVault(entry: ProtocolEntry, rpcUrl?: string): IVault;
/** Create a LiquidStaking implementation from a protocol registry entry */
declare function createLiquidStaking(entry: ProtocolEntry, rpcUrl?: string): ILiquidStaking;
/** Create a GaugeSystem implementation from a protocol registry entry */
declare function createGauge(entry: ProtocolEntry, rpcUrl?: string): IGaugeSystem;
/** Create a MasterChef IGauge implementation from a protocol registry entry */
declare function createMasterChef(entry: ProtocolEntry, rpcUrl?: string): IGauge;
/** Create a YieldSource implementation — falls back to GenericYield for unknown interfaces */
declare function createYieldSource(entry: ProtocolEntry, rpcUrl?: string): IYieldSource;
/** Create a Derivatives implementation — falls back to GenericDerivatives for unknown interfaces */
declare function createDerivatives(entry: ProtocolEntry, rpcUrl?: string): IDerivatives;
/** Create an Options implementation — falls back to GenericOptions for unknown interfaces */
declare function createOptions(entry: ProtocolEntry, rpcUrl?: string): IOptions;
/** Create an NFT implementation from a protocol registry entry */
declare function createNft(entry: ProtocolEntry, rpcUrl?: string): INft;
/** Create an Oracle from a lending protocol entry (Aave V3 forks have an oracle contract) */
declare function createOracleFromLending(entry: ProtocolEntry, rpcUrl: string): IOracle;
/** Create an Oracle from a CDP protocol entry (Felix has its own PriceFeed contract) */
declare function createOracleFromCdp(entry: ProtocolEntry, _asset: Address, rpcUrl: string): IOracle;
/** Create a MerchantMoeLBAdapter for Liquidity Book operations */
declare function createMerchantMoeLB(entry: ProtocolEntry, rpcUrl?: string): MerchantMoeLBAdapter;
/** Create a KittenSwapFarmingAdapter for Algebra eternal farming operations */
declare function createKittenSwapFarming(entry: ProtocolEntry, rpcUrl: string): KittenSwapFarmingAdapter;

declare class UniswapV2Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly rpcUrl;
    private readonly lbQuoter;
    private readonly lbIntermediaries;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(params: QuoteParams): Promise<QuoteResult>;
    private lbQuote;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class UniswapV3Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly quoter;
    private readonly positionManager;
    private readonly factory;
    private readonly fee;
    private readonly rpcUrl;
    private readonly useTickSpacingQuoter;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class AlgebraV3Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly quoter;
    private readonly positionManager;
    private readonly rpcUrl;
    private readonly useSingleQuoter;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class BalancerV3Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(_params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class CurveStableSwapAdapter implements IDex {
    private readonly protocolName;
    private readonly router;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class SolidlyAdapter implements IDex {
    private readonly protocolName;
    private readonly router;
    /** Default to volatile (false). True for stablecoin pairs. */
    private readonly defaultStable;
    private readonly rpcUrl;
    /** Factory address — present on Velodrome V2 / Aerodrome forks */
    private readonly factory;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    private encodeV1;
    private encodeV2;
    quote(params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class WooFiAdapter implements IDex {
    private readonly protocolName;
    private readonly router;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(_params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class SolidlyGaugeAdapter implements IGaugeSystem {
    private readonly protocolName;
    private readonly voter;
    private readonly veToken;
    private readonly rpcUrl;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint, lpToken?: Address): Promise<DeFiTx>;
    buildWithdraw(gauge: Address, amount: bigint): Promise<DeFiTx>;
    /**
     * Resolve gauge address from a pool address via voter contract.
     * Tries gaugeForPool (Ramses), poolToGauge (NEST), gauges (classic Solidly).
     */
    resolveGauge(pool: Address): Promise<Address>;
    /**
     * Discover reward tokens for a gauge.
     * Returns { tokens, multiToken } where multiToken indicates getReward(account, tokens[]) support.
     */
    private discoverRewardTokens;
    buildClaimRewards(gauge: Address, account?: Address): Promise<DeFiTx>;
    /**
     * Claim rewards for a CL gauge by NFT tokenId (Hybra V4 style).
     */
    buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<DeFiTx>;
    getPendingRewards(gauge: Address, user: Address): Promise<RewardInfo[]>;
    /**
     * Get pending rewards for a CL gauge NFT position (Hybra V4 style).
     */
    getPendingRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<bigint>;
    buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx>;
    buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx>;
    buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx>;
    buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx>;
    buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx>;
    buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx>;
    buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx>;
}

declare class MasterChefAdapter implements IGauge {
    private readonly protocolName;
    private readonly masterchef;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    /**
     * Deposit LP tokens into a MasterChef farm.
     * `gauge` is the pool address (unused for calldata — MasterChef is the target).
     * `tokenId` carries the farm pid.
     */
    buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    /**
     * Withdraw LP tokens from a MasterChef farm.
     * `gauge` is used to look up the pid description only; call site should pass pid via tokenId
     * on the deposit flow. Here pid defaults to 0 — callers should encode the pid in the gauge
     * address slot or wrap this adapter with a pid-aware helper.
     */
    buildWithdraw(gauge: Address, amount: bigint): Promise<DeFiTx>;
    /** Withdraw LP tokens specifying a pid explicitly (MasterChef extension beyond IGauge). */
    buildWithdrawPid(pid: bigint, amount: bigint): Promise<DeFiTx>;
    /** Claim pending MOE rewards. IGauge interface provides no pid — defaults to pid=0. */
    buildClaimRewards(gauge: Address): Promise<DeFiTx>;
    /** Claim pending MOE rewards for a specific pid (MasterChef extension beyond IGauge). */
    buildClaimRewardsPid(pid: bigint): Promise<DeFiTx>;
    /** Get pending MOE rewards for a user. Requires rpcUrl. */
    getPendingRewards(_gauge: Address, user: Address): Promise<RewardInfo[]>;
}

/**
 * Utility for deriving spot prices from DEX quoters.
 * Quotes 1 unit of the token against a quote token (e.g. USDC) to derive price.
 */
declare class DexSpotPrice {
    /**
     * Get the spot price for `token` denominated in `quoteToken` (e.g. USDC).
     *
     * `tokenDecimals` — decimals of the input token (to know how much "1 unit" is)
     * `quoteDecimals` — decimals of the quote token (to convert the output to number)
     */
    static getPrice(dex: IDex, token: Address, tokenDecimals: number, quoteToken: Address, quoteDecimals: number): Promise<PriceData>;
}

declare class ThenaCLAdapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly positionManager;
    private readonly factory;
    private readonly rpcUrl;
    private readonly defaultTickSpacing;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx>;
}

/**
 * Hybra ve(3,3) Gauge adapter using GaugeManager pattern.
 * CL gauges require NFT deposit and claim goes through GaugeManager (not directly to gauge).
 */
declare class HybraGaugeAdapter implements IGaugeSystem {
    private readonly protocolName;
    private readonly gaugeManager;
    private readonly veToken;
    private readonly voter;
    private readonly positionManager;
    private readonly rpcUrl;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    resolveGauge(pool: Address): Promise<Address>;
    buildDeposit(gauge: Address, _amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    buildWithdraw(gauge: Address, _amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    buildClaimRewards(gauge: Address, _account?: Address): Promise<DeFiTx>;
    buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<DeFiTx>;
    getPendingRewards(gauge: Address, _user: Address): Promise<RewardInfo[]>;
    getPendingRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<bigint>;
    buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx>;
    buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx>;
    buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx>;
    buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx>;
    buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx>;
    buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx>;
    buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx>;
}

declare class AaveV3Adapter implements ILending {
    private readonly protocolName;
    private readonly pool;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(user: Address): Promise<UserPosition>;
}

declare class AaveV2Adapter implements ILending {
    private readonly protocolName;
    private readonly pool;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(user: Address): Promise<UserPosition>;
}

declare class AaveOracleAdapter implements IOracle {
    private readonly protocolName;
    private readonly oracle;
    private readonly rpcUrl;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    getPrice(asset: Address): Promise<PriceData>;
    getPrices(assets: Address[]): Promise<PriceData[]>;
}

declare class CompoundV2Adapter implements ILending {
    private readonly protocolName;
    private readonly defaultVtoken;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(_user: Address): Promise<UserPosition>;
}

declare class CompoundV3Adapter implements ILending {
    private readonly protocolName;
    private readonly comet;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(_user: Address): Promise<UserPosition>;
}

declare class EulerV2Adapter implements ILending {
    private readonly protocolName;
    private readonly euler;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(_user: Address): Promise<UserPosition>;
}

declare class MorphoBlueAdapter implements ILending {
    private readonly protocolName;
    private readonly morpho;
    private readonly defaultVault?;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(_user: Address): Promise<UserPosition>;
}

declare class FelixCdpAdapter implements ICdp {
    private readonly protocolName;
    private readonly borrowerOperations;
    private readonly troveManager?;
    private readonly hintHelpers?;
    private readonly sortedTroves?;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    private getHints;
    buildOpen(params: OpenCdpParams): Promise<DeFiTx>;
    buildAdjust(params: AdjustCdpParams): Promise<DeFiTx>;
    buildClose(params: CloseCdpParams): Promise<DeFiTx>;
    getCdpInfo(cdpId: bigint): Promise<CdpInfo>;
}

declare class FelixOracleAdapter implements IOracle {
    private readonly protocolName;
    private readonly priceFeed;
    private readonly asset;
    private readonly rpcUrl;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    getPrice(asset: Address): Promise<PriceData>;
    getPrices(assets: Address[]): Promise<PriceData[]>;
}

declare class ERC4626VaultAdapter implements IVault {
    private readonly protocolName;
    private readonly vaultAddress;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildDeposit(assets: bigint, receiver: Address): Promise<DeFiTx>;
    buildWithdraw(assets: bigint, receiver: Address, owner: Address): Promise<DeFiTx>;
    totalAssets(): Promise<bigint>;
    convertToShares(assets: bigint): Promise<bigint>;
    convertToAssets(shares: bigint): Promise<bigint>;
    getVaultInfo(): Promise<VaultInfo>;
}

declare class GenericLstAdapter implements ILiquidStaking {
    private readonly protocolName;
    private readonly staking;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildStake(params: StakeParams): Promise<DeFiTx>;
    buildUnstake(params: UnstakeParams): Promise<DeFiTx>;
    getInfo(): Promise<StakingInfo>;
}

declare class StHypeAdapter implements ILiquidStaking {
    private readonly protocolName;
    private readonly staking;
    private readonly sthypeToken?;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildStake(params: StakeParams): Promise<DeFiTx>;
    buildUnstake(params: UnstakeParams): Promise<DeFiTx>;
    getInfo(): Promise<StakingInfo>;
}

declare class KinetiqAdapter implements ILiquidStaking {
    private readonly protocolName;
    private readonly staking;
    private readonly liquidToken;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    buildStake(params: StakeParams): Promise<DeFiTx>;
    buildUnstake(params: UnstakeParams): Promise<DeFiTx>;
    getInfo(): Promise<StakingInfo>;
}

declare class PendleAdapter implements IYieldSource {
    private readonly protocolName;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    getYields(): Promise<YieldInfo[]>;
    buildDeposit(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx>;
    buildWithdraw(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx>;
}

declare class GenericYieldAdapter implements IYieldSource {
    private readonly protocolName;
    private readonly interfaceName;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    getYields(): Promise<YieldInfo[]>;
    buildDeposit(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx>;
    buildWithdraw(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx>;
}

declare class HlpVaultAdapter implements IDerivatives {
    private readonly protocolName;
    private readonly vault;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildOpenPosition(params: DerivativesPositionParams): Promise<DeFiTx>;
    buildClosePosition(params: DerivativesPositionParams): Promise<DeFiTx>;
}

declare class GenericDerivativesAdapter implements IDerivatives {
    private readonly protocolName;
    private readonly interfaceName;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildOpenPosition(_params: DerivativesPositionParams): Promise<DeFiTx>;
    buildClosePosition(_params: DerivativesPositionParams): Promise<DeFiTx>;
}

declare class RyskAdapter implements IOptions {
    private readonly protocolName;
    private readonly controller;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildBuy(params: OptionParams): Promise<DeFiTx>;
    buildSell(params: OptionParams): Promise<DeFiTx>;
}

declare class GenericOptionsAdapter implements IOptions {
    private readonly protocolName;
    private readonly interfaceName;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildBuy(_params: OptionParams): Promise<DeFiTx>;
    buildSell(_params: OptionParams): Promise<DeFiTx>;
}

declare class ERC721Adapter implements INft {
    private readonly protocolName;
    private readonly rpcUrl?;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    getCollectionInfo(collection: Address): Promise<NftCollectionInfo>;
    getTokenInfo(collection: Address, tokenId: bigint): Promise<NftTokenInfo>;
    getBalance(owner: Address, collection: Address): Promise<bigint>;
}

export { AaveOracleAdapter, AaveV2Adapter, AaveV3Adapter, AlgebraV3Adapter, BalancerV3Adapter, CompoundV2Adapter, CompoundV3Adapter, CurveStableSwapAdapter, DexSpotPrice, ERC4626VaultAdapter, ERC721Adapter, EulerV2Adapter, type FarmingPool, FelixCdpAdapter, FelixOracleAdapter, GenericDerivativesAdapter, GenericLstAdapter, GenericOptionsAdapter, GenericYieldAdapter, HlpVaultAdapter, HybraGaugeAdapter, type IncentiveKey, KinetiqAdapter, KittenSwapFarmingAdapter, type LBAddLiquidityParams, type LBPosition, type LBRemoveLiquidityParams, MasterChefAdapter, MerchantMoeLBAdapter, MorphoBlueAdapter, PendleAdapter, type RewardedPool, RyskAdapter, SolidlyAdapter, SolidlyGaugeAdapter, StHypeAdapter, ThenaCLAdapter, UniswapV2Adapter, UniswapV3Adapter, WooFiAdapter, createCdp, createDerivatives, createDex, createGauge, createKittenSwapFarming, createLending, createLiquidStaking, createMasterChef, createMerchantMoeLB, createNft, createOptions, createOracleFromCdp, createOracleFromLending, createVault, createYieldSource };
