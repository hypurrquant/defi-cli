import { IGaugeSystem, ProtocolEntry, GaugedPool, DeFiTx, RewardInfo, IGauge, ICdp, IDerivatives, IDex, ILending, ILiquidStaking, INft, IOptions, IOracle, IVault, IYieldSource, SwapParams, QuoteParams, QuoteResult, AddLiquidityParams, RemoveLiquidityParams, PriceData, SupplyParams, BorrowParams, RepayParams, WithdrawParams, LendingRates, UserPosition, MarketInfo, SupplyCollateralParams, WithdrawCollateralParams, OpenCdpParams, AdjustCdpParams, CloseCdpParams, CdpInfo, VaultInfo, StakeParams, UnstakeParams, StakingInfo, YieldInfo, DerivativesPositionParams, OptionParams, NftCollectionInfo, NftTokenInfo } from '@hypurrquant/defi-core';
import { Address, Hex } from 'viem';

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
    private readonly poolFactory;
    private readonly rpcUrl;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    name(): string;
    discoverGaugedPools(): Promise<GaugedPool[]>;
    resolveGauge(pool: Address): Promise<Address>;
    buildDeposit(gauge: Address, _amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    buildWithdraw(gauge: Address, _amount: bigint, tokenId?: bigint, opts?: {
        redeemType?: number;
    }): Promise<DeFiTx>;
    buildClaimRewards(gauge: Address, _account?: Address): Promise<DeFiTx>;
    buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint, opts?: {
        redeemType?: number;
    }): Promise<DeFiTx>;
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

declare class SolidlyGaugeAdapter implements IGaugeSystem {
    private readonly protocolName;
    private readonly voter;
    private readonly veToken;
    private readonly rpcUrl;
    private readonly clFactory;
    private readonly v2Factory;
    private readonly tokens;
    private readonly clNftMode;
    private readonly positionManager;
    constructor(entry: ProtocolEntry, rpcUrl?: string, tokens?: Address[]);
    name(): string;
    /** Scan V2 and CL factories for pools that have active emission gauges. */
    discoverGaugedPools(): Promise<GaugedPool[]>;
    /**
     * Batch query rewardRate, totalSupply, rewardToken for all discovered gauges.
     * Handles both single-token (rewardRate) and multi-token (rewardData) gauges.
     */
    private _enrichGaugeMetrics;
    private _discoverV2GaugedPools;
    private _discoverCLGaugedPools;
    buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint, lpToken?: Address): Promise<DeFiTx>;
    buildWithdraw(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
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
     * Claim rewards for a CL gauge by NFT tokenId (Hybra V4 style — single-arg getReward(tokenId)).
     */
    buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<DeFiTx>;
    /**
     * Ramses-CL claim via NPM.getPeriodReward — the user-facing claim path.
     * The gauge contract restricts `getReward*` to authorized claimers (voter + NPM only);
     * EOAs must route through NPM, which calls into the gauge with msg.sender = NPM.
     *
     * ABI: getPeriodReward(uint256 period, uint256 tokenId, address[] tokens, address receiver)
     * `period` defaults to current Solidly weekly epoch index (block.timestamp / 604800).
     * `tokens` defaults to gauge.getRewardTokens() when `gauge` is provided.
     *
     * Verified 2026-04-29 on anvil fork: NPM.getPeriodReward(2938, 177068, [..., xRAM], wallet)
     * delivered 71.11 xRAM after 1h emission warp; direct gauge.getReward(...) reverts
     * with NOT_AUTHORIZED_CLAIMER for the same EOA.
     */
    buildClaimRewardsViaNPMPeriodReward(npm: Address, tokenId: bigint, receiver: Address, opts?: {
        tokens?: Address[];
        gauge?: Address;
        period?: bigint;
    }): Promise<DeFiTx>;
    /**
     * @deprecated Direct gauge.getReward(tokenId, tokens[]) reverts with NOT_AUTHORIZED_CLAIMER
     * for EOAs on Ramses CL. Use buildClaimRewardsViaNPMPeriodReward instead.
     */
    buildClaimRewardsByCLTokenIdMulti(gauge: Address, tokenId: bigint, tokens?: Address[]): Promise<DeFiTx>;
    /**
     * Ramses-CL-style pending rewards: earned(token, tokenId) per reward token from
     * gauge.getRewardTokens(). Returns raw amounts; caller resolves USD value.
     */
    getPendingRewardsByCLTokenIdMulti(gauge: Address, tokenId: bigint): Promise<RewardInfo[]>;
    getPendingRewards(gauge: Address, user: Address): Promise<RewardInfo[]>;
    /**
     * Get pending rewards for a CL gauge NFT position (Hybra V4 style).
     */
    getPendingRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<bigint>;
    /**
     * Get pending rewards for an Aerodrome Slipstream CL gauge NFT position.
     * Uses the earned(address account, uint256 tokenId) overload, which is required
     * for CL gauges — the single-param earned(address) reverts on these contracts.
     */
    getPendingRewardsByCLTokenId(gauge: Address, user: Address, tokenId: bigint): Promise<bigint>;
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
    poolTvlUsd: number;
    aprPercent: number;
    rewardedBins: number;
    /** Global: total net MOE/day flowing to all dynamic pools */
    totalMoePerDay?: number;
    moePriceUsd?: number;
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
     * Scan ±scanRange bins around the active bin and return the user's non-zero balance bin IDs.
     * Critical: the rewarder may track pending rewards for bins OUTSIDE its current rewarded range
     * (e.g. when the rewarded range shifts after a position was already in place). Always claim
     * against the user's actual positions, not the rewarder's "current" range.
     */
    findUserBinsWithBalance(pool: Address, user: Address, scanRange?: number): Promise<number[]>;
    /**
     * Build a claim rewards transaction for specific LB bins.
     * If binIds is omitted, auto-detects from the user's actual non-zero balance bins (active ±50 scan).
     * This catches rewards accumulated in bins outside the rewarder's current rewarded range.
     */
    buildClaimRewards(user: Address, pool: Address, binIds?: number[]): Promise<DeFiTx>;
    /**
     * List every LB pair from the factory with basic pair info (no rewarder /
     * APR enrichment). Useful when the factory has pools but none have hooks
     * deployed yet (e.g. early-stage Monad TraderJoe).
     *
     * Three multicall batches: pair addresses, token addresses, token symbols.
     */
    discoverAllPools(): Promise<Array<{
        pool: Address;
        tokenX: Address;
        tokenY: Address;
        symbolX: string;
        symbolY: string;
    }>>;
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
    private readonly factory;
    private readonly rewardToken;
    private readonly bonusRewardToken;
    constructor(protocolName: string, farmingCenter: Address, eternalFarming: Address, positionManager: Address, rpcUrl: string, factory?: Address, rewardToken?: Address, bonusRewardToken?: Address);
    name(): string;
    /**
     * Discover the active IncentiveKey for a given pool.
     * 1. Check runtime cache
     * 2. Batch-query nonces 0-60 via single multicall (61 calls)
     * 3. Return first non-zero incentive (totalReward > 0 and not deactivated)
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
     * Discover all KittenSwap pools with active farming incentives.
     *
     * Steps:
     * 1. Generate all unique token pair combos from HYPEREVM_TOKENS (includes KITTEN)
     * 2. Batch poolByPair calls via multicall against the Algebra factory
     * 3. For each found pool, batch-scan nonces 0-60 via multicall
     * 4. Return enriched FarmingPool[] for pools with active incentives
     */
    discoverFarmingPools(): Promise<FarmingPool[]>;
}

interface NestClaimStatus {
    totalClaimedRaw: bigint;
    totalAvailableRaw: bigint;
    pendingRaw: bigint;
    pendingFormatted: number;
}
interface NestClaimTicket {
    user: Address;
    amount: bigint;
    timestamp: bigint;
    day: bigint | null;
    signature: Hex;
}
interface NestAprEstimateParams {
    poolAddress: Address;
    minTick: number;
    maxTick: number;
    token0Amount: bigint;
    token1Amount: bigint;
}
declare class NestOffChainAdapter {
    private readonly baseUrl;
    private readonly fallbackUrl;
    private readonly voter;
    constructor(entry: ProtocolEntry);
    name(): string;
    /** Cumulative claimed + available NEST emissions for a wallet */
    getClaimStatus(wallet: Address): Promise<NestClaimStatus>;
    /**
     * Backend-signed claim ticket (or null when nothing to claim).
     * Returns the raw ticket; `buildClaim()` is not yet implemented because the
     * voter contract source is unverified — function selector 0xd6d7a454 takes
     * 5 dynamic arrays we have not been able to disambiguate yet.
     */
    getClaimTicket(wallet: Address): Promise<NestClaimTicket | null>;
    /** APR estimate (percent) for a CL position with given tick range and amounts */
    estimateLpApr(params: NestAprEstimateParams): Promise<number>;
    /** Pending NEST emissions as IGauge-compatible RewardInfo[] */
    getPendingRewards(user: Address): Promise<RewardInfo[]>;
    /** Voter address used by aggregateClaim() — exposed for callers that build the tx themselves */
    getVoterAddress(): Address;
    /**
     * Build a Nest voter claim transaction by reproducing the byte-level calldata
     * pattern observed in successful onchain claims, swapping in the ticket's
     * (amount, timestamp, signature) words.
     *
     * The voter implementation source is not verified, so we cannot derive a
     * Solidity ABI for selector 0xd6d7a454. Instead, two known-successful claim
     * transactions were diffed:
     *
     *   tx1: 0x99f35cfdb6fc3885ebe046c4625acc083e42d5afe6ca6962c6c81cd9006b99ba
     *   tx2: 0x3e120ab95e9e0a9148cb8964993dd066b8a36363353fe727462231857724e7bb
     *
     * 31 of 34 calldata words are identical between the two; only words 21, 22,
     * 25, 26, 27 differ — and those map exactly to the backend ticket's
     * (amount, timestamp, sigR, sigS, sigVPadded). msg.sender is not encoded in
     * calldata; voter binds the claim to the caller, so the ticket signature
     * authorizes the EOA holding the wallet.
     *
     * Throws if no claim ticket is available.
     */
    buildClaim(wallet: Address): Promise<DeFiTx>;
    private fetchJson;
    private requestInit;
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
declare function createGauge(entry: ProtocolEntry, rpcUrl?: string, tokens?: Address[]): IGaugeSystem;
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
/** Create a NestOffChainAdapter for Nest reward queries via blaze.nest.aegas.it / usenest.xyz */
declare function createNestOffChain(entry: ProtocolEntry): NestOffChainAdapter;
/**
 * Discriminated union returned by createRewardReader. Callers narrow on `kind`
 * to access the strategy-specific adapter API.
 *
 *   - off_chain_api          → Nest backend-signed tickets (NestOffChainAdapter)
 *   - on_chain_farming_center → Algebra Integral eternal farming (KittenSwap)
 *   - on_chain_gauge_tokenid  → gauge.earned(tokenId) per CL position (Hybra)
 *   - on_chain_gauge          → Solidly-style gauge.earned(addr) (Aerodrome V2, Thena V1)
 *   - auto_stake              → Ramses x(3,3): no external claim needed
 *   - on_chain_masterchef     → MasterChef pid→pending (PancakeSwap V3)
 *   - none                    → Swap-only DEX, no rewards
 */
type RewardReader = {
    kind: "off_chain_api";
    adapter: NestOffChainAdapter;
} | {
    kind: "on_chain_farming_center";
    adapter: KittenSwapFarmingAdapter;
} | {
    kind: "on_chain_gauge_tokenid";
    adapter: HybraGaugeAdapter;
} | {
    kind: "on_chain_gauge";
    adapter: SolidlyGaugeAdapter;
} | {
    kind: "auto_stake";
    adapter: SolidlyGaugeAdapter;
} | {
    kind: "on_chain_masterchef";
    adapter: MasterChefAdapter;
} | {
    kind: "none";
};
/**
 * Build a strategy-aware reward reader for the given protocol entry.
 *
 * Reads `entry.reward_strategy` first (set in the protocol TOML). When the
 * field is missing (legacy entries), falls back to inferring from the
 * adapter `interface` and contract presence, mirroring the previous
 * implicit dispatch in createGauge.
 */
declare function createRewardReader(entry: ProtocolEntry, rpcUrl?: string, tokens?: Address[]): RewardReader;
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
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
    /**
     * Collect accrued LP trading fees for a CL position via NPM.collect().
     * Used as the reward path for V3 forks with reward_strategy = "lp_fee_only"
     * (e.g., HyperSwap V3, Project X — no gauge/emissions, fees are the only reward).
     */
    buildCollectFees(tokenId: bigint, recipient: Address): Promise<DeFiTx>;
    /**
     * Compound: collect accrued fees and immediately re-add them as liquidity to the same position.
     * Flow: static-call collect to learn fee amounts → multicall([collect, increaseLiquidity]) on NPM.
     * Requires existing token approvals on the NPM (set during initial mint).
     * v1: V3 fee-only protocols (Project X, HyperSwap V3). Gauge protocols need swap routing first.
     */
    buildCompound(tokenId: bigint, recipient: Address, opts?: {
        slippageBps?: number;
    }): Promise<DeFiTx>;
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
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class BalancerV3Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly pool;
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
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
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
    buildSetUseReserveAsCollateral(asset: Address, useAsCollateral: boolean): Promise<DeFiTx>;
    buildSetEMode(categoryId: number): Promise<DeFiTx>;
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
    private readonly vTokenCandidates;
    private readonly rpcUrl?;
    private vTokenByAsset;
    private nativeVtoken;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    private resolveVtoken;
    /** True iff `vtoken` is the cETH/vBNB-style native cToken for this protocol. */
    private isNativeVtoken;
    name(): string;
    private vtokenFor;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildWithdraw(params: WithdrawParams): Promise<DeFiTx>;
    getRates(asset: Address): Promise<LendingRates>;
    getUserPosition(user: Address): Promise<UserPosition>;
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
    getUserPosition(user: Address): Promise<UserPosition>;
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
    private readonly metaMorphoVaults;
    private readonly metaMorphoVaultEntries;
    private readonly namedMarkets;
    private readonly namedMarketByName;
    private vaultAssetMap;
    constructor(entry: ProtocolEntry, rpcUrl?: string);
    /**
     * Resolve a friendly market name (e.g. `WMON-AUSD`) to its 32-byte
     * marketId via the per-protocol TOML registry. Returns null when the
     * adapter has no markets[] block or the name doesn't match any entry —
     * callers fall back to treating the input as a raw hex marketId.
     */
    resolveMarketIdByName(name: string): `0x${string}` | null;
    /**
     * Returns the registered named markets for diagnostics (e.g. CLI error
     * messages listing valid choices when the user passes an unknown name).
     */
    listNamedMarkets(): ReadonlyArray<MarketInfo>;
    private resolveVault;
    name(): string;
    /**
     * Resolve a Morpho Blue marketId into the full MarketParams tuple by
     * calling Morpho.idToMarketParams(id). Used by every direct-market
     * method (supply / borrow / repay / withdraw / supplyCollateral /
     * withdrawCollateral) so the caller only has to pass the 32-byte
     * marketId — same shape as the Morpho UI / API.
     */
    private resolveMarketParams;
    buildSupply(params: SupplyParams): Promise<DeFiTx>;
    buildBorrow(params: BorrowParams): Promise<DeFiTx>;
    buildRepay(params: RepayParams): Promise<DeFiTx>;
    buildSupplyCollateral(params: SupplyCollateralParams): Promise<DeFiTx>;
    buildWithdrawCollateral(params: WithdrawCollateralParams): Promise<DeFiTx>;
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

export { AaveOracleAdapter, AaveV2Adapter, AaveV3Adapter, AlgebraV3Adapter, BalancerV3Adapter, CompoundV2Adapter, CompoundV3Adapter, CurveStableSwapAdapter, DexSpotPrice, ERC4626VaultAdapter, ERC721Adapter, EulerV2Adapter, type FarmingPool, FelixCdpAdapter, FelixOracleAdapter, GenericDerivativesAdapter, GenericLstAdapter, GenericOptionsAdapter, GenericYieldAdapter, HlpVaultAdapter, HybraGaugeAdapter, type IncentiveKey, KinetiqAdapter, KittenSwapFarmingAdapter, type LBAddLiquidityParams, type LBPosition, type LBRemoveLiquidityParams, MasterChefAdapter, MerchantMoeLBAdapter, MorphoBlueAdapter, type NestAprEstimateParams, type NestClaimStatus, type NestClaimTicket, NestOffChainAdapter, PendleAdapter, type RewardReader, type RewardedPool, RyskAdapter, SolidlyAdapter, SolidlyGaugeAdapter, StHypeAdapter, ThenaCLAdapter, UniswapV2Adapter, UniswapV3Adapter, WooFiAdapter, createCdp, createDerivatives, createDex, createGauge, createKittenSwapFarming, createLending, createLiquidStaking, createMasterChef, createMerchantMoeLB, createNestOffChain, createNft, createOptions, createOracleFromCdp, createOracleFromLending, createRewardReader, createVault, createYieldSource };
