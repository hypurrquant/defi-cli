import { createPublicClient, http, parseAbi, encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";
import type { Address, Hex } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  multicallRead,
  decodeU256,
  type ProtocolEntry,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
  InterestRateMode,
} from "@hypurrquant/defi-core";

const POOL_ABI = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReservesList() external view returns (address[])",
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
]);

const ERC20_ABI = parseAbi([
  "function totalSupply() external view returns (uint256)",
]);

const INCENTIVES_ABI = parseAbi([
  "function getIncentivesController() external view returns (address)",
]);

const REWARDS_CONTROLLER_ABI = parseAbi([
  "function getRewardsByAsset(address asset) external view returns (address[])",
  "function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionsPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)",
]);

const POOL_PROVIDER_ABI = parseAbi([
  "function ADDRESSES_PROVIDER() external view returns (address)",
]);

const ADDRESSES_PROVIDER_ABI = parseAbi([
  "function getPriceOracle() external view returns (address)",
]);

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)",
]);

const ERC20_DECIMALS_ABI = parseAbi([
  "function decimals() external view returns (uint8)",
]);

function u256ToF64(v: bigint): number {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}

function decodeAddress(data: Hex | null): Address | null {
  if (!data || data.length < 66) return null;
  // ABI-encoded address: 12 bytes padding + 20 bytes address (total 32 bytes = 64 hex chars + 0x)
  return `0x${data.slice(26, 66)}` as Address;
}

function decodeAddressArray(data: Hex | null): Address[] {
  if (!data) return [];
  try {
    return decodeFunctionResult({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsByAsset",
      data,
    }) as Address[];
  } catch {
    return [];
  }
}

function decodeReserveData(data: Hex | null): ReturnType<typeof decodeFunctionResult> | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({
      abi: POOL_ABI,
      functionName: "getReserveData",
      data,
    });
  } catch {
    return null;
  }
}

function decodeRewardsData(data: Hex | null): [bigint, bigint, bigint, bigint] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsData",
      data,
    }) as [bigint, bigint, bigint, bigint];
  } catch {
    return null;
  }
}

export class AaveV3Adapter implements ILending {
  private readonly protocolName: string;
  private readonly pool: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "supply",
      args: [params.asset, params.amount, params.on_behalf_of, 0],
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 300_000,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }],
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "borrow",
      args: [params.asset, params.amount, rateMode, 0, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 300_000,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }],
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    // Aave V3 reverts if the requested amount exceeds the user's aToken
    // balance (which can drift below the original supply amount due to scaled
    // index rounding). When the request matches or exceeds the live balance,
    // pass uint256.max — Aave interprets that as "withdraw all" and handles
    // the exact balance internally.
    let withdrawAmount = params.amount;
    if (this.rpcUrl) {
      try {
        const client = createPublicClient({ transport: http(this.rpcUrl) });
        const reserveData = await client.readContract({
          address: this.pool, abi: POOL_ABI, functionName: "getReserveData", args: [params.asset],
        }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, number, Address, Address, Address, Address, bigint, bigint, bigint];
        const aToken = reserveData[8];
        const aBal = await client.readContract({
          address: aToken,
          abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
          functionName: "balanceOf",
          args: [params.to],
        }) as bigint;
        if (aBal > 0n && params.amount >= aBal) {
          withdrawAmount = (1n << 256n) - 1n;
        }
      } catch { /* fall back to caller-supplied amount */ }
    }

    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [params.asset, withdrawAmount, params.to],
    });
    const isMax = withdrawAmount === (1n << 256n) - 1n;
    return {
      description: `[${this.protocolName}] Withdraw ${isMax ? "all (auto-max)" : withdrawAmount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");

    // Batch 1: getReserveData
    const reserveCallData = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset],
    });
    const [reserveRaw] = await multicallRead(this.rpcUrl, [
      [this.pool, reserveCallData],
    ]).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });

    const reserveDecoded = decodeReserveData(reserveRaw ?? null);
    if (!reserveDecoded) {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData returned no data`);
    }
    const result = reserveDecoded as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, Address, Address, Address, bigint, bigint, bigint];

    const RAY = 1e27;
    const SECONDS_PER_YEAR = 31536000;

    // Convert ray rate to APY: ((1 + rate/SECONDS_PER_YEAR)^SECONDS_PER_YEAR - 1) * 100
    const toApy = (rayRate: bigint): number => {
      const rate = Number(rayRate) / RAY;
      return (Math.pow(1 + rate / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
    };

    const supplyRate = toApy(result[2]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);

    const aTokenAddress = result[8] as Address;
    const variableDebtTokenAddress = result[10] as Address;

    // Batch 2: totalSupply for aToken + variableDebtToken
    const [supplyRaw, borrowRaw] = await multicallRead(this.rpcUrl, [
      [aTokenAddress, encodeFunctionData({ abi: ERC20_ABI, functionName: "totalSupply" })],
      [variableDebtTokenAddress, encodeFunctionData({ abi: ERC20_ABI, functionName: "totalSupply" })],
    ]);
    const totalSupply = decodeU256(supplyRaw ?? null);
    const totalBorrow = decodeU256(borrowRaw ?? null);

    const utilization = totalSupply > 0n
      ? Number((totalBorrow * 10000n) / totalSupply) / 100
      : 0;

    // Fetch incentive/reward data (best-effort, never breaks base rates)
    const supplyRewardTokens: string[] = [];
    const borrowRewardTokens: string[] = [];
    const supplyEmissions: string[] = [];
    const borrowEmissions: string[] = [];

    try {
      // Batch 3: getIncentivesController (single call)
      const [controllerRaw] = await multicallRead(this.rpcUrl, [
        [aTokenAddress, encodeFunctionData({ abi: INCENTIVES_ABI, functionName: "getIncentivesController" })],
      ]);
      const controllerAddr = decodeAddress(controllerRaw ?? null);

      if (controllerAddr && controllerAddr !== zeroAddress) {
        // Batch 4: getRewardsByAsset for aToken + variableDebtToken
        const [supplyRewardsRaw, borrowRewardsRaw] = await multicallRead(this.rpcUrl, [
          [controllerAddr, encodeFunctionData({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [aTokenAddress] })],
          [controllerAddr, encodeFunctionData({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [variableDebtTokenAddress] })],
        ]);
        const supplyRewards = decodeAddressArray(supplyRewardsRaw ?? null);
        const borrowRewards = decodeAddressArray(borrowRewardsRaw ?? null);

        // Batch 5: all getRewardsData calls for supply + borrow combined
        const rewardsDataCalls: Array<[Address, Hex]> = [
          ...supplyRewards.map((reward): [Address, Hex] => [
            controllerAddr,
            encodeFunctionData({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [aTokenAddress, reward] }),
          ]),
          ...borrowRewards.map((reward): [Address, Hex] => [
            controllerAddr,
            encodeFunctionData({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [variableDebtTokenAddress, reward] }),
          ]),
        ];

        if (rewardsDataCalls.length > 0) {
          const rewardsDataResults = await multicallRead(this.rpcUrl, rewardsDataCalls);

          const supplyDataResults = rewardsDataResults.slice(0, supplyRewards.length);
          const borrowDataResults = rewardsDataResults.slice(supplyRewards.length);

          for (let i = 0; i < supplyRewards.length; i++) {
            const data = decodeRewardsData(supplyDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              supplyRewardTokens.push(supplyRewards[i]);
              supplyEmissions.push(data[1].toString());
            }
          }
          for (let i = 0; i < borrowRewards.length; i++) {
            const data = decodeRewardsData(borrowDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              borrowRewardTokens.push(borrowRewards[i]);
              borrowEmissions.push(data[1].toString());
            }
          }
        }
      }
    } catch {
      // Incentives not supported by this deployment — silently ignore
    }

    // Calculate incentive APY from emissions using oracle prices
    let supplyIncentiveApy: number | undefined;
    let borrowIncentiveApy: number | undefined;

    const hasSupplyRewards = supplyRewardTokens.length > 0;
    const hasBorrowRewards = borrowRewardTokens.length > 0;

    if ((hasSupplyRewards || hasBorrowRewards) && totalSupply > 0n) {
      try {
        // Pool → AddressesProvider → Oracle (sequential, each depends on previous)
        const [providerRaw] = await multicallRead(this.rpcUrl, [
          [this.pool, encodeFunctionData({ abi: POOL_PROVIDER_ABI, functionName: "ADDRESSES_PROVIDER" })],
        ]);
        const providerAddr = decodeAddress(providerRaw ?? null);
        if (!providerAddr) throw new Error("No provider address");

        const [oracleRaw] = await multicallRead(this.rpcUrl, [
          [providerAddr, encodeFunctionData({ abi: ADDRESSES_PROVIDER_ABI, functionName: "getPriceOracle" })],
        ]);
        const oracleAddr = decodeAddress(oracleRaw ?? null);
        if (!oracleAddr) throw new Error("No oracle address");

        // Batch 6: assetPrice + BASE_CURRENCY_UNIT + asset decimals
        const [assetPriceRaw, baseCurrencyUnitRaw, assetDecimalsRaw] = await multicallRead(this.rpcUrl, [
          [oracleAddr, encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [asset] })],
          [oracleAddr, encodeFunctionData({ abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })],
          [asset, encodeFunctionData({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })],
        ]);

        const assetPrice = decodeU256(assetPriceRaw ?? null);
        const baseCurrencyUnit = decodeU256(baseCurrencyUnitRaw ?? null);
        // decimals() returns uint8, fits in lower bits of U256 slot
        const assetDecimals = assetDecimalsRaw ? Number(decodeU256(assetDecimalsRaw)) : 18;

        const priceUnit = Number(baseCurrencyUnit) || 1e8;
        const assetPriceF = Number(assetPrice) / priceUnit;
        const assetDecimalsDivisor = 10 ** assetDecimals;

        // Collect all unique reward tokens across supply + borrow
        const allRewardTokens = Array.from(new Set([...supplyRewardTokens, ...borrowRewardTokens])) as Address[];

        // Batch 7: price + decimals for all reward tokens combined
        const rewardPriceCalls: Array<[Address, Hex]> = allRewardTokens.flatMap((token): Array<[Address, Hex]> => [
          [oracleAddr, encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] })],
          [token, encodeFunctionData({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })],
        ]);

        const rewardPriceResults = rewardPriceCalls.length > 0
          ? await multicallRead(this.rpcUrl, rewardPriceCalls)
          : [];

        const rewardPriceMap = new Map<string, { price: bigint; decimals: number }>();
        for (let i = 0; i < allRewardTokens.length; i++) {
          const priceRaw = rewardPriceResults[i * 2] ?? null;
          const decimalsRaw = rewardPriceResults[i * 2 + 1] ?? null;
          const price = decodeU256(priceRaw);
          const decimals = decimalsRaw ? Number(decodeU256(decimalsRaw)) : 18;
          rewardPriceMap.set(allRewardTokens[i].toLowerCase(), { price, decimals });
        }

        // Supply-side incentive APY
        if (hasSupplyRewards) {
          let totalSupplyIncentiveUsdPerYear = 0;
          const totalSupplyUsd = (Number(totalSupply) / assetDecimalsDivisor) * assetPriceF;

          for (let i = 0; i < supplyRewardTokens.length; i++) {
            const emissionPerSec = BigInt(supplyEmissions[i]);
            const entry = rewardPriceMap.get(supplyRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = (Number(emissionPerSec) / (10 ** rewardDecimals)) * SECONDS_PER_YEAR;
              totalSupplyIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalSupplyUsd > 0) {
            supplyIncentiveApy = (totalSupplyIncentiveUsdPerYear / totalSupplyUsd) * 100;
          }
        }

        // Borrow-side incentive APY
        if (hasBorrowRewards && totalBorrow > 0n) {
          let totalBorrowIncentiveUsdPerYear = 0;
          const totalBorrowUsd = (Number(totalBorrow) / assetDecimalsDivisor) * assetPriceF;

          for (let i = 0; i < borrowRewardTokens.length; i++) {
            const emissionPerSec = BigInt(borrowEmissions[i]);
            const entry = rewardPriceMap.get(borrowRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = (Number(emissionPerSec) / (10 ** rewardDecimals)) * SECONDS_PER_YEAR;
              totalBorrowIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalBorrowUsd > 0) {
            borrowIncentiveApy = (totalBorrowIncentiveUsdPerYear / totalBorrowUsd) * 100;
          }
        }
      } catch {
        // Oracle not available — skip incentive APY calculation
      }
    }

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow,
      ...(hasSupplyRewards && {
        supply_reward_tokens: supplyRewardTokens,
        supply_emissions_per_second: supplyEmissions,
      }),
      ...(hasBorrowRewards && {
        borrow_reward_tokens: borrowRewardTokens,
        borrow_emissions_per_second: borrowEmissions,
      }),
      ...(supplyIncentiveApy !== undefined && { supply_incentive_apy: supplyIncentiveApy }),
      ...(borrowIncentiveApy !== undefined && { borrow_incentive_apy: borrowIncentiveApy }),
    };
  }

  async getUserPosition(user: Address): Promise<UserPosition> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // 1) Aggregate health: getUserAccountData (USD-base values)
    const accountData = await client.readContract({
      address: this.pool, abi: POOL_ABI, functionName: "getUserAccountData", args: [user],
    }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`); });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = accountData;
    const MAX_UINT256 = 2n ** 256n - 1n;
    // Aave returns max-uint when there's no debt (infinite HF). Surface as null
    // so consumers don't have to special-case Infinity / NaN in JSON.
    const hf = healthFactor >= MAX_UINT256 ? null : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvPct = u256ToF64(ltv) / 100;  // Aave returns LTV in bps (10000 = 100%)

    // 2) Per-asset breakdown. Always scan because `getUserAccountData`
    // counts only collateral-eligible reserves; some Aave V3 fork assets
    // (e.g., supply-only listings) hold an aToken balance that the
    // aggregate metrics ignore.
    const supplies: { asset: Address; symbol: string; amount: bigint }[] = [];
    const borrows: { asset: Address; symbol: string; amount: bigint }[] = [];
    try {
      const reserves = await client.readContract({
        address: this.pool, abi: POOL_ABI, functionName: "getReservesList",
      }) as readonly Address[];

      const reserveData = await Promise.allSettled(reserves.map(async (asset) => {
        const data = await client.readContract({
          address: this.pool, abi: POOL_ABI, functionName: "getReserveData", args: [asset],
        }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, number, Address, Address, Address, Address, bigint, bigint, bigint];
        const aToken = data[8];
        const debtToken = data[10];
        return { asset, aToken, debtToken };
      }));

      const ERC20_ABI = parseAbi([
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
      ]);
      const positions = await Promise.allSettled(reserveData.map(async (r) => {
        if (r.status !== "fulfilled") return null;
        const { asset, aToken, debtToken } = r.value;
        const [aBal, dBal, sym] = await Promise.all([
          client.readContract({ address: aToken, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }) as Promise<bigint>,
          client.readContract({ address: debtToken, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }) as Promise<bigint>,
          client.readContract({ address: asset, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "?") as Promise<string>,
        ]);
        return { asset, symbol: sym, supply: aBal, borrow: dBal };
      }));

      for (const p of positions) {
        if (p.status !== "fulfilled" || !p.value) continue;
        if (p.value.supply > 0n) supplies.push({ asset: p.value.asset, symbol: p.value.symbol, amount: p.value.supply });
        if (p.value.borrow > 0n) borrows.push({ asset: p.value.asset, symbol: p.value.symbol, amount: p.value.borrow });
      }
    } catch {
      // Per-asset breakdown failed; fall back to aggregate sentinel only when
      // getUserAccountData reported a non-zero position so the caller still
      // sees that something is held.
      if (collateralUsd > 0) supplies.push({ asset: zeroAddress as Address, symbol: "Total Collateral (per-asset breakdown unavailable)", amount: totalCollateralBase });
      if (debtUsd > 0) borrows.push({ asset: zeroAddress as Address, symbol: "Total Debt (per-asset breakdown unavailable)", amount: totalDebtBase });
    }

    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      ltv_pct: ltvPct,
      total_collateral_usd: collateralUsd,
      total_debt_usd: debtUsd,
    } as UserPosition;
  }
}
