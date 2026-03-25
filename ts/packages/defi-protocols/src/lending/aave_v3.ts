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
  InterestRateMode,
} from "@hypurrquant/defi-core";

const POOL_ABI = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
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
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount, params.to],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });

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

    const [totalSupply, totalBorrow] = await Promise.all([
      client.readContract({
        address: aTokenAddress,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      }).catch(() => 0n),
      client.readContract({
        address: variableDebtTokenAddress,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      }).catch(() => 0n),
    ]);

    const utilization = totalSupply > 0n
      ? Number((totalBorrow * 10000n) / totalSupply) / 100
      : 0;

    // Fetch incentive/reward data (best-effort, never breaks base rates)
    const supplyRewardTokens: string[] = [];
    const borrowRewardTokens: string[] = [];
    const supplyEmissions: string[] = [];
    const borrowEmissions: string[] = [];

    try {
      const controllerAddr = await client.readContract({
        address: aTokenAddress,
        abi: INCENTIVES_ABI,
        functionName: "getIncentivesController",
      });

      if (controllerAddr && controllerAddr !== zeroAddress) {
        const [supplyRewards, borrowRewards] = await Promise.all([
          client.readContract({
            address: controllerAddr,
            abi: REWARDS_CONTROLLER_ABI,
            functionName: "getRewardsByAsset",
            args: [aTokenAddress],
          }).catch(() => [] as Address[]),
          client.readContract({
            address: controllerAddr,
            abi: REWARDS_CONTROLLER_ABI,
            functionName: "getRewardsByAsset",
            args: [variableDebtTokenAddress],
          }).catch(() => [] as Address[]),
        ]);

        // Fetch emissions data for supply rewards
        const supplyDataPromises = supplyRewards.map((reward) =>
          client.readContract({
            address: controllerAddr,
            abi: REWARDS_CONTROLLER_ABI,
            functionName: "getRewardsData",
            args: [aTokenAddress, reward],
          }).catch(() => null),
        );
        const supplyData = await Promise.all(supplyDataPromises);
        for (let i = 0; i < supplyRewards.length; i++) {
          const data = supplyData[i];
          if (data && data[1] > 0n) {
            supplyRewardTokens.push(supplyRewards[i]);
            supplyEmissions.push(data[1].toString());
          }
        }

        // Fetch emissions data for borrow rewards
        const borrowDataPromises = borrowRewards.map((reward) =>
          client.readContract({
            address: controllerAddr,
            abi: REWARDS_CONTROLLER_ABI,
            functionName: "getRewardsData",
            args: [variableDebtTokenAddress, reward],
          }).catch(() => null),
        );
        const borrowData = await Promise.all(borrowDataPromises);
        for (let i = 0; i < borrowRewards.length; i++) {
          const data = borrowData[i];
          if (data && data[1] > 0n) {
            borrowRewardTokens.push(borrowRewards[i]);
            borrowEmissions.push(data[1].toString());
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
        // Pool → AddressesProvider → Oracle
        const providerAddr = await client.readContract({
          address: this.pool,
          abi: POOL_PROVIDER_ABI,
          functionName: "ADDRESSES_PROVIDER",
        });
        const oracleAddr = await client.readContract({
          address: providerAddr,
          abi: ADDRESSES_PROVIDER_ABI,
          functionName: "getPriceOracle",
        });
        const [assetPrice, baseCurrencyUnit, assetDecimals] = await Promise.all([
          client.readContract({
            address: oracleAddr,
            abi: ORACLE_ABI,
            functionName: "getAssetPrice",
            args: [asset],
          }),
          client.readContract({
            address: oracleAddr,
            abi: ORACLE_ABI,
            functionName: "BASE_CURRENCY_UNIT",
          }),
          client.readContract({
            address: asset,
            abi: ERC20_DECIMALS_ABI,
            functionName: "decimals",
          }).catch(() => 18),
        ]);

        const priceUnit = Number(baseCurrencyUnit);
        const assetPriceF = Number(assetPrice) / priceUnit;
        const assetDecimalsDivisor = 10 ** assetDecimals;

        // Supply-side incentive APY
        if (hasSupplyRewards) {
          let totalSupplyIncentiveUsdPerYear = 0;
          const totalSupplyUsd = (Number(totalSupply) / assetDecimalsDivisor) * assetPriceF;

          for (let i = 0; i < supplyRewardTokens.length; i++) {
            const emissionPerSec = BigInt(supplyEmissions[i]);
            const [rewardPrice, rewardDecimals] = await Promise.all([
              client.readContract({
                address: oracleAddr,
                abi: ORACLE_ABI,
                functionName: "getAssetPrice",
                args: [supplyRewardTokens[i] as Address],
              }).catch(() => 0n),
              client.readContract({
                address: supplyRewardTokens[i] as Address,
                abi: ERC20_DECIMALS_ABI,
                functionName: "decimals",
              }).catch(() => 18),
            ]);
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
            const [rewardPrice, rewardDecimals] = await Promise.all([
              client.readContract({
                address: oracleAddr,
                abi: ORACLE_ABI,
                functionName: "getAssetPrice",
                args: [borrowRewardTokens[i] as Address],
              }).catch(() => 0n),
              client.readContract({
                address: borrowRewardTokens[i] as Address,
                abi: ERC20_DECIMALS_ABI,
                functionName: "decimals",
              }).catch(() => 18),
            ]);
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
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [user],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });

    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvBps = u256ToF64(ltv);

    const supplies = collateralUsd > 0
      ? [{ asset: zeroAddress as Address, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }]
      : [];
    const borrows = debtUsd > 0
      ? [{ asset: zeroAddress as Address, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }]
      : [];

    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      net_apy: ltvBps / 100,
    };
  }
}
