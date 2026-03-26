import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, parseAbi, zeroAddress } from "viem";
import type { Address, Hex } from "viem";

import { DefiError, multicallRead } from "@hypurrquant/defi-core";
import type {
  IGaugeSystem,
  GaugedPool,
  ProtocolEntry,
  RewardInfo,
  DeFiTx,
} from "@hypurrquant/defi-core";

const gaugeAbi = parseAbi([
  "function deposit(uint256 amount) external",
  "function depositFor(uint256 amount, uint256 tokenId) external",
  "function withdraw(uint256 amount) external",
  "function getReward() external",
  "function getReward(address account) external",
  "function getReward(address account, address[] tokens) external",
  "function getReward(uint256 tokenId) external",
  "function earned(address account) external view returns (uint256)",
  "function earned(address token, address account) external view returns (uint256)",
  "function earned(uint256 tokenId) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function rewardToken() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function rewardsListLength() external view returns (uint256)",
  "function rewardData(address token) external view returns (uint256 periodFinish, uint256 rewardRate, uint256 lastUpdateTime, uint256 rewardPerTokenStored)",
  "function nonfungiblePositionManager() external view returns (address)",
]);

const veAbi = parseAbi([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
  "function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)",
]);

const voterAbi = parseAbi([
  "function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external",
  "function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external",
  "function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external",
  "function gauges(address pool) external view returns (address)",
  "function gaugeForPool(address pool) external view returns (address)",
  "function poolToGauge(address pool) external view returns (address)",
]);

// Multicall decode helpers
const _addressDecodeAbi = parseAbi(["function f() external view returns (address)"]);
function decodeAddress(data: Hex | null): Address | null {
  if (!data) return null;
  try {
    return decodeFunctionResult({ abi: _addressDecodeAbi, functionName: "f", data }) as Address;
  } catch {
    return null;
  }
}

const _symbolDecodeAbi = parseAbi(["function symbol() external view returns (string)"]);
function decodeSymbol(data: Hex | null): string {
  if (!data) return "?";
  try {
    return decodeFunctionResult({ abi: _symbolDecodeAbi, functionName: "symbol", data }) as string;
  } catch {
    return "?";
  }
}

const _boolDecodeAbi = parseAbi(["function f() external view returns (bool)"]);
function decodeBoolean(data: Hex): boolean {
  try {
    return decodeFunctionResult({ abi: _boolDecodeAbi, functionName: "f", data }) as boolean;
  } catch {
    return false;
  }
}

// HyperEVM well-known token addresses for CL pool discovery
const HYPEREVM_TOKENS: Record<string, Address> = {
  WHYPE:  "0x5555555555555555555555555555555555555555",
  USDC:   "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  USDT0:  "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  WETH:   "0xBE6427B974c51B8CACc3F2F3b0f2e1AD01b37C34",
  mETH:   "0x9ebA3E5a4B3B58C0e54fa8bad13eC6f5D3A7E3b2",
  UBTC:   "0x9FdBceda8F3030dC7Eb4dB9F70FA6451d2Fb5E81",
  RAM:    "0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418",
  hyperRAM: "0xAAAE8378809bb8815c08D3C59Eb0c7D1529aD769",
};

const CL_TICK_SPACINGS = [1, 10, 50, 100, 200];

export class SolidlyGaugeAdapter implements IGaugeSystem {
  private readonly protocolName: string;
  private readonly voter: Address;
  private readonly veToken: Address;
  private readonly rpcUrl: string | undefined;
  private readonly clFactory: Address | undefined;
  private readonly v2Factory: Address | undefined;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const voter = entry.contracts?.["voter"];
    if (!voter) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'voter' contract");
    }
    const veToken = entry.contracts?.["ve_token"];
    if (!veToken) {
      throw new DefiError("CONTRACT_ERROR", "Missing 've_token' contract");
    }
    this.voter = voter;
    this.veToken = veToken;
    this.rpcUrl = rpcUrl;
    this.clFactory = entry.contracts?.["cl_factory"] ?? entry.contracts?.["factory"];
    this.v2Factory = entry.contracts?.["pair_factory"] ?? entry.contracts?.["factory"];
  }

  name(): string {
    return this.protocolName;
  }

  /** Scan V2 and CL factories for pools that have active emission gauges. */
  async discoverGaugedPools(): Promise<GaugedPool[]> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required for gauge discovery");

    const results: GaugedPool[] = [];

    await Promise.all([
      this._discoverV2GaugedPools(results),
      this._discoverCLGaugedPools(results),
    ]);

    return results;
  }

  private async _discoverV2GaugedPools(out: GaugedPool[]): Promise<void> {
    if (!this.rpcUrl || !this.v2Factory) return;

    const v2FactoryAbi = parseAbi([
      "function allPairsLength() external view returns (uint256)",
      "function allPairs(uint256) external view returns (address)",
    ]);
    const pairAbi = parseAbi([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function stable() external view returns (bool)",
    ]);
    const erc20SymbolAbi = parseAbi(["function symbol() external view returns (string)"]);

    // Step 1: get total pairs count
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    let pairCount: bigint;
    try {
      pairCount = await client.readContract({
        address: this.v2Factory,
        abi: v2FactoryAbi,
        functionName: "allPairsLength",
      }) as bigint;
    } catch {
      return;
    }

    const count = Number(pairCount);
    if (count === 0) return;

    // Step 2: batch-fetch all pair addresses
    const pairAddressCalls: Array<[Address, Hex]> = [];
    for (let i = 0; i < count; i++) {
      pairAddressCalls.push([
        this.v2Factory,
        encodeFunctionData({ abi: v2FactoryAbi, functionName: "allPairs", args: [BigInt(i)] }),
      ]);
    }
    const pairAddressResults = await multicallRead(this.rpcUrl, pairAddressCalls);
    const pairs: Address[] = pairAddressResults.map((r) => decodeAddress(r)).filter((a): a is Address => a !== null && a !== zeroAddress);

    if (pairs.length === 0) return;

    // Step 3: for each pair, call gaugeForPool on voter
    const gaugeForPoolAbi = parseAbi(["function gaugeForPool(address) external view returns (address)"]);
    const gaugeCalls: Array<[Address, Hex]> = pairs.map((pair) => [
      this.voter,
      encodeFunctionData({ abi: gaugeForPoolAbi, functionName: "gaugeForPool", args: [pair] }),
    ]);
    const gaugeResults = await multicallRead(this.rpcUrl, gaugeCalls);

    // Filter only pairs that have a gauge
    const gaugedPairs: Array<{ pair: Address; gauge: Address }> = [];
    for (let i = 0; i < pairs.length; i++) {
      const gauge = decodeAddress(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress) {
        gaugedPairs.push({ pair: pairs[i]!, gauge });
      }
    }

    if (gaugedPairs.length === 0) return;

    // Step 4: fetch token0, token1, stable for each gauged pair
    const metaCalls: Array<[Address, Hex]> = [];
    for (const { pair } of gaugedPairs) {
      metaCalls.push([pair, encodeFunctionData({ abi: pairAbi, functionName: "token0" })]);
      metaCalls.push([pair, encodeFunctionData({ abi: pairAbi, functionName: "token1" })]);
      metaCalls.push([pair, encodeFunctionData({ abi: pairAbi, functionName: "stable" })]);
    }
    const metaResults = await multicallRead(this.rpcUrl, metaCalls);

    // Step 5: collect unique token addresses and fetch symbols
    const tokenAddrs = new Set<Address>();
    for (let i = 0; i < gaugedPairs.length; i++) {
      const t0 = decodeAddress(metaResults[i * 3] ?? null);
      const t1 = decodeAddress(metaResults[i * 3 + 1] ?? null);
      if (t0 && t0 !== zeroAddress) tokenAddrs.add(t0);
      if (t1 && t1 !== zeroAddress) tokenAddrs.add(t1);
    }

    const uniqueTokens = Array.from(tokenAddrs);
    const symbolCalls: Array<[Address, Hex]> = uniqueTokens.map((t) => [
      t,
      encodeFunctionData({ abi: erc20SymbolAbi, functionName: "symbol" }),
    ]);
    const symbolResults = await multicallRead(this.rpcUrl, symbolCalls);
    const symbolMap = new Map<Address, string>();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i]!, decodeSymbol(symbolResults[i] ?? null));
    }

    // Step 6: assemble results
    for (let i = 0; i < gaugedPairs.length; i++) {
      const { pair, gauge } = gaugedPairs[i]!;
      const t0 = decodeAddress(metaResults[i * 3] ?? null);
      const t1 = decodeAddress(metaResults[i * 3 + 1] ?? null);
      const stableRaw = metaResults[i * 3 + 2];
      const stable = stableRaw ? decodeBoolean(stableRaw) : false;
      out.push({
        pool: pair,
        gauge,
        token0: t0 ? (symbolMap.get(t0) ?? t0.slice(0, 10)) : "?",
        token1: t1 ? (symbolMap.get(t1) ?? t1.slice(0, 10)) : "?",
        type: "V2",
        stable,
      });
    }
  }

  private async _discoverCLGaugedPools(out: GaugedPool[]): Promise<void> {
    if (!this.rpcUrl || !this.clFactory) return;

    const clFactoryAbi = parseAbi([
      "function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address pool)",
    ]);
    const poolAbi = parseAbi([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
    ]);
    const erc20SymbolAbi = parseAbi(["function symbol() external view returns (string)"]);
    const gaugeForPoolAbi = parseAbi(["function gaugeForPool(address) external view returns (address)"]);

    const tokenEntries = Object.entries(HYPEREVM_TOKENS);
    const tokenAddresses = tokenEntries.map(([, addr]) => addr);

    // Generate all unique token pairs
    const pairs: Array<[Address, Address]> = [];
    for (let i = 0; i < tokenAddresses.length; i++) {
      for (let j = i + 1; j < tokenAddresses.length; j++) {
        pairs.push([tokenAddresses[i]!, tokenAddresses[j]!]);
      }
    }

    // Build getPool calls for all (tokenA, tokenB, tickSpacing) combos
    const getPoolCalls: Array<[Address, Hex]> = [];
    for (const [tokenA, tokenB] of pairs) {
      for (const ts of CL_TICK_SPACINGS) {
        getPoolCalls.push([
          this.clFactory,
          encodeFunctionData({ abi: clFactoryAbi, functionName: "getPool", args: [tokenA, tokenB, ts] }),
        ]);
      }
    }

    const getPoolResults = await multicallRead(this.rpcUrl, getPoolCalls);

    // Collect non-zero pool addresses with their tickSpacing index
    const candidatePools: Array<{ pool: Address; tokenA: Address; tokenB: Address; tickSpacing: number }> = [];
    for (let i = 0; i < getPoolCalls.length; i++) {
      const pool = decodeAddress(getPoolResults[i] ?? null);
      if (pool && pool !== zeroAddress) {
        const pairIdx = Math.floor(i / CL_TICK_SPACINGS.length);
        const tsIdx = i % CL_TICK_SPACINGS.length;
        const [tokenA, tokenB] = pairs[pairIdx]!;
        candidatePools.push({ pool, tokenA: tokenA!, tokenB: tokenB!, tickSpacing: CL_TICK_SPACINGS[tsIdx]! });
      }
    }

    if (candidatePools.length === 0) return;

    // Batch gaugeForPool for all candidate pools
    const gaugeCalls: Array<[Address, Hex]> = candidatePools.map(({ pool }) => [
      this.voter,
      encodeFunctionData({ abi: gaugeForPoolAbi, functionName: "gaugeForPool", args: [pool] }),
    ]);
    const gaugeResults = await multicallRead(this.rpcUrl, gaugeCalls);

    // Filter to pools that have a gauge
    const gaugedCL: Array<{ pool: Address; gauge: Address; tokenA: Address; tokenB: Address; tickSpacing: number }> = [];
    for (let i = 0; i < candidatePools.length; i++) {
      const gauge = decodeAddress(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress) {
        gaugedCL.push({ ...candidatePools[i]!, gauge });
      }
    }

    if (gaugedCL.length === 0) return;

    // Fetch token0/token1 from pool to get correct ordering, then symbols
    const tokenAddrsInPools = new Set<Address>();
    for (const { tokenA, tokenB } of gaugedCL) {
      tokenAddrsInPools.add(tokenA);
      tokenAddrsInPools.add(tokenB);
    }
    const uniqueTokens = Array.from(tokenAddrsInPools);
    const symbolCalls: Array<[Address, Hex]> = uniqueTokens.map((t) => [
      t,
      encodeFunctionData({ abi: erc20SymbolAbi, functionName: "symbol" }),
    ]);
    const symbolResults = await multicallRead(this.rpcUrl, symbolCalls);
    const symbolMap = new Map<Address, string>();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i]!, decodeSymbol(symbolResults[i] ?? null));
    }

    // Also try to read actual token0/token1 ordering from the pool contract
    const poolTokenCalls: Array<[Address, Hex]> = [];
    for (const { pool } of gaugedCL) {
      poolTokenCalls.push([pool, encodeFunctionData({ abi: poolAbi, functionName: "token0" })]);
      poolTokenCalls.push([pool, encodeFunctionData({ abi: poolAbi, functionName: "token1" })]);
    }
    const poolTokenResults = await multicallRead(this.rpcUrl, poolTokenCalls);

    for (let i = 0; i < gaugedCL.length; i++) {
      const { pool, gauge, tokenA, tokenB, tickSpacing } = gaugedCL[i]!;
      const rawT0 = decodeAddress(poolTokenResults[i * 2] ?? null);
      const rawT1 = decodeAddress(poolTokenResults[i * 2 + 1] ?? null);
      const t0 = rawT0 && rawT0 !== zeroAddress ? rawT0 : tokenA;
      const t1 = rawT1 && rawT1 !== zeroAddress ? rawT1 : tokenB;
      out.push({
        pool,
        gauge,
        token0: symbolMap.get(t0) ?? t0.slice(0, 10),
        token1: symbolMap.get(t1) ?? t1.slice(0, 10),
        type: "CL",
        tickSpacing,
      });
    }
  }

  // IGauge

  async buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint, lpToken?: Address): Promise<DeFiTx> {
    if (tokenId !== undefined) {
      const data = encodeFunctionData({
        abi: gaugeAbi,
        functionName: "depositFor",
        args: [amount, tokenId],
      });
      return {
        description: `[${this.protocolName}] Deposit ${amount} LP to gauge (boost veNFT #${tokenId})`,
        to: gauge,
        data,
        value: 0n,
        gas_estimate: 200_000,
        approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : undefined,
      };
    }

    const data = encodeFunctionData({
      abi: gaugeAbi,
      functionName: "deposit",
      args: [amount],
    });
    return {
      description: `[${this.protocolName}] Deposit ${amount} LP to gauge`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 200_000,
      approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : undefined,
    };
  }

  async buildWithdraw(gauge: Address, amount: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: gaugeAbi,
      functionName: "withdraw",
      args: [amount],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from gauge`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /**
   * Resolve gauge address from a pool address via voter contract.
   * Tries gaugeForPool (Ramses), poolToGauge (NEST), gauges (classic Solidly).
   */
  async resolveGauge(pool: Address): Promise<Address> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required for gauge lookup");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    for (const fn of ["gaugeForPool", "poolToGauge", "gauges"] as const) {
      try {
        const gauge = await client.readContract({
          address: this.voter,
          abi: voterAbi,
          functionName: fn,
          args: [pool],
        }) as Address;
        if (gauge !== zeroAddress) return gauge;
      } catch {
        // try next
      }
    }
    throw new DefiError("CONTRACT_ERROR", `[${this.protocolName}] No gauge found for pool ${pool}`);
  }

  /**
   * Discover reward tokens for a gauge.
   * Returns { tokens, multiToken } where multiToken indicates getReward(account, tokens[]) support.
   */
  private async discoverRewardTokens(gauge: Address): Promise<{ tokens: Address[]; multiToken: boolean }> {
    if (!this.rpcUrl) return { tokens: [], multiToken: false };
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // 1. Try rewardsListLength — multi-token gauges (Ramses style)
    try {
      const len = await client.readContract({
        address: gauge,
        abi: gaugeAbi,
        functionName: "rewardsListLength",
      }) as bigint;

      if (Number(len) > 0) {
        // Discover via rewardData for known HyperEVM tokens
        const candidates: Address[] = [
          "0x5555555555555555555555555555555555555555", // WHYPE
          "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555", // xRAM
          "0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8", // HYBR
          "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035", // NEST token
        ];
        const found: Address[] = [];
        for (const token of candidates) {
          try {
            const rd = await client.readContract({
              address: gauge,
              abi: gaugeAbi,
              functionName: "rewardData",
              args: [token],
            }) as readonly [bigint, bigint, bigint, bigint];
            if (rd[0] > 0n || rd[1] > 0n) found.push(token);
          } catch { /* not a reward */ }
        }
        if (found.length > 0) return { tokens: found, multiToken: true };
        return { tokens: [], multiToken: true }; // has rewards but couldn't enumerate
      }
    } catch {
      // no rewardsListLength
    }

    // 2. Fallback: rewardToken() — single-reward gauges (NEST / Hybra style)
    try {
      const rt = await client.readContract({
        address: gauge,
        abi: gaugeAbi,
        functionName: "rewardToken",
      }) as Address;
      if (rt !== zeroAddress) return { tokens: [rt], multiToken: false };
    } catch { /* no rewardToken */ }

    return { tokens: [], multiToken: false };
  }

  async buildClaimRewards(gauge: Address, account?: Address): Promise<DeFiTx> {
    if (!this.rpcUrl || !account) {
      const data = encodeFunctionData({
        abi: gaugeAbi,
        functionName: "getReward",
        args: [account ?? zeroAddress],
      });
      return { description: `[${this.protocolName}] Claim gauge rewards`, to: gauge, data, value: 0n, gas_estimate: 200_000 };
    }

    const { tokens, multiToken } = await this.discoverRewardTokens(gauge);

    // Multi-token gauge (Ramses): getReward(account, tokens[])
    if (multiToken && tokens.length > 0) {
      const data = encodeFunctionData({
        abi: gaugeAbi,
        functionName: "getReward",
        args: [account, tokens],
      });
      return {
        description: `[${this.protocolName}] Claim gauge rewards (${tokens.length} tokens)`,
        to: gauge, data, value: 0n, gas_estimate: 300_000,
      };
    }

    // Single-token gauge (NEST / standard): getReward() with no args
    // Some gauges use getReward(account), but NEST-style uses getReward()
    const data = encodeFunctionData({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [],
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards`,
      to: gauge, data, value: 0n, gas_estimate: 200_000,
    };
  }

  /**
   * Claim rewards for a CL gauge by NFT tokenId (Hybra V4 style).
   */
  async buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [tokenId],
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards for NFT #${tokenId}`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async getPendingRewards(gauge: Address, user: Address): Promise<RewardInfo[]> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const results: RewardInfo[] = [];

    const { tokens, multiToken } = await this.discoverRewardTokens(gauge);

    if (multiToken && tokens.length > 0) {
      for (const token of tokens) {
        try {
          const earned = await client.readContract({
            address: gauge, abi: gaugeAbi, functionName: "earned", args: [token, user],
          }) as bigint;
          results.push({ token, symbol: token.slice(0, 10), amount: earned });
        } catch { /* skip */ }
      }
    } else if (tokens.length > 0) {
      // Single-token gauge: earned(account)
      try {
        const earned = await client.readContract({
          address: gauge, abi: gaugeAbi, functionName: "earned", args: [user],
        }) as bigint;
        results.push({ token: tokens[0]!, symbol: tokens[0]!.slice(0, 10), amount: earned });
      } catch { /* skip */ }
    } else {
      try {
        const earned = await client.readContract({
          address: gauge, abi: gaugeAbi, functionName: "earned", args: [user],
        }) as bigint;
        results.push({ token: zeroAddress as Address, symbol: "unknown", amount: earned });
      } catch { /* skip */ }
    }

    return results;
  }

  /**
   * Get pending rewards for a CL gauge NFT position (Hybra V4 style).
   */
  async getPendingRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    return await client.readContract({
      address: gauge,
      abi: gaugeAbi,
      functionName: "earned",
      args: [tokenId],
    }) as bigint;
  }

  // IVoteEscrow

  async buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: veAbi,
      functionName: "create_lock",
      args: [amount, BigInt(lockDuration)],
    });
    return {
      description: `[${this.protocolName}] Create veNFT lock: ${amount} tokens for ${lockDuration}s`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: veAbi,
      functionName: "increase_amount",
      args: [tokenId, amount],
    });
    return {
      description: `[${this.protocolName}] Increase veNFT #${tokenId} by ${amount}`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: veAbi,
      functionName: "increase_unlock_time",
      args: [tokenId, BigInt(lockDuration)],
    });
    return {
      description: `[${this.protocolName}] Extend veNFT #${tokenId} lock by ${lockDuration}s`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: veAbi,
      functionName: "withdraw",
      args: [tokenId],
    });
    return {
      description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  // IVoter

  async buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: voterAbi,
      functionName: "vote",
      args: [tokenId, pools, weights],
    });
    return {
      description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 500_000,
    };
  }

  async buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx> {
    // claimBribes needs token arrays per bribe contract — simplified version
    const tokensPerBribe: Address[][] = bribes.map(() => []);
    const data = encodeFunctionData({
      abi: voterAbi,
      functionName: "claimBribes",
      args: [bribes, tokensPerBribe, tokenId],
    });
    return {
      description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx> {
    const tokensPerFee: Address[][] = fees.map(() => []);
    const data = encodeFunctionData({
      abi: voterAbi,
      functionName: "claimFees",
      args: [fees, tokensPerFee, tokenId],
    });
    return {
      description: `[${this.protocolName}] Claim trading fees for veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }
}
