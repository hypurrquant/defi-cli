import {
  decodeAbiParameters,
  encodeFunctionData,
  encodeAbiParameters,
  http,
  createPublicClient,
  keccak256,
  parseAbi,
  decodeFunctionResult,
  zeroAddress,
} from "viem";
import type { Address, Hex } from "viem";

import { DefiError, multicallRead } from "@hypurrquant/defi-core";
import type { DeFiTx } from "@hypurrquant/defi-core";

// ─── Constants ────────────────────────────────────────────────────────────────

/** KITTEN reward token on Hyper EVM */
const KITTEN_TOKEN: Address = "0x618275f8efe54c2afa87bfb9f210a52f0ff89364";

/** WHYPE bonus reward token */
const WHYPE_TOKEN: Address = "0x5555555555555555555555555555555555555555";

/** Max nonce to scan when discovering incentive keys */
const MAX_NONCE_SCAN = 60;

/** HyperEVM well-known token addresses for pool discovery (matches solidly_gauge.ts) */
const HYPEREVM_TOKENS: Address[] = [
  "0x5555555555555555555555555555555555555555", // WHYPE
  "0xb88339CB7199b77E23DB6E890353E22632Ba630f", // USDC
  "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", // USDT0
  "0xBe6727B535545C67d5cAa73dEa54865B92CF7907", // UETH
  "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463", // UBTC
  "0x111111a1a0667d36bD57c0A9f569b98057111111", // USDH
  "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe
  "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", // sUSDe
  "0xf4D9235269a96aaDaFc9aDAe454a0618eBE37949", // XAUt0
  "0xfD739d4e423301CE9385c1fb8850539D657C296D", // kHYPE
  KITTEN_TOKEN,                                  // KITTEN
];

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
  "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
  "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)",
]);

const algebraFactoryAbi = parseAbi([
  "function poolByPair(address tokenA, address tokenB) external view returns (address pool)",
]);

// Decode helpers
const _addressDecodeAbi = parseAbi(["function f() external view returns (address)"]);
function decodeAddress(data: Hex | null): Address | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _addressDecodeAbi, functionName: "f", data }) as Address;
  } catch {
    return null;
  }
}

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
const nonceCache = new Map<string, bigint>();

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class KittenSwapFarmingAdapter {
  private readonly protocolName: string;
  private readonly farmingCenter: Address;
  private readonly eternalFarming: Address;
  private readonly positionManager: Address;
  private readonly rpcUrl: string;
  private readonly factory: Address | undefined;

  constructor(
    protocolName: string,
    farmingCenter: Address,
    eternalFarming: Address,
    positionManager: Address,
    rpcUrl: string,
    factory?: Address,
  ) {
    this.protocolName = protocolName;
    this.farmingCenter = farmingCenter;
    this.eternalFarming = eternalFarming;
    this.positionManager = positionManager;
    this.rpcUrl = rpcUrl;
    this.factory = factory;
  }

  name(): string {
    return this.protocolName;
  }

  /**
   * Discover the active IncentiveKey for a given pool.
   * 1. Check runtime cache
   * 2. Batch-query nonces 0-60 via single multicall (61 calls)
   * 3. Return first non-zero incentive (totalReward > 0 and not deactivated)
   */
  async discoverIncentiveKey(pool: Address): Promise<IncentiveKey | null> {
    const poolLc = pool.toLowerCase();

    // Fast path: runtime cache
    if (nonceCache.has(poolLc)) {
      return {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: nonceCache.get(poolLc)!,
      };
    }

    // Build 61 multicall calls for nonces 0-60
    const calls: Array<[Address, Hex]> = [];
    const nonces: bigint[] = [];
    for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
      const nonce = BigInt(n);
      nonces.push(nonce);
      const key: IncentiveKey = {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce,
      };
      calls.push([
        this.eternalFarming,
        encodeFunctionData({
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)],
        }),
      ]);
    }

    const results = await multicallRead(this.rpcUrl, calls);

    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (!data || data.length < 66) continue;

      try {
        const decoded = decodeAbiParameters(
          [
            { name: "totalReward", type: "uint256" },
            { name: "bonusReward", type: "uint256" },
            { name: "virtualPoolAddress", type: "address" },
            { name: "minimalPositionWidth", type: "uint24" },
            { name: "deactivated", type: "bool" },
            { name: "pluginAddress", type: "address" },
          ],
          data,
        );

        const totalReward = decoded[0] as bigint;
        const deactivated = decoded[4] as boolean;

        if (totalReward > 0n && !deactivated) {
          const nonce = nonces[i]!;
          nonceCache.set(poolLc, nonce);
          return {
            rewardToken: KITTEN_TOKEN,
            bonusRewardToken: WHYPE_TOKEN,
            pool,
            nonce,
          };
        }
      } catch {
        // skip decode errors
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
   * Discover all KittenSwap pools with active farming incentives.
   *
   * Steps:
   * 1. Generate all unique token pair combos from HYPEREVM_TOKENS (includes KITTEN)
   * 2. Batch poolByPair calls via multicall against the Algebra factory
   * 3. For each found pool, batch-scan nonces 0-60 via multicall
   * 4. Return enriched FarmingPool[] for pools with active incentives
   */
  async discoverFarmingPools(): Promise<FarmingPool[]> {
    if (!this.factory) {
      return [];
    }

    // Step 1: generate all unique token pairs
    const pairs: Array<[Address, Address]> = [];
    for (let i = 0; i < HYPEREVM_TOKENS.length; i++) {
      for (let j = i + 1; j < HYPEREVM_TOKENS.length; j++) {
        pairs.push([HYPEREVM_TOKENS[i]!, HYPEREVM_TOKENS[j]!]);
      }
    }

    // Step 2: batch poolByPair calls
    const poolByPairCalls: Array<[Address, Hex]> = pairs.map(([tokenA, tokenB]) => [
      this.factory!,
      encodeFunctionData({
        abi: algebraFactoryAbi,
        functionName: "poolByPair",
        args: [tokenA, tokenB],
      }),
    ]);

    const poolResults = await multicallRead(this.rpcUrl, poolByPairCalls);

    // Collect unique non-zero pool addresses
    const poolSet = new Set<string>();
    for (const data of poolResults) {
      const addr = decodeAddress(data);
      if (addr && addr !== zeroAddress) {
        poolSet.add(addr.toLowerCase());
      }
    }

    if (poolSet.size === 0) return [];

    const pools = Array.from(poolSet) as Address[];

    // Step 3: for each pool, batch-scan nonces 0-60 via a single multicall per pool.
    // We build all nonce calls for all pools in one big multicall to minimize RPC round-trips.
    const NONCE_COUNT = MAX_NONCE_SCAN + 1; // 61
    const allNonceCalls: Array<[Address, Hex]> = [];
    for (const pool of pools) {
      for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
        const key: IncentiveKey = {
          rewardToken: KITTEN_TOKEN,
          bonusRewardToken: WHYPE_TOKEN,
          pool: pool as Address,
          nonce: BigInt(n),
        };
        allNonceCalls.push([
          this.eternalFarming,
          encodeFunctionData({
            abi: eternalFarmingAbi,
            functionName: "incentives",
            args: [incentiveId(key)],
          }),
        ]);
      }
    }

    const allNonceResults = await multicallRead(this.rpcUrl, allNonceCalls);

    // Step 4: find best active incentive per pool and build result
    const results: FarmingPool[] = [];

    for (let pi = 0; pi < pools.length; pi++) {
      const pool = pools[pi]! as Address;
      const poolLc = pool.toLowerCase();
      const base = pi * NONCE_COUNT;

      let bestKey: IncentiveKey | null = null;
      let bestTotalReward = 0n;
      let bestBonusReward = 0n;
      let bestActive = false;

      for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
        const data = allNonceResults[base + n];
        if (!data || data.length < 66) continue;

        try {
          const decoded = decodeAbiParameters(
            [
              { name: "totalReward", type: "uint256" },
              { name: "bonusReward", type: "uint256" },
              { name: "virtualPoolAddress", type: "address" },
              { name: "minimalPositionWidth", type: "uint24" },
              { name: "deactivated", type: "bool" },
              { name: "pluginAddress", type: "address" },
            ],
            data,
          );

          const totalReward = decoded[0] as bigint;
          const bonusReward = decoded[1] as bigint;
          const deactivated = decoded[4] as boolean;

          if (totalReward > 0n) {
            const nonce = BigInt(n);
            const isActive = !deactivated;

            // Prefer active incentives; among active ones, prefer higher nonce (newer)
            if (!bestKey || (isActive && !bestActive) || (isActive === bestActive && nonce > bestKey.nonce)) {
              bestKey = {
                rewardToken: KITTEN_TOKEN,
                bonusRewardToken: WHYPE_TOKEN,
                pool,
                nonce,
              };
              bestTotalReward = totalReward;
              bestBonusReward = bonusReward;
              bestActive = isActive;
            }
          }
        } catch {
          // skip decode errors
        }
      }

      if (bestKey) {
        // Cache the discovered nonce
        nonceCache.set(poolLc, bestKey.nonce);
        results.push({
          pool,
          key: bestKey,
          totalReward: bestTotalReward,
          bonusReward: bestBonusReward,
          active: bestActive,
        });
      }
    }

    return results;
  }
}
