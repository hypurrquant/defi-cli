import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  createPublicClient,
  http,
} from "viem";
import type { Address, Hex } from "viem";

import { DefiError, multicallRead } from "@hypurrquant/defi-core";
import type { ProtocolEntry, DeFiTx, RewardInfo } from "@hypurrquant/defi-core";

// ============================================================
// ABIs
// ============================================================

const lbRouterAbi = parseAbi([
  "struct LiquidityParameters { address tokenX; address tokenY; uint256 binStep; uint256 amountX; uint256 amountY; uint256 amountXMin; uint256 amountYMin; uint256 activeIdDesired; uint256 idSlippage; int256[] deltaIds; uint256[] distributionX; uint256[] distributionY; address to; address refundTo; uint256 deadline; }",
  "function addLiquidity(LiquidityParameters calldata liquidityParameters) external returns (uint256 amountXAdded, uint256 amountYAdded, uint256 amountXLeft, uint256 amountYLeft, uint256[] memory depositIds, uint256[] memory liquidityMinted)",
  "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] memory ids, uint256[] memory amounts, address to, uint256 deadline) external returns (uint256 amountX, uint256 amountY)",
]);

const lbFactoryAbi = parseAbi([
  "function getNumberOfLBPairs() external view returns (uint256)",
  "function getLBPairAtIndex(uint256 index) external view returns (address)",
]);

const lbPairAbi = parseAbi([
  "function getLBHooksParameters() external view returns (bytes32)",
  "function getActiveId() external view returns (uint24)",
  "function getBinStep() external view returns (uint16)",
  "function getTokenX() external view returns (address)",
  "function getTokenY() external view returns (address)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)",
]);

const lbRewarderAbi = parseAbi([
  "function getRewardToken() external view returns (address)",
  "function getRewardedRange() external view returns (uint256 minBinId, uint256 maxBinId)",
  "function getPendingRewards(address user, uint256[] calldata ids) external view returns (uint256 pendingRewards)",
  "function claim(address user, uint256[] calldata ids) external",
  "function getPid() external view returns (uint256)",
  "function isStopped() external view returns (bool)",
  "function getLBPair() external view returns (address)",
  "function getMasterChef() external view returns (address)",
]);

const masterChefAbi = parseAbi([
  "function getMoePerSecond() external view returns (uint256)",
  "function getTreasuryShare() external view returns (uint256)",
  "function getStaticShare() external view returns (uint256)",
  "function getVeMoe() external view returns (address)",
]);

const veMoeAbi = parseAbi([
  "function getWeight(uint256 pid) external view returns (uint256)",
  "function getTotalWeight() external view returns (uint256)",
  "function getTopPoolIds() external view returns (uint256[] memory)",
]);

const lbPairBinAbi = parseAbi([
  "function getBin(uint24 id) external view returns (uint128 reserveX, uint128 reserveY)",
  "function getActiveId() external view returns (uint24)",
]);

const lbQuoterAbi = parseAbi([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))",
]);

const erc20Abi = parseAbi([
  "function symbol() external view returns (string)",
]);

// ============================================================
// Types
// ============================================================

export interface LBAddLiquidityParams {
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

export interface LBRemoveLiquidityParams {
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

export interface LBPosition {
  binId: number;
  balance: bigint;
}

export interface RewardedPool {
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

// ============================================================
// Helpers
// ============================================================

/** Decode address using a generic address ABI */
const _addressAbi = parseAbi(["function f() external view returns (address)"]);
function decodeAddressResult(data: Hex | null): Address | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _addressAbi, functionName: "f", data }) as Address;
  } catch {
    return null;
  }
}

/** Decode uint256 from multicall returnData */
const _uint256Abi = parseAbi(["function f() external view returns (uint256)"]);
function decodeUint256Result(data: Hex | null): bigint | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _uint256Abi, functionName: "f", data }) as bigint;
  } catch {
    return null;
  }
}

/** Decode bool from multicall returnData */
const _boolAbi = parseAbi(["function f() external view returns (bool)"]);
function decodeBoolResult(data: Hex | null): boolean | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _boolAbi, functionName: "f", data }) as boolean;
  } catch {
    return null;
  }
}

/** Decode string from multicall returnData */
function decodeStringResult(data: Hex | null): string {
  if (!data) return "?";
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: "symbol", data }) as string;
  } catch {
    return "?";
  }
}

/** Decode getRewardedRange (returns (uint256, uint256)) */
const _rangeAbi = parseAbi(["function f() external view returns (uint256 minBinId, uint256 maxBinId)"]);
function decodeRangeResult(data: Hex | null): [bigint, bigint] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _rangeAbi, functionName: "f", data }) as [bigint, bigint];
  } catch {
    return null;
  }
}

/** Decode getBin result (uint128, uint128) */
const _binAbi = parseAbi(["function f() external view returns (uint128 reserveX, uint128 reserveY)"]);
function decodeBinResult(data: Hex | null): [bigint, bigint] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _binAbi, functionName: "f", data }) as [bigint, bigint];
  } catch {
    return null;
  }
}

/** Decode uint256[] (e.g. getTopPoolIds) */
const _uint256ArrayAbi = parseAbi(["function f() external view returns (uint256[] memory)"]);
function decodeUint256ArrayResult(data: Hex | null): bigint[] | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _uint256ArrayAbi, functionName: "f", data }) as bigint[];
  } catch {
    return null;
  }
}

/** Extract rewarder address from LB hooks params (lower 20 bytes of bytes32) */
function extractRewarderAddress(hooksParams: Hex): Address | null {
  // hooksParams is a 32-byte hex string (0x + 64 hex chars)
  if (!hooksParams || hooksParams === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return null;
  }
  // Lower 20 bytes = last 40 hex characters of the 64-char data portion
  const hex = hooksParams.slice(2); // strip 0x
  if (hex.length < 64) return null;
  const addrHex = hex.slice(24, 64); // bytes 12..31 = lower 20 bytes
  if (addrHex === "0000000000000000000000000000000000000000") return null;
  return `0x${addrHex}` as Address;
}

/** Build uniform distribution arrays for LB add liquidity.
 *
 * Distribution rules:
 * - Bins strictly below active: only tokenY (distributionX[i]=0, distributionY[i]=share)
 * - Bin at active: tokenX and tokenY split 50/50
 * - Bins strictly above active: only tokenX (distributionX[i]=share, distributionY[i]=0)
 *
 * distributionX / distributionY sum to 1e18 respectively.
 */
function buildUniformDistribution(
  deltaIds: number[],
): { distributionX: bigint[]; distributionY: bigint[] } {
  const PRECISION = 10n ** 18n;
  const n = deltaIds.length;

  // Count how many bins receive X and Y
  const xBins = deltaIds.filter((d) => d >= 0).length; // active + above
  const yBins = deltaIds.filter((d) => d <= 0).length; // active + below

  const distributionX: bigint[] = [];
  const distributionY: bigint[] = [];

  for (const delta of deltaIds) {
    // X share: bins at or above active
    const xShare = delta >= 0 && xBins > 0 ? PRECISION / BigInt(xBins) : 0n;
    // Y share: bins at or below active
    const yShare = delta <= 0 && yBins > 0 ? PRECISION / BigInt(yBins) : 0n;
    distributionX.push(xShare);
    distributionY.push(yShare);
  }

  // Correct rounding on the active bin (index where delta === 0)
  // The sum must be exactly PRECISION; adjust the first qualifying element
  const xSum = distributionX.reduce((a, b) => a + b, 0n);
  const ySum = distributionY.reduce((a, b) => a + b, 0n);
  if (xSum > 0n && xSum !== PRECISION) {
    const firstX = distributionX.findIndex((v) => v > 0n);
    if (firstX !== -1) distributionX[firstX] += PRECISION - xSum;
  }
  if (ySum > 0n && ySum !== PRECISION) {
    const firstY = distributionY.findIndex((v) => v > 0n);
    if (firstY !== -1) distributionY[firstY] += PRECISION - ySum;
  }

  return { distributionX, distributionY };
}

// ============================================================
// Adapter
// ============================================================

export class MerchantMoeLBAdapter {
  private readonly protocolName: string;
  private readonly lbRouter: Address;
  private readonly lbFactory: Address;
  private readonly lbQuoter?: Address;
  private readonly rpcUrl?: string;
  /** WMNT address (lb_mid_wmnt in config) used for MOE price routing */
  private readonly wmnt?: Address;
  /** USDT address (lb_mid_usdt in config) used for MNT/USD price routing */
  private readonly usdt?: Address;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const lbRouter = entry.contracts?.["lb_router"];
    if (!lbRouter) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'lb_router' contract address");
    }
    const lbFactory = entry.contracts?.["lb_factory"];
    if (!lbFactory) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'lb_factory' contract address");
    }
    this.lbRouter = lbRouter;
    this.lbFactory = lbFactory;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.wmnt = entry.contracts?.["lb_mid_wmnt"];
    this.usdt = entry.contracts?.["lb_mid_usdt"];
    this.rpcUrl = rpcUrl;
  }

  name(): string {
    return this.protocolName;
  }

  private requireRpc(): string {
    if (!this.rpcUrl) {
      throw DefiError.rpcError(`[${this.protocolName}] RPC URL required`);
    }
    return this.rpcUrl;
  }

  /**
   * Build an addLiquidity transaction for a Liquidity Book pair.
   * Distributes tokenX/tokenY uniformly across active bin ± numBins.
   */
  async buildAddLiquidity(params: LBAddLiquidityParams): Promise<DeFiTx> {
    const numBins = params.numBins ?? 5;
    const deadline = params.deadline ?? BigInt("18446744073709551615");

    // Resolve active bin id
    let activeIdDesired = params.activeIdDesired;
    if (activeIdDesired === undefined) {
      const rpcUrl = this.requireRpc();
      const client = createPublicClient({ transport: http(rpcUrl) });
      const activeId = await client.readContract({
        address: params.pool,
        abi: lbPairAbi,
        functionName: "getActiveId",
      });
      activeIdDesired = activeId as number;
    }

    // Build delta IDs: [-numBins, ..., -1, 0, 1, ..., numBins]
    const deltaIds: number[] = [];
    for (let d = -numBins; d <= numBins; d++) {
      deltaIds.push(d);
    }

    const { distributionX, distributionY } = buildUniformDistribution(deltaIds);

    const data = encodeFunctionData({
      abi: lbRouterAbi,
      functionName: "addLiquidity",
      args: [
        {
          tokenX: params.tokenX,
          tokenY: params.tokenY,
          binStep: BigInt(params.binStep),
          amountX: params.amountX,
          amountY: params.amountY,
          amountXMin: 0n,
          amountYMin: 0n,
          activeIdDesired: BigInt(activeIdDesired),
          idSlippage: BigInt(numBins + 2),
          deltaIds: deltaIds.map(BigInt),
          distributionX,
          distributionY,
          to: params.recipient,
          refundTo: params.recipient,
          deadline,
        },
      ],
    });

    return {
      description: `[${this.protocolName}] LB addLiquidity ${params.amountX} tokenX + ${params.amountY} tokenY across ${deltaIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 800_000,
      approvals: [
        { token: params.tokenX, spender: this.lbRouter, amount: params.amountX },
        { token: params.tokenY, spender: this.lbRouter, amount: params.amountY },
      ],
    };
  }

  /**
   * Build a removeLiquidity transaction for specific LB bins.
   */
  async buildRemoveLiquidity(params: LBRemoveLiquidityParams): Promise<DeFiTx> {
    const deadline = params.deadline ?? BigInt("18446744073709551615");

    const data = encodeFunctionData({
      abi: lbRouterAbi,
      functionName: "removeLiquidity",
      args: [
        params.tokenX,
        params.tokenY,
        params.binStep,
        params.amountXMin ?? 0n,
        params.amountYMin ?? 0n,
        params.binIds.map(BigInt),
        params.amounts,
        params.recipient,
        deadline,
      ],
    });

    return {
      description: `[${this.protocolName}] LB removeLiquidity from ${params.binIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 600_000,
    };
  }

  /**
   * Auto-detect bin IDs for a pool from the rewarder's rewarded range.
   * Falls back to active bin ± 50 scan if no rewarder exists.
   */
  private async autoDetectBins(pool: Address): Promise<number[]> {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient({ transport: http(rpcUrl) });

    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters",
    }) as Hex;

    const rewarder = extractRewarderAddress(hooksParams);
    if (rewarder) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange",
      }) as [bigint, bigint];
      const min = Number(range[0]);
      const max = Number(range[1]);
      const ids: number[] = [];
      for (let b = min; b <= max; b++) ids.push(b);
      return ids;
    }

    // No rewarder: scan active bin ± 50
    const activeId = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getActiveId",
    }) as number;
    const ids: number[] = [];
    for (let b = activeId - 50; b <= activeId + 50; b++) ids.push(b);
    return ids;
  }

  /**
   * Get pending MOE rewards for a user across specified bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   * Reads the rewarder address from the pool's hooks parameters.
   */
  async getPendingRewards(user: Address, pool: Address, binIds?: number[]): Promise<RewardInfo[]> {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient({ transport: http(rpcUrl) });

    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters",
    }) as Hex;

    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      return [];
    }

    // Auto-detect bins from rewarder range if not provided
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange",
      }) as [bigint, bigint];
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }

    const [pending, rewardToken] = await Promise.all([
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getPendingRewards",
        args: [user, resolvedBinIds.map(BigInt)],
      }),
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardToken",
      }),
    ]);

    return [
      {
        token: rewardToken as Address,
        symbol: "MOE",
        amount: pending as bigint,
      },
    ];
  }

  /**
   * Build a claim rewards transaction for specific LB bins.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   */
  async buildClaimRewards(user: Address, pool: Address, binIds?: number[]): Promise<DeFiTx> {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient({ transport: http(rpcUrl) });

    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters",
    }) as Hex;

    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      throw new DefiError("CONTRACT_ERROR", `[${this.protocolName}] Pool ${pool} has no active rewarder`);
    }

    // Auto-detect bins from rewarder range if not provided
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange",
      }) as [bigint, bigint];
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }

    const data = encodeFunctionData({
      abi: lbRewarderAbi,
      functionName: "claim",
      args: [user, resolvedBinIds.map(BigInt)],
    });

    return {
      description: `[${this.protocolName}] LB claim rewards for ${resolvedBinIds.length} bins`,
      to: rewarder,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

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
  async discoverRewardedPools(): Promise<RewardedPool[]> {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient({ transport: http(rpcUrl) });

    // --- Batch 1a: get pair count ---
    const pairCount = await client.readContract({
      address: this.lbFactory,
      abi: lbFactoryAbi,
      functionName: "getNumberOfLBPairs",
    }) as bigint;

    const count = Number(pairCount);
    if (count === 0) return [];

    // --- Batch 1b: getLBPairAtIndex for all indices ---
    const batch1Calls: Array<[Address, Hex]> = Array.from({ length: count }, (_, i) => [
      this.lbFactory,
      encodeFunctionData({ abi: lbFactoryAbi, functionName: "getLBPairAtIndex", args: [BigInt(i)] }),
    ]);
    const batch1Results = await multicallRead(rpcUrl, batch1Calls);

    const pairAddresses: Address[] = batch1Results
      .map((r) => decodeAddressResult(r))
      .filter((a): a is Address => a !== null);

    if (pairAddresses.length === 0) return [];

    // --- Batch 2: getLBHooksParameters for all pairs ---
    const batch2Calls: Array<[Address, Hex]> = pairAddresses.map((pair) => [
      pair,
      encodeFunctionData({ abi: lbPairAbi, functionName: "getLBHooksParameters" }),
    ]);
    const batch2Results = await multicallRead(rpcUrl, batch2Calls);

    // Filter pairs with a rewarder
    const rewardedPairs: Array<{ pool: Address; rewarder: Address }> = [];
    for (let i = 0; i < pairAddresses.length; i++) {
      const raw = batch2Results[i];
      if (!raw) continue;
      // getLBHooksParameters returns bytes32 — decode as raw bytes32 value
      let hooksBytes: Hex;
      try {
        const _bytes32Abi = parseAbi(["function f() external view returns (bytes32)"]);
        hooksBytes = decodeFunctionResult({ abi: _bytes32Abi, functionName: "f", data: raw }) as Hex;
      } catch {
        continue;
      }
      const rewarder = extractRewarderAddress(hooksBytes);
      if (rewarder) {
        rewardedPairs.push({ pool: pairAddresses[i]!, rewarder });
      }
    }

    if (rewardedPairs.length === 0) return [];

    // --- Batch 3: rewarder details (5 calls per rewarder, interleaved) ---
    const batch3Calls: Array<[Address, Hex]> = [];
    for (const { rewarder } of rewardedPairs) {
      batch3Calls.push([rewarder, encodeFunctionData({ abi: lbRewarderAbi, functionName: "isStopped" })]);
      batch3Calls.push([rewarder, encodeFunctionData({ abi: lbRewarderAbi, functionName: "getRewardedRange" })]);
      batch3Calls.push([rewarder, encodeFunctionData({ abi: lbRewarderAbi, functionName: "getRewardToken" })]);
      batch3Calls.push([rewarder, encodeFunctionData({ abi: lbRewarderAbi, functionName: "getPid" })]);
      batch3Calls.push([rewarder, encodeFunctionData({ abi: lbRewarderAbi, functionName: "getMasterChef" })]);
    }
    const batch3Results = await multicallRead(rpcUrl, batch3Calls);

    // --- Batch 4a: getTokenX / getTokenY for rewarded pairs ---
    const batch4aCalls: Array<[Address, Hex]> = [];
    for (const { pool } of rewardedPairs) {
      batch4aCalls.push([pool, encodeFunctionData({ abi: lbPairAbi, functionName: "getTokenX" })]);
      batch4aCalls.push([pool, encodeFunctionData({ abi: lbPairAbi, functionName: "getTokenY" })]);
    }
    const batch4aResults = await multicallRead(rpcUrl, batch4aCalls);

    // Collect unique token addresses for symbol lookup
    const tokenXAddresses: Array<Address | null> = [];
    const tokenYAddresses: Array<Address | null> = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      tokenXAddresses.push(decodeAddressResult(batch4aResults[i * 2] ?? null));
      tokenYAddresses.push(decodeAddressResult(batch4aResults[i * 2 + 1] ?? null));
    }

    const uniqueTokens = Array.from(
      new Set([...tokenXAddresses, ...tokenYAddresses].filter((a): a is Address => a !== null)),
    );

    // --- Batch 4b: symbol() for each unique token ---
    const batch4bCalls: Array<[Address, Hex]> = uniqueTokens.map((token) => [
      token,
      encodeFunctionData({ abi: erc20Abi, functionName: "symbol" }),
    ]);
    const batch4bResults = await multicallRead(rpcUrl, batch4bCalls);
    const symbolMap = new Map<Address, string>();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i]!, decodeStringResult(batch4bResults[i] ?? null));
    }

    // Extract per-pool data from batch 3 (5 calls per rewarder)
    const STRIDE3 = 5;
    const poolData: Array<{
      stopped: boolean;
      range: [bigint, bigint] | null;
      rewardToken: Address | null;
      pid: number;
      masterChef: Address | null;
    }> = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const base = i * STRIDE3;
      poolData.push({
        stopped: decodeBoolResult(batch3Results[base] ?? null) ?? false,
        range: decodeRangeResult(batch3Results[base + 1] ?? null),
        rewardToken: decodeAddressResult(batch3Results[base + 2] ?? null),
        pid: Number(decodeUint256Result(batch3Results[base + 3] ?? null) ?? 0n),
        masterChef: decodeAddressResult(batch3Results[base + 4] ?? null),
      });
    }

    // --- Batch 5: Bootstrap MasterChef/VeMoe, then fetch global emission params ---
    // Find the first valid MasterChef address from the rewarders
    const masterChefAddr = poolData.map((d) => d.masterChef).find((a): a is Address => a !== null) ?? null;

    let moePerDay = 0;
    let topPoolIds = new Set<number>();
    let totalWeightRaw = 0n;
    let veMoeAddr: Address | null = null;

    if (masterChefAddr) {
      // First get VeMoe address from MasterChef
      veMoeAddr = await client.readContract({
        address: masterChefAddr,
        abi: masterChefAbi,
        functionName: "getVeMoe",
      }) as Address;

      // Batch 5: MasterChef global data + VeMoe global data
      const batch5Calls: Array<[Address, Hex]> = [
        [masterChefAddr, encodeFunctionData({ abi: masterChefAbi, functionName: "getMoePerSecond" })],
        [masterChefAddr, encodeFunctionData({ abi: masterChefAbi, functionName: "getTreasuryShare" })],
        [masterChefAddr, encodeFunctionData({ abi: masterChefAbi, functionName: "getStaticShare" })],
        [veMoeAddr, encodeFunctionData({ abi: veMoeAbi, functionName: "getTotalWeight" })],
        [veMoeAddr, encodeFunctionData({ abi: veMoeAbi, functionName: "getTopPoolIds" })],
      ];
      const batch5Results = await multicallRead(rpcUrl, batch5Calls);

      const moePerSecRaw = decodeUint256Result(batch5Results[0] ?? null) ?? 0n;
      const treasuryShareRaw = decodeUint256Result(batch5Results[1] ?? null) ?? 0n;
      const staticShareRaw = decodeUint256Result(batch5Results[2] ?? null) ?? 0n;
      totalWeightRaw = decodeUint256Result(batch5Results[3] ?? null) ?? 0n;
      const topPoolIdsRaw = decodeUint256ArrayResult(batch5Results[4] ?? null) ?? [];

      topPoolIds = new Set(topPoolIdsRaw.map(Number));

      // Shares are fixed-point 1e18 fractions
      const PRECISION = 10n ** 18n;
      // net_moe_per_sec = total × (1 - treasury) × (1 - static)
      // expressed in bigint arithmetic to avoid float truncation
      const netPerSec =
        (moePerSecRaw * (PRECISION - treasuryShareRaw) / PRECISION) *
        (PRECISION - staticShareRaw) / PRECISION;

      // Convert to human-readable MOE/day (MOE has 18 decimals)
      // This is the total net MOE/day that flows to dynamic (VeMoe) pools
      moePerDay = Number(netPerSec * 86400n) / 1e18;
    }

    // --- Batch 6: VeMoe.getWeight(pid) for each rewarded pool ---
    const weightByPid = new Map<number, bigint>();
    if (veMoeAddr && rewardedPairs.length > 0) {
      const batch6Calls: Array<[Address, Hex]> = poolData.map((d) => [
        veMoeAddr!,
        encodeFunctionData({ abi: veMoeAbi, functionName: "getWeight", args: [BigInt(d.pid)] }),
      ]);
      const batch6Results = await multicallRead(rpcUrl, batch6Calls);
      for (let i = 0; i < poolData.length; i++) {
        weightByPid.set(poolData[i]!.pid, decodeUint256Result(batch6Results[i] ?? null) ?? 0n);
      }
    }

    // --- Price: MOE and WMNT prices in USD via LB Quoter ---
    // Route: MOE → WMNT → USDT (MOE has 18 decimals, WMNT has 18, USDT has 6)
    let moePriceUsd = 0;
    let wmntPriceUsd = 0;
    const MOE_ADDR = "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9" as Address;
    if (this.lbQuoter && this.wmnt && this.usdt) {
      try {
        const [moeWmntQuote, wmntUsdtQuote] = await Promise.all([
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi,
            functionName: "findBestPathFromAmountIn",
            args: [[MOE_ADDR, this.wmnt], 10n ** 18n],
          }),
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi,
            functionName: "findBestPathFromAmountIn",
            args: [[this.wmnt, this.usdt], 10n ** 18n],
          }),
        ]);
        // amounts[last] is the output amount (USDT has 6 decimals, WMNT has 18)
        const moeInWmnt = Number((moeWmntQuote as unknown as { amounts: bigint[] }).amounts.at(-1) ?? 0n) / 1e18;
        wmntPriceUsd = Number((wmntUsdtQuote as unknown as { amounts: bigint[] }).amounts.at(-1) ?? 0n) / 1e6;
        moePriceUsd = moeInWmnt * wmntPriceUsd;
      } catch {
        // Price fetch failed — APR will be 0
      }
    }

    // --- Batch 7: Pool.getBin(binId) for all bins in rewarded range ---
    // Build flat list of (poolIndex, binId) for all rewarded bins
    type BinRequest = { poolIdx: number; binId: number };
    const binRequests: BinRequest[] = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const range = poolData[i]!.range;
      if (!range) continue;
      const minBin = Number(range[0]);
      const maxBin = Number(range[1]);
      for (let b = minBin; b <= maxBin; b++) {
        binRequests.push({ poolIdx: i, binId: b });
      }
    }

    // Bin reserves keyed by pool index
    // reserveX[poolIdx][binId] and reserveY[poolIdx][binId]
    const binReservesX = new Map<number, Map<number, bigint>>();
    const binReservesY = new Map<number, Map<number, bigint>>();

    if (binRequests.length > 0) {
      const batch7Calls: Array<[Address, Hex]> = binRequests.map(({ poolIdx, binId }) => [
        rewardedPairs[poolIdx]!.pool,
        encodeFunctionData({ abi: lbPairBinAbi, functionName: "getBin", args: [binId] }),
      ]);
      const batch7Results = await multicallRead(rpcUrl, batch7Calls);

      for (let j = 0; j < binRequests.length; j++) {
        const { poolIdx, binId } = binRequests[j]!;
        const decoded = decodeBinResult(batch7Results[j] ?? null);
        if (!decoded) continue;
        if (!binReservesX.has(poolIdx)) {
          binReservesX.set(poolIdx, new Map());
          binReservesY.set(poolIdx, new Map());
        }
        binReservesX.get(poolIdx)!.set(binId, decoded[0]);
        binReservesY.get(poolIdx)!.set(binId, decoded[1]);
      }
    }

    // --- Assemble results ---
    // Token price classification by symbol (USD)
    // Stablecoins → $1; WMNT/MNT → wmntPriceUsd; MOE → moePriceUsd; unknown → 0
    const stableSymbols = new Set(["USDT", "USDC", "MUSD", "AUSD", "USDY", "FDUSD"]);
    const mntSymbols = new Set(["WMNT", "MNT"]);
    const moeSymbols = new Set(["MOE"]);
    // USDT/USDC on Mantle have 6 decimals; other stable tokens have 18
    const sixDecimalStables = new Set(["USDT", "USDC", "FDUSD"]);

    const getTokenPriceUsd = (sym: string): number => {
      if (stableSymbols.has(sym)) return 1;
      if (mntSymbols.has(sym)) return wmntPriceUsd;
      if (moeSymbols.has(sym)) return moePriceUsd;
      return 0;
    };

    const getTokenDecimals = (sym: string): number => {
      return sixDecimalStables.has(sym) ? 6 : 18;
    };

    const results: RewardedPool[] = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const { pool, rewarder } = rewardedPairs[i]!;
      const data = poolData[i]!;

      const tokenX = tokenXAddresses[i] ?? ("0x0000000000000000000000000000000000000000" as Address);
      const tokenY = tokenYAddresses[i] ?? ("0x0000000000000000000000000000000000000000" as Address);
      const symX = symbolMap.get(tokenX) ?? "?";
      const symY = symbolMap.get(tokenY) ?? "?";

      const isTopPool = topPoolIds.has(data.pid);
      const weight = weightByPid.get(data.pid) ?? 0n;

      // Pool's MOE/day = total_net_moe_per_day × weight / total_weight
      // Only top pools (in VeMoe top list) receive dynamic emissions
      let poolMoePerDay = 0;
      if (isTopPool && totalWeightRaw > 0n && weight > 0n) {
        poolMoePerDay = moePerDay * (Number(weight) / Number(totalWeightRaw));
      }

      // Range TVL: sum bin reserves × token prices
      const rxMap = binReservesX.get(i);
      const ryMap = binReservesY.get(i);
      const range = data.range;
      let rangeTvlUsd = 0;
      let rewardedBins = 0;

      if (range) {
        const minBin = Number(range[0]);
        const maxBin = Number(range[1]);
        rewardedBins = maxBin - minBin + 1;
        if (rxMap && ryMap) {
          const priceX = getTokenPriceUsd(symX);
          const priceY = getTokenPriceUsd(symY);
          const decX = getTokenDecimals(symX);
          const decY = getTokenDecimals(symY);
          for (let b = minBin; b <= maxBin; b++) {
            const rx = rxMap.get(b) ?? 0n;
            const ry = ryMap.get(b) ?? 0n;
            rangeTvlUsd += (Number(rx) / 10 ** decX) * priceX;
            rangeTvlUsd += (Number(ry) / 10 ** decY) * priceY;
          }
        }
      }

      // APR = (poolMoePerDay * moePriceUsd * 365) / rangeTvlUsd * 100
      const aprPercent =
        rangeTvlUsd > 0 && moePriceUsd > 0
          ? (poolMoePerDay * moePriceUsd * 365 / rangeTvlUsd) * 100
          : 0;

      results.push({
        pool,
        rewarder,
        rewardToken: data.rewardToken ?? ("0x0000000000000000000000000000000000000000" as Address),
        minBinId: range ? Number(range[0]) : 0,
        maxBinId: range ? Number(range[1]) : 0,
        pid: data.pid,
        stopped: data.stopped,
        tokenX,
        tokenY,
        symbolX: symX,
        symbolY: symY,
        isTopPool,
        moePerDay: poolMoePerDay,
        rangeTvlUsd,
        aprPercent,
        rewardedBins,
      });
    }

    return results;
  }

  /**
   * Get a user's LB positions (bin balances) across a range of bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range (or active ± 50).
   */
  async getUserPositions(user: Address, pool: Address, binIds?: number[]): Promise<LBPosition[]> {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient({ transport: http(rpcUrl) });

    const resolvedBinIds = (binIds && binIds.length > 0) ? binIds : await this.autoDetectBins(pool);

    const accounts = resolvedBinIds.map(() => user);
    const ids = resolvedBinIds.map(BigInt);

    const balances = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "balanceOfBatch",
      args: [accounts, ids],
    }) as bigint[];

    return resolvedBinIds
      .map((binId, i) => ({ binId, balance: balances[i] ?? 0n }))
      .filter((p) => p.balance > 0n);
  }
}
