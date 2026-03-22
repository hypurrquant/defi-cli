import { createPublicClient, http, parseAbi, encodeFunctionData, zeroAddress } from "viem";
import type { Address } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const MORPHO_ABI = parseAbi([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)",
]);

const META_MORPHO_ABI = parseAbi([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
]);

const IRM_ABI = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)",
]);

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

type MarketParams = {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
};

function defaultMarketParams(loanToken: Address = zeroAddress as Address): MarketParams {
  return {
    loanToken,
    collateralToken: zeroAddress as Address,
    oracle: zeroAddress as Address,
    irm: zeroAddress as Address,
    lltv: 0n,
  };
}

export class MorphoBlueAdapter implements ILending {
  private readonly protocolName: string;
  private readonly morpho: Address;
  private readonly defaultVault?: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const morpho = contracts["morpho_blue"];
    if (!morpho) throw DefiError.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault =
      contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
  }

  name(): string {
    return this.protocolName;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "supply",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"],
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "borrow",
      args: [market, params.amount, 0n, params.on_behalf_of, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "repay",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "withdraw",
      args: [market, params.amount, 0n, params.to, params.to],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      throw DefiError.contractError(`[${this.protocolName}] No MetaMorpho vault configured for rate query`);
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const queueLen = await client.readContract({
      address: this.defaultVault,
      abi: META_MORPHO_ABI,
      functionName: "supplyQueueLength",
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`); });

    if ((queueLen as bigint) === 0n) {
      return {
        protocol: this.protocolName,
        asset,
        supply_apy: 0,
        borrow_variable_apy: 0,
        utilization: 0,
        total_supply: 0n,
        total_borrow: 0n,
      };
    }

    const marketId = await client.readContract({
      address: this.defaultVault,
      abi: META_MORPHO_ABI,
      functionName: "supplyQueue",
      args: [0n],
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`); }) as `0x${string}`;

    const mkt = await client.readContract({
      address: this.morpho,
      abi: MORPHO_ABI,
      functionName: "market",
      args: [marketId],
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] market() failed: ${e}`); });

    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mkt as [bigint, bigint, bigint, bigint, bigint, bigint];

    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;

    const params2 = await client.readContract({
      address: this.morpho,
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      args: [marketId],
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] idToMarketParams failed: ${e}`); });

    const [loanToken, collateralToken, oracle, irm, lltv] = params2 as [Address, Address, Address, Address, bigint];

    const irmMarketParams: MarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };

    const borrowRatePerSec = await client.readContract({
      address: irm,
      abi: IRM_ABI,
      functionName: "borrowRateView",
      args: [irmMarketParams, irmMarket],
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`); }) as bigint;

    const ratePerSec = Number(borrowRatePerSec) / 1e18;
    const borrowApy = ratePerSec * SECONDS_PER_YEAR * 100;
    const feePct = Number(fee) / 1e18;
    const supplyApy = borrowApy * util * (1 - feePct);

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: util * 100,
      total_supply: totalSupplyAssets,
      total_borrow: totalBorrowAssets,
    };
  }

  async getUserPosition(_user: Address): Promise<UserPosition> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Morpho Blue user positions are per-market — use vault deposit/withdraw instead`,
    );
  }
}
