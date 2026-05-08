import { parseAbi, encodeFunctionData, decodeFunctionResult, zeroAddress, createPublicClient, http } from "viem";
import type { Address, Hex } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  multicallRead,
  decodeU256,
  type ProtocolEntry,
  type MarketInfo,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type SupplyCollateralParams,
  type WithdrawCollateralParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const MORPHO_ABI = parseAbi([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function supplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data) external",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)",
  "function withdrawCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, address receiver) external",
]);

const META_MORPHO_ABI = parseAbi([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
]);

const ERC4626_ABI = parseAbi([
  "function asset() external view returns (address)",
  "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)",
  "function balanceOf(address owner) external view returns (uint256)",
]);

const MAX_UINT256 = (1n << 256n) - 1n;

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

function decodeMarket(data: Hex | null): [bigint, bigint, bigint, bigint, bigint, bigint] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({
      abi: MORPHO_ABI,
      functionName: "market",
      data,
    }) as [bigint, bigint, bigint, bigint, bigint, bigint];
  } catch {
    return null;
  }
}

function decodeMarketParams(data: Hex | null): [Address, Address, Address, Address, bigint] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      data,
    }) as [Address, Address, Address, Address, bigint];
  } catch {
    return null;
  }
}

export class MorphoBlueAdapter implements ILending {
  private readonly protocolName: string;
  private readonly morpho: Address;
  private readonly defaultVault?: Address;
  private readonly rpcUrl?: string;
  private readonly metaMorphoVaults: Address[];
  private readonly metaMorphoVaultEntries: Array<{ key: string; addr: Address }>;
  private readonly namedMarkets: ReadonlyArray<MarketInfo>;
  private readonly namedMarketByName: ReadonlyMap<string, `0x${string}`>;
  private vaultAssetMap: Map<string, Address> | null = null;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const morpho = contracts["morpho_blue"];
    if (!morpho) throw DefiError.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault =
      contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
    this.metaMorphoVaultEntries = Object.entries(contracts)
      .filter(([key]) => /^fe[a-z0-9_]+$/i.test(key) || key === "vault")
      .map(([key, addr]) => ({ key, addr }));
    this.metaMorphoVaults = this.metaMorphoVaultEntries.map((e) => e.addr);

    // Lowercase the lookup key so `--market WMON-AUSD` and `wmon-ausd`
    // both resolve. `id` stays canonical-case for downstream RPC use.
    this.namedMarkets = entry.markets ?? [];
    const byName = new Map<string, `0x${string}`>();
    for (const m of this.namedMarkets) byName.set(m.name.toLowerCase(), m.id);
    this.namedMarketByName = byName;
  }

  /**
   * Resolve a friendly market name (e.g. `WMON-AUSD`) to its 32-byte
   * marketId via the per-protocol TOML registry. Returns null when the
   * adapter has no markets[] block or the name doesn't match any entry —
   * callers fall back to treating the input as a raw hex marketId.
   */
  resolveMarketIdByName(name: string): `0x${string}` | null {
    return this.namedMarketByName.get(name.toLowerCase()) ?? null;
  }

  /**
   * Returns the registered named markets for diagnostics (e.g. CLI error
   * messages listing valid choices when the user passes an unknown name).
   */
  listNamedMarkets(): ReadonlyArray<MarketInfo> {
    return this.namedMarkets;
  }

  private async resolveVault(asset: Address, preferKey?: string): Promise<Address | null> {
    if (this.metaMorphoVaultEntries.length === 0 || !this.rpcUrl) return null;
    if (preferKey) {
      const direct = this.metaMorphoVaultEntries.find((e) => e.key === preferKey);
      if (direct) return direct.addr;
    }
    if (!this.vaultAssetMap) {
      const calls = this.metaMorphoVaultEntries.map((e) => [
        e.addr,
        encodeFunctionData({ abi: ERC4626_ABI, functionName: "asset" }),
      ]) as Array<[Address, Hex]>;
      const results = await multicallRead(this.rpcUrl, calls).catch(() => []);
      const map = new Map<string, { key: string; addr: Address }>();
      for (let i = 0; i < results.length; i++) {
        const data = results[i];
        if (!data || data.length < 66) continue;
        const a = (`0x${data.slice(26, 66)}`).toLowerCase();
        const entry = this.metaMorphoVaultEntries[i] as { key: string; addr: Address };
        const existing = map.get(a);
        // Prefer canonical (shortest key) — avoids feusdt0_frontier silently overwriting feusdt0
        if (!existing || entry.key.length < existing.key.length) {
          map.set(a, entry);
        }
      }
      const flatMap = new Map<string, Address>();
      for (const [k, v] of map) flatMap.set(k, v.addr);
      this.vaultAssetMap = flatMap;
    }
    return this.vaultAssetMap.get(asset.toLowerCase()) ?? null;
  }

  name(): string {
    return this.protocolName;
  }

  /**
   * Resolve a Morpho Blue marketId into the full MarketParams tuple by
   * calling Morpho.idToMarketParams(id). Used by every direct-market
   * method (supply / borrow / repay / withdraw / supplyCollateral /
   * withdrawCollateral) so the caller only has to pass the 32-byte
   * marketId — same shape as the Morpho UI / API.
   */
  private async resolveMarketParams(marketId: `0x${string}`): Promise<MarketParams> {
    if (!this.rpcUrl) {
      throw DefiError.rpcError(
        `[${this.protocolName}] No RPC URL configured — cannot resolve marketId ${marketId}`,
      );
    }
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    let result: readonly [Address, Address, Address, Address, bigint];
    try {
      result = await client.readContract({
        address: this.morpho,
        abi: MORPHO_ABI,
        functionName: "idToMarketParams",
        args: [marketId],
      }) as readonly [Address, Address, Address, Address, bigint];
    } catch (e) {
      throw DefiError.rpcError(
        `[${this.protocolName}] idToMarketParams(${marketId}) failed: ${e}`,
      );
    }
    const [loanToken, collateralToken, oracle, irm, lltv] = result;
    if (loanToken === zeroAddress || collateralToken === zeroAddress || lltv === 0n) {
      throw DefiError.invalidParam(
        `[${this.protocolName}] marketId ${marketId} resolves to an empty MarketParams ` +
          `(loan=${loanToken}, collateral=${collateralToken}, lltv=${lltv}). ` +
          `Verify the id matches a registered market on this chain.`,
      );
    }
    return { loanToken, collateralToken, oracle, irm, lltv };
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    // Direct Morpho Blue market (loan-side LP) when caller pins marketId.
    if (params.market_id) {
      const market = await this.resolveMarketParams(params.market_id);
      const data = encodeFunctionData({
        abi: MORPHO_ABI,
        functionName: "supply",
        args: [market, params.amount, 0n, params.on_behalf_of, "0x"],
      });
      return {
        description: `[${this.protocolName}] Supply ${params.amount} of ${params.asset} to market ${params.market_id.slice(0, 10)}…`,
        to: this.morpho,
        data,
        value: 0n,
        gas_estimate: 350_000,
        approvals: [{ token: params.asset, spender: this.morpho, amount: params.amount }],
      };
    }
    const vault = await this.resolveVault(params.asset);
    if (vault) {
      const data = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: "deposit",
        args: [params.amount, params.on_behalf_of],
      });
      return {
        description: `[${this.protocolName}] Deposit ${params.amount} into MetaMorpho vault`,
        to: vault,
        data,
        value: 0n,
        gas_estimate: 400_000,
        approvals: [{ token: params.asset, spender: vault, amount: params.amount }],
      };
    }
    throw DefiError.invalidParam(
      `[${this.protocolName}] supply requires either a registered MetaMorpho vault for ` +
        `${params.asset} or an explicit --market <marketId>. The legacy zero-MarketParams ` +
        `stub was removed (it always reverted on-chain).`,
    );
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    if (!params.market_id) {
      throw DefiError.invalidParam(
        `[${this.protocolName}] Morpho Blue borrow requires --market <marketId>. ` +
          `Find one via the Morpho API (https://blue-api.morpho.org/graphql).`,
      );
    }
    const market = await this.resolveMarketParams(params.market_id);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "borrow",
      args: [market, params.amount, 0n, params.on_behalf_of, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} of ${params.asset} from market ${params.market_id.slice(0, 10)}…`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 400_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    if (!params.market_id) {
      throw DefiError.invalidParam(
        `[${this.protocolName}] Morpho Blue repay requires --market <marketId>.`,
      );
    }
    const market = await this.resolveMarketParams(params.market_id);
    // Max-repay path: when caller passes `--amount max` (= maxUint256), the
    // CLI's parseAmount() gives us 2^256-1. Morpho's repay() reverts if
    // assets > borrowed (toSharesUp underflows), so we instead repay by
    // SHARES — pass `shares = position[id][user].borrowShares, assets = 0`.
    // This cleanly closes the position even when toAssetsDown(borrowShares)
    // rounds to 0 wei (the post-repay residual that left users stuck before
    // 2026-05-07).
    if (params.amount === MAX_UINT256) {
      if (!this.rpcUrl) {
        throw DefiError.rpcError(
          `[${this.protocolName}] max-repay requires an RPC URL to read borrowShares.`,
        );
      }
      const client = createPublicClient({ transport: http(this.rpcUrl) });
      const positionAbi = parseAbi([
        "function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
      ]);
      const pos = await client.readContract({
        address: this.morpho,
        abi: positionAbi,
        functionName: "position",
        args: [params.market_id, params.on_behalf_of],
      }) as readonly [bigint, bigint, bigint];
      const [, borrowShares] = pos;
      if (borrowShares === 0n) {
        throw DefiError.invalidParam(
          `[${this.protocolName}] cannot repay max — user has no borrow position in market ${params.market_id}.`,
        );
      }
      const data = encodeFunctionData({
        abi: MORPHO_ABI,
        functionName: "repay",
        args: [market, 0n, borrowShares, params.on_behalf_of, "0x"],
      });
      // Approve generously since the contract pulls assets equivalent to
      // borrowShares × current borrow rate; rounded up. Use uint256 max so
      // small-rate-of-change interest doesn't fail the approve mid-flight.
      return {
        description: `[${this.protocolName}] Repay max (${borrowShares} shares) to market ${params.market_id.slice(0, 10)}…`,
        to: this.morpho,
        data,
        value: 0n,
        gas_estimate: 350_000,
        approvals: [{ token: params.asset, spender: this.morpho, amount: MAX_UINT256 }],
      };
    }
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "repay",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} of ${params.asset} to market ${params.market_id.slice(0, 10)}…`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 350_000,
      approvals: [{ token: params.asset, spender: this.morpho, amount: params.amount }],
    };
  }

  async buildSupplyCollateral(params: SupplyCollateralParams): Promise<DeFiTx> {
    const market = await this.resolveMarketParams(params.market_id);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "supplyCollateral",
      args: [market, params.amount, params.on_behalf_of, "0x"],
    });
    return {
      description: `[${this.protocolName}] Supply collateral ${params.amount} of ${params.asset} to market ${params.market_id.slice(0, 10)}…`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 350_000,
      approvals: [{ token: params.asset, spender: this.morpho, amount: params.amount }],
    };
  }

  async buildWithdrawCollateral(params: WithdrawCollateralParams): Promise<DeFiTx> {
    const market = await this.resolveMarketParams(params.market_id);
    const data = encodeFunctionData({
      abi: MORPHO_ABI,
      functionName: "withdrawCollateral",
      args: [market, params.amount, params.to, params.to],
    });
    return {
      description: `[${this.protocolName}] Withdraw collateral ${params.amount} of ${params.asset} from market ${params.market_id.slice(0, 10)}…`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    // Direct Morpho Blue market (loan-side withdrawal) when caller pins marketId.
    if (params.market_id) {
      const market = await this.resolveMarketParams(params.market_id);
      const data = encodeFunctionData({
        abi: MORPHO_ABI,
        functionName: "withdraw",
        args: [market, params.amount, 0n, params.to, params.to],
      });
      return {
        description: `[${this.protocolName}] Withdraw ${params.amount} of ${params.asset} from market ${params.market_id.slice(0, 10)}…`,
        to: this.morpho,
        data,
        value: 0n,
        gas_estimate: 300_000,
      };
    }
    const vault = await this.resolveVault(params.asset);
    if (vault) {
      if (params.amount === MAX_UINT256) {
        if (!this.rpcUrl) throw DefiError.rpcError("RPC required to fetch vault shares");
        const [balRaw] = await multicallRead(this.rpcUrl, [
          [vault, encodeFunctionData({ abi: ERC4626_ABI, functionName: "balanceOf", args: [params.to] })],
        ]);
        const shares = decodeU256(balRaw ?? null);
        const data = encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: "redeem",
          args: [shares, params.to, params.to],
        });
        return {
          description: `[${this.protocolName}] Redeem all shares (${shares}) from MetaMorpho vault`,
          to: vault, data, value: 0n, gas_estimate: 400_000,
        };
      }
      const data = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: "withdraw",
        args: [params.amount, params.to, params.to],
      });
      return {
        description: `[${this.protocolName}] Withdraw ${params.amount} assets from MetaMorpho vault`,
        to: vault, data, value: 0n, gas_estimate: 400_000,
      };
    }
    throw DefiError.invalidParam(
      `[${this.protocolName}] withdraw requires either a registered MetaMorpho vault for ` +
        `${params.asset} or an explicit --market <marketId>. The legacy zero-MarketParams ` +
        `stub was removed (it always reverted on-chain).`,
    );
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      return { protocol: this.protocolName, asset, supply_apy: 0, borrow_variable_apy: 0, borrow_stable_apy: 0, utilization: 0, total_supply: 0n, total_borrow: 0n };
    }

    // Batch 1: supplyQueueLength (gate check)
    const [queueLenRaw] = await multicallRead(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData({ abi: META_MORPHO_ABI, functionName: "supplyQueueLength" })],
    ]).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`); });

    const queueLen = decodeU256(queueLenRaw ?? null);

    if (queueLen === 0n) {
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

    // supplyQueue(0) — single call, depends on queueLen > 0
    const [marketIdRaw] = await multicallRead(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData({ abi: META_MORPHO_ABI, functionName: "supplyQueue", args: [0n] })],
    ]).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`); });

    if (!marketIdRaw || marketIdRaw.length < 66) {
      throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) returned no data`);
    }
    const marketId = marketIdRaw.slice(0, 66) as `0x${string}`;

    // Batch 2: market + idToMarketParams (both depend on marketId, independent of each other)
    const [marketRaw, paramsRaw] = await multicallRead(this.rpcUrl, [
      [this.morpho, encodeFunctionData({ abi: MORPHO_ABI, functionName: "market", args: [marketId] })],
      [this.morpho, encodeFunctionData({ abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] })],
    ]).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] market/idToMarketParams failed: ${e}`); });

    const mktDecoded = decodeMarket(marketRaw ?? null);
    if (!mktDecoded) throw DefiError.rpcError(`[${this.protocolName}] market() returned no data`);
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mktDecoded;

    const paramsDecoded = decodeMarketParams(paramsRaw ?? null);
    if (!paramsDecoded) throw DefiError.rpcError(`[${this.protocolName}] idToMarketParams returned no data`);
    const [loanToken, collateralToken, oracle, irm, lltv] = paramsDecoded;

    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;

    const irmMarketParams: MarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };

    // borrowRateView depends on both market + idToMarketParams results — keep separate
    const borrowRatePerSec = await (async () => {
      const [borrowRateRaw] = await multicallRead(this.rpcUrl!, [
        [irm, encodeFunctionData({ abi: IRM_ABI, functionName: "borrowRateView", args: [irmMarketParams, irmMarket] })],
      ]).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`); });
      return decodeU256(borrowRateRaw ?? null);
    })();

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
