import {
  createPublicClient,
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

/** Maximum nonce to scan when discovering incentive keys */
const MAX_NONCE_SCAN = 60;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const farmingCenterAbi = parseAbi([
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function enterFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function exitFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function collectRewards((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function claimReward(address rewardToken, address to, uint128 amountRequested) external returns (uint256 reward)",
]);

const eternalFarmingAbi = parseAbi([
  "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
  "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)",
]);

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

// ─── Known nonces (static cache, updated periodically) ────────────────────────

/**
 * Known incentive nonces per pool address (lower-cased).
 * Avoids 60-RPC-call scans when nonces are already known.
 */
const KNOWN_NONCES: Record<string, number> = {
  // WHYPE/KITTEN pool
  "0x71d1fde797e1810711e4c9abcfca6ef04c266196": 33,
  // WHYPE/USDT0 pool
  "0x3c1403335d0ca7d0a73c9e775b25514537c2b809": 1,
  // WHYPE/USDC pool
  "0x12df9913e9e08453440e3c4b1ae73819160b513e": 43,
};

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class KittenSwapFarmingAdapter {
  private readonly protocolName: string;
  private readonly farmingCenter: Address;
  private readonly eternalFarming: Address;
  private readonly rpcUrl: string;

  constructor(
    protocolName: string,
    farmingCenter: Address,
    eternalFarming: Address,
    rpcUrl: string,
  ) {
    this.protocolName = protocolName;
    this.farmingCenter = farmingCenter;
    this.eternalFarming = eternalFarming;
    this.rpcUrl = rpcUrl;
  }

  name(): string {
    return this.protocolName;
  }

  /**
   * Discover the active IncentiveKey for a given pool by scanning nonces 0–MAX_NONCE_SCAN.
   * Checks KNOWN_NONCES first for instant resolution.
   */
  async discoverIncentiveKey(pool: Address): Promise<IncentiveKey | null> {
    const poolLc = pool.toLowerCase();

    // Fast path: known nonce
    if (poolLc in KNOWN_NONCES) {
      const nonce = KNOWN_NONCES[poolLc]!;
      return {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: BigInt(nonce),
      };
    }

    // Slow path: scan nonces via RPC
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
      const key: IncentiveKey = {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: BigInt(n),
      };

      try {
        const result = await client.readContract({
          address: this.eternalFarming,
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)],
        }) as readonly [bigint, bigint, Address, number, boolean, Address];

        const totalReward = result[0];
        const deactivated = result[4];

        if (totalReward > 0n && !deactivated) {
          return key;
        }
      } catch {
        // incentive not found at this nonce — continue
      }
    }

    return null;
  }

  /**
   * Build a multicall tx that enters farming for a position NFT.
   * Pattern: multicall([enterFarming(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
   */
  async buildEnterFarming(
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
      encodeEnterFarming(key, tokenId),
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner),
    ];

    return {
      description: `[${this.protocolName}] Enter farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 400_000,
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
   * Iterates KNOWN_NONCES pools and verifies each against the on-chain incentives mapping.
   */
  async discoverFarmingPools(): Promise<FarmingPool[]> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const results: FarmingPool[] = [];

    for (const [poolAddr, nonce] of Object.entries(KNOWN_NONCES)) {
      const pool = poolAddr as Address;
      const key: IncentiveKey = {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: BigInt(nonce),
      };

      try {
        const incentive = await client.readContract({
          address: this.eternalFarming,
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)],
        }) as readonly [bigint, bigint, Address, number, boolean, Address];

        const totalReward = incentive[0];
        const bonusReward = incentive[1];
        const deactivated = incentive[4];

        results.push({
          pool,
          key,
          totalReward,
          bonusReward,
          active: !deactivated && totalReward > 0n,
        });
      } catch {
        // skip pools that error
      }
    }

    return results;
  }
}
