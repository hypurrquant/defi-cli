import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
} from "viem";
import type { Address, Hex } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
import type { DeFiTx } from "@hypurrquant/defi-core";

// ─── Constants ────────────────────────────────────────────────────────────────

/** KITTEN reward token on Hyper EVM */
const KITTEN_TOKEN: Address = "0x618275f8efe54c2afa87bfb9f210a52f0ff89364";

/** WHYPE bonus reward token */
const WHYPE_TOKEN: Address = "0x5555555555555555555555555555555555555555";

/** Batch size for multicall incentive scanning */
const MULTICALL_BATCH = 50;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const farmingCenterAbi = parseAbi([
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function enterFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function exitFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function collectRewards((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function claimReward(address rewardToken, address to, uint128 amountRequested) external returns (uint256 reward)",
]);

const positionManagerAbi = parseAbi([
  "function approveForFarming(uint256 tokenId, bool approve, address farmingAddress) external",
  "function farmingApprovals(uint256 tokenId) external view returns (address)",
]);

const eternalFarmingAbi = parseAbi([
  "function numOfIncentives() external view returns (uint256)",
  "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
  "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)",
]);

const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData)",
]);

const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncentiveKey {
  rewardToken: Address;
  bonusRewardToken: Address;
  pool: Address;
  nonce: bigint;
}

export interface FarmingPool {
  pool: Address;
  key: IncentiveKey;
  totalReward: bigint;
  bonusReward: bigint;
  active: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Compute the incentiveId hash for an IncentiveKey (keccak256(abi.encode(key))) */
function incentiveId(key: IncentiveKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "rewardToken", type: "address" },
        { name: "bonusRewardToken", type: "address" },
        { name: "pool", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
      [key.rewardToken, key.bonusRewardToken, key.pool, key.nonce],
    ),
  );
}

/** Build the enterFarming calldata (without selector overhead — for use inside multicall) */
function encodeEnterFarming(key: IncentiveKey, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: farmingCenterAbi,
    functionName: "enterFarming",
    args: [key, tokenId],
  });
}

/** Build the exitFarming calldata */
function encodeExitFarming(key: IncentiveKey, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: farmingCenterAbi,
    functionName: "exitFarming",
    args: [key, tokenId],
  });
}

/** Build the collectRewards calldata */
function encodeCollectRewards(key: IncentiveKey, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: farmingCenterAbi,
    functionName: "collectRewards",
    args: [key, tokenId],
  });
}

/** Build the claimReward calldata */
function encodeClaimReward(rewardToken: Address, to: Address): Hex {
  return encodeFunctionData({
    abi: farmingCenterAbi,
    functionName: "claimReward",
    args: [rewardToken, to, 2n ** 128n - 1n], // max uint128
  });
}

/** Encode the top-level multicall wrapping an array of calldatas */
function encodeMulticall(calls: Hex[]): Hex {
  return encodeFunctionData({
    abi: farmingCenterAbi,
    functionName: "multicall",
    args: [calls],
  });
}

// ─── Runtime cache ───────────────────────────────────────────────────────────

/** Runtime cache: pool (lowercased) → discovered nonce. Avoids repeated scans within a session. */
const nonceCache: Record<string, bigint> = {};

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class KittenSwapFarmingAdapter {
  private readonly protocolName: string;
  private readonly farmingCenter: Address;
  private readonly eternalFarming: Address;
  private readonly positionManager: Address;
  private readonly rpcUrl: string;

  constructor(
    protocolName: string,
    farmingCenter: Address,
    eternalFarming: Address,
    positionManager: Address,
    rpcUrl: string,
  ) {
    this.protocolName = protocolName;
    this.farmingCenter = farmingCenter;
    this.eternalFarming = eternalFarming;
    this.positionManager = positionManager;
    this.rpcUrl = rpcUrl;
  }

  name(): string {
    return this.protocolName;
  }

  /**
   * Discover the active IncentiveKey for a given pool.
   * 1. Check runtime cache
   * 2. Read numOfIncentives() for max nonce
   * 3. Batch-query via Multicall3 in reverse order (newest first)
   * 4. Return first active (non-deactivated, totalReward > 0) incentive
   */
  async discoverIncentiveKey(pool: Address): Promise<IncentiveKey | null> {
    const poolLc = pool.toLowerCase();

    // Fast path: runtime cache
    if (poolLc in nonceCache) {
      return {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: nonceCache[poolLc]!,
      };
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // Get total number of incentives ever created
    const numIncentives = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "numOfIncentives",
    }) as bigint;

    const maxNonce = Number(numIncentives) - 1;
    if (maxNonce < 0) return null;

    // Build incentive hash queries for all nonces, scan in reverse (newest first)
    const keys: IncentiveKey[] = [];
    for (let n = maxNonce; n >= 0; n--) {
      keys.push({
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: BigInt(n),
      });
    }

    // Batch via Multicall3
    for (let i = 0; i < keys.length; i += MULTICALL_BATCH) {
      const batch = keys.slice(i, i + MULTICALL_BATCH);
      const calls = batch.map((key) => ({
        target: this.eternalFarming,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)],
        }),
      }));

      const results = await client.readContract({
        address: MULTICALL3,
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [calls],
      }) as readonly { success: boolean; returnData: Hex }[];

      for (let j = 0; j < results.length; j++) {
        const r = results[j]!;
        if (!r.success || r.returnData.length < 66) continue;

        const decoded = decodeAbiParameters(
          [
            { name: "totalReward", type: "uint256" },
            { name: "bonusReward", type: "uint256" },
            { name: "virtualPoolAddress", type: "address" },
            { name: "minimalPositionWidth", type: "uint24" },
            { name: "deactivated", type: "bool" },
            { name: "pluginAddress", type: "address" },
          ],
          r.returnData,
        );

        const totalReward = decoded[0] as bigint;
        const deactivated = decoded[4] as boolean;

        if (totalReward > 0n && !deactivated) {
          const key = batch[j]!;
          nonceCache[poolLc] = key.nonce;
          return key;
        }
      }
    }

    return null;
  }

  /**
   * Build approveForFarming tx on the PositionManager.
   * Required before enterFarming if not already approved.
   */
  async buildApproveForFarming(tokenId: bigint): Promise<DeFiTx | null> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const currentApproval = await client.readContract({
      address: this.positionManager,
      abi: positionManagerAbi,
      functionName: "farmingApprovals",
      args: [tokenId],
    }) as Address;

    if (currentApproval.toLowerCase() === this.farmingCenter.toLowerCase()) {
      return null; // Already approved
    }

    return {
      description: `[${this.protocolName}] Approve NFT #${tokenId} for farming`,
      to: this.positionManager,
      data: encodeFunctionData({
        abi: positionManagerAbi,
        functionName: "approveForFarming",
        args: [tokenId, true, this.farmingCenter],
      }),
      value: 0n,
      gas_estimate: 60_000,
    };
  }

  /**
   * Build enterFarming tx for a position NFT.
   * Checks farming approval first and returns pre_txs if needed.
   */
  async buildEnterFarming(
    tokenId: bigint,
    pool: Address,
    _owner: Address,
  ): Promise<DeFiTx> {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`,
      );
    }

    const approveTx = await this.buildApproveForFarming(tokenId);

    return {
      description: `[${this.protocolName}] Enter farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeEnterFarming(key, tokenId),
      value: 0n,
      gas_estimate: 400_000,
      pre_txs: approveTx ? [approveTx] : undefined,
    };
  }

  /**
   * Build a tx that exits farming for a position NFT (unstakes).
   */
  async buildExitFarming(tokenId: bigint, pool: Address): Promise<DeFiTx> {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`,
      );
    }

    return {
      description: `[${this.protocolName}] Exit farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeExitFarming(key, tokenId),
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  /**
   * Build a multicall tx that collects rewards for a staked position and claims them.
   * Pattern: multicall([collectRewards(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
   */
  async buildCollectRewards(
    tokenId: bigint,
    pool: Address,
    owner: Address,
  ): Promise<DeFiTx> {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`,
      );
    }

    const calls: Hex[] = [
      encodeCollectRewards(key, tokenId),
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner),
    ];

    return {
      description: `[${this.protocolName}] Collect + claim rewards for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 400_000,
    };
  }

  /**
   * Build a tx that only claims already-accumulated rewards (no position change needed).
   */
  async buildClaimReward(owner: Address): Promise<DeFiTx> {
    const calls: Hex[] = [
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner),
    ];

    return {
      description: `[${this.protocolName}] Claim KITTEN + WHYPE farming rewards to ${owner}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /**
   * Query pending rewards for a staked position NFT.
   */
  async getPendingRewards(
    tokenId: bigint,
    pool: Address,
  ): Promise<{ reward: bigint; bonusReward: bigint }> {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      return { reward: 0n, bonusReward: 0n };
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const result = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "getRewardInfo",
      args: [key, tokenId],
    }) as readonly [bigint, bigint];

    return { reward: result[0], bonusReward: result[1] };
  }

  /**
   * Discover all pools with active farming incentives.
   * Dynamically scans all nonces (0..numOfIncentives) via Multicall3 and
   * groups results by pool. Only returns the latest active incentive per pool.
   */
  async discoverFarmingPools(): Promise<FarmingPool[]> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // Known pool addresses to check (extend as new pools are listed)
    // We discover by scanning all nonces with known reward tokens
    const numIncentives = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "numOfIncentives",
    }) as bigint;

    const maxNonce = Number(numIncentives) - 1;
    if (maxNonce < 0) return [];

    // To discover pools, we need to know pool addresses upfront or scan events.
    // Since the incentiveId is hash(rewardToken, bonusRewardToken, pool, nonce),
    // we can't reverse it. Use known pool list + any pools from the Algebra factory.
    // For now, use the KittenSwap known pools from the factory config.
    const knownPools: Address[] = [
      "0x71d1fde797e1810711e4c9abcfca6ef04c266196", // WHYPE/KITTEN
      "0x3c1403335d0ca7d0a73c9e775b25514537c2b809", // WHYPE/USDT0
      "0x12df9913e9e08453440e3c4b1ae73819160b513e", // WHYPE/USDC
    ];

    const results: FarmingPool[] = [];

    for (const pool of knownPools) {
      const key = await this.discoverIncentiveKey(pool);
      if (!key) continue;

      const iid = incentiveId(key);
      const incentive = await client.readContract({
        address: this.eternalFarming,
        abi: eternalFarmingAbi,
        functionName: "incentives",
        args: [iid],
      }) as readonly [bigint, bigint, Address, number, boolean, Address];

      results.push({
        pool,
        key,
        totalReward: incentive[0],
        bonusReward: incentive[1],
        active: !incentive[4] && incentive[0] > 0n,
      });
    }

    return results;
  }
}
