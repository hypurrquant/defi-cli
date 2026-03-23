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

// V2 uses deposit/borrow/repay/withdraw (same as V3 for borrow/repay/withdraw)
const POOL_ABI = parseAbi([
  "function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  // V2 getReserveData: 12 fields (no accruedToTreasury/unbacked/isolationModeTotalDebt)
  // positions: [0]=configuration, [1]=liquidityIndex, [2]=variableBorrowIndex,
  //            [3]=currentLiquidityRate, [4]=currentVariableBorrowRate, [5]=currentStableBorrowRate,
  //            [6]=lastUpdateTimestamp, [7]=aTokenAddress, [8]=stableDebtTokenAddress,
  //            [9]=variableDebtTokenAddress, [10]=interestRateStrategyAddress, [11]=id
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id)",
]);

const ERC20_ABI = parseAbi([
  "function totalSupply() external view returns (uint256)",
]);

function u256ToF64(v: bigint): number {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}

export class AaveV2Adapter implements ILending {
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
      functionName: "deposit",
      args: [params.asset, params.amount, params.on_behalf_of, 0],
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 300_000,
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

    // V2 field positions:
    // [3] = currentLiquidityRate, [4] = currentVariableBorrowRate, [5] = currentStableBorrowRate
    // [7] = aTokenAddress, [9] = variableDebtTokenAddress
    const supplyRate = toApy(result[3]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);

    const aTokenAddress = result[7] as Address;
    const variableDebtTokenAddress = result[9] as Address;

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

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow,
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
    // V2 returns values in ETH (18 decimals) vs V3's base currency (8 decimals)
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e18;
    const debtUsd = u256ToF64(totalDebtBase) / 1e18;
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
