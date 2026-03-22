import { ProtocolEntry, ICdp, IDerivatives, IDex, IGaugeSystem, ILending, ILiquidStaking, INft, IOptions, IOracle, IVault, IYieldSource, SwapParams, DeFiTx, QuoteParams, QuoteResult, AddLiquidityParams, RemoveLiquidityParams, RewardInfo, PriceData, SupplyParams, BorrowParams, RepayParams, WithdrawParams, LendingRates, UserPosition, OpenCdpParams, AdjustCdpParams, CloseCdpParams, CdpInfo, VaultInfo, StakeParams, UnstakeParams, StakingInfo, YieldInfo, DerivativesPositionParams, OptionParams, NftCollectionInfo, NftTokenInfo } from '@hypurrquant/defi-core';
import { Address } from 'viem';

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
declare function createGauge(entry: ProtocolEntry): IGaugeSystem;
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

declare class UniswapV2Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx>;
    buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx>;
}

declare class UniswapV3Adapter implements IDex {
    private readonly protocolName;
    private readonly router;
    private readonly quoter;
    private readonly positionManager;
    private readonly fee;
    private readonly rpcUrl;
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
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
    buildAddLiquidity(_params: AddLiquidityParams): Promise<DeFiTx>;
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
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildSwap(params: SwapParams): Promise<DeFiTx>;
    quote(_params: QuoteParams): Promise<QuoteResult>;
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
    constructor(entry: ProtocolEntry, _rpcUrl?: string);
    name(): string;
    buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
    buildWithdraw(gauge: Address, amount: bigint): Promise<DeFiTx>;
    buildClaimRewards(gauge: Address): Promise<DeFiTx>;
    getPendingRewards(_gauge: Address, _user: Address): Promise<RewardInfo[]>;
    buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx>;
    buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx>;
    buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx>;
    buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx>;
    buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx>;
    buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx>;
    buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx>;
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

export { AaveOracleAdapter, AaveV3Adapter, AlgebraV3Adapter, BalancerV3Adapter, CompoundV2Adapter, CompoundV3Adapter, CurveStableSwapAdapter, DexSpotPrice, ERC4626VaultAdapter, ERC721Adapter, EulerV2Adapter, FelixCdpAdapter, FelixOracleAdapter, GenericDerivativesAdapter, GenericLstAdapter, GenericOptionsAdapter, GenericYieldAdapter, HlpVaultAdapter, KinetiqAdapter, MorphoBlueAdapter, PendleAdapter, RyskAdapter, SolidlyAdapter, SolidlyGaugeAdapter, StHypeAdapter, UniswapV2Adapter, UniswapV3Adapter, WooFiAdapter, createCdp, createDerivatives, createDex, createGauge, createLending, createLiquidStaking, createNft, createOptions, createOracleFromCdp, createOracleFromLending, createVault, createYieldSource };
