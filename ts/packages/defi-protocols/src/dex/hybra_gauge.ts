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

const gaugeManagerAbi = parseAbi([
  "function gauges(address pool) view returns (address gauge)",
  "function isGauge(address gauge) view returns (bool)",
  "function isAlive(address gauge) view returns (bool)",
  "function claimRewards(address gauge, uint256[] tokenIds, uint8 redeemType) external",
]);

const gaugeCLAbi = parseAbi([
  "function deposit(uint256 tokenId) external",
  "function withdraw(uint256 tokenId, uint8 redeemType) external",
  "function earned(uint256 tokenId) view returns (uint256)",
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function rewardToken() view returns (address)",
]);

const nfpmAbi = parseAbi([
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view returns (address)",
]);

const veAbi = parseAbi([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external",
]);

const voterAbi = parseAbi([
  "function vote(uint256 tokenId, address[] pools, uint256[] weights) external",
  "function claimBribes(address[] bribes, address[][] tokens, uint256 tokenId) external",
  "function claimFees(address[] fees, address[][] tokens, uint256 tokenId) external",
]);

/**
 * Hybra ve(3,3) Gauge adapter using GaugeManager pattern.
 * CL gauges require NFT deposit and claim goes through GaugeManager (not directly to gauge).
 */
export class HybraGaugeAdapter implements IGaugeSystem {
  private readonly protocolName: string;
  private readonly gaugeManager: Address;
  private readonly veToken: Address;
  private readonly voter: Address;
  private readonly positionManager: Address;
  private readonly poolFactory: Address | undefined;
  private readonly rpcUrl: string | undefined;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const gm = entry.contracts?.["gauge_manager"];
    if (!gm) throw new DefiError("CONTRACT_ERROR", "Missing 'gauge_manager' contract");
    this.gaugeManager = gm;
    const ve = entry.contracts?.["ve_token"];
    if (!ve) throw new DefiError("CONTRACT_ERROR", "Missing 've_token' contract");
    this.veToken = ve;
    this.voter = entry.contracts?.["voter"] ?? zeroAddress as Address;
    this.positionManager = entry.contracts?.["position_manager"] ?? zeroAddress as Address;
    this.poolFactory = entry.contracts?.["pool_factory"];
    this.rpcUrl = rpcUrl;
  }

  name(): string { return this.protocolName; }

  // ─── Gauge Discovery ──────────────────────────────────────

  async discoverGaugedPools(): Promise<GaugedPool[]> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required for gauge discovery");
    if (!this.poolFactory) throw new DefiError("CONTRACT_ERROR", "Missing 'pool_factory' contract");

    const factoryAbi = parseAbi([
      "function allPoolsLength() external view returns (uint256)",
      "function allPools(uint256) external view returns (address)",
    ]);
    const poolAbi = parseAbi([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
    ]);
    const erc20SymbolAbi = parseAbi(["function symbol() external view returns (string)"]);
    const gaugesAbi = parseAbi(["function gauges(address pool) view returns (address gauge)"]);

    // Step 1: get total pool count
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    let poolCount: bigint;
    try {
      poolCount = await client.readContract({
        address: this.poolFactory,
        abi: factoryAbi,
        functionName: "allPoolsLength",
      }) as bigint;
    } catch {
      return [];
    }

    const count = Number(poolCount);
    if (count === 0) return [];

    // Step 2: batch-fetch all pool addresses
    const poolAddressCalls: Array<[Address, Hex]> = [];
    for (let i = 0; i < count; i++) {
      poolAddressCalls.push([
        this.poolFactory,
        encodeFunctionData({ abi: factoryAbi, functionName: "allPools", args: [BigInt(i)] }),
      ]);
    }
    const poolAddressResults = await multicallRead(this.rpcUrl, poolAddressCalls);
    const pools: Address[] = poolAddressResults
      .map((r) => decodeAddress(r))
      .filter((a): a is Address => a !== null && a !== zeroAddress);

    if (pools.length === 0) return [];

    // Step 3: batch GaugeManager.gauges(pool) for all pools
    const gaugeCalls: Array<[Address, Hex]> = pools.map((pool) => [
      this.gaugeManager,
      encodeFunctionData({ abi: gaugesAbi, functionName: "gauges", args: [pool] }),
    ]);
    const gaugeResults = await multicallRead(this.rpcUrl, gaugeCalls);

    // Filter pools that have an active gauge
    const gaugedPools: Array<{ pool: Address; gauge: Address }> = [];
    for (let i = 0; i < pools.length; i++) {
      const gauge = decodeAddress(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress) {
        gaugedPools.push({ pool: pools[i]!, gauge });
      }
    }

    if (gaugedPools.length === 0) return [];

    // Step 4: batch token0() and token1() for gauged pools
    const tokenCalls: Array<[Address, Hex]> = [];
    for (const { pool } of gaugedPools) {
      tokenCalls.push([pool, encodeFunctionData({ abi: poolAbi, functionName: "token0" })]);
      tokenCalls.push([pool, encodeFunctionData({ abi: poolAbi, functionName: "token1" })]);
    }
    const tokenResults = await multicallRead(this.rpcUrl, tokenCalls);

    // Step 5: collect unique token addresses and fetch symbols
    const tokenAddrs = new Set<Address>();
    for (let i = 0; i < gaugedPools.length; i++) {
      const t0 = decodeAddress(tokenResults[i * 2] ?? null);
      const t1 = decodeAddress(tokenResults[i * 2 + 1] ?? null);
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
    const out: GaugedPool[] = [];
    for (let i = 0; i < gaugedPools.length; i++) {
      const { pool, gauge } = gaugedPools[i]!;
      const t0 = decodeAddress(tokenResults[i * 2] ?? null);
      const t1 = decodeAddress(tokenResults[i * 2 + 1] ?? null);
      out.push({
        pool,
        gauge,
        token0: t0 ? (symbolMap.get(t0) ?? t0.slice(0, 10)) : "?",
        token1: t1 ? (symbolMap.get(t1) ?? t1.slice(0, 10)) : "?",
        type: "CL",
      });
    }

    return out;
  }

  // ─── Gauge Lookup ──────────────────────────────────────────

  async resolveGauge(pool: Address): Promise<Address> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC required");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const gauge = await client.readContract({
      address: this.gaugeManager, abi: gaugeManagerAbi,
      functionName: "gauges", args: [pool],
    }) as Address;
    if (gauge === zeroAddress) throw new DefiError("CONTRACT_ERROR", `No gauge for pool ${pool}`);
    return gauge;
  }

  // ─── CL Gauge: NFT Deposit/Withdraw ──────────────────────────

  async buildDeposit(gauge: Address, _amount: bigint, tokenId?: bigint): Promise<DeFiTx> {
    if (tokenId === undefined) throw new DefiError("CONTRACT_ERROR", "tokenId required for CL gauge deposit");

    // Pre-tx: approve NFT to gauge
    const approveTx: DeFiTx = {
      description: `[${this.protocolName}] Approve NFT #${tokenId} to gauge`,
      to: this.positionManager,
      data: encodeFunctionData({ abi: nfpmAbi, functionName: "approve", args: [gauge, tokenId] }),
      value: 0n, gas_estimate: 80_000,
    };

    return {
      description: `[${this.protocolName}] Deposit NFT #${tokenId} to gauge`,
      to: gauge,
      data: encodeFunctionData({ abi: gaugeCLAbi, functionName: "deposit", args: [tokenId] }),
      value: 0n, gas_estimate: 500_000,
      pre_txs: [approveTx],
    };
  }

  async buildWithdraw(gauge: Address, _amount: bigint, tokenId?: bigint): Promise<DeFiTx> {
    if (tokenId === undefined) throw new DefiError("CONTRACT_ERROR", "tokenId required for CL gauge withdraw");
    return {
      description: `[${this.protocolName}] Withdraw NFT #${tokenId} from gauge`,
      to: gauge,
      data: encodeFunctionData({ abi: gaugeCLAbi, functionName: "withdraw", args: [tokenId, 1] }),
      value: 0n, gas_estimate: 1_000_000,
    };
  }

  // ─── Claim: via GaugeManager ──────────────────────────────────

  async buildClaimRewards(gauge: Address, _account?: Address): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] Use buildClaimRewardsByTokenId for CL gauges`);
  }

  async buildClaimRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Claim rewards for NFT #${tokenId}`,
      to: this.gaugeManager,
      data: encodeFunctionData({
        abi: gaugeManagerAbi, functionName: "claimRewards",
        args: [gauge, [tokenId], 1], // redeemType=1
      }),
      value: 0n, gas_estimate: 1_000_000,
    };
  }

  // ─── Pending Rewards ──────────────────────────────────────────

  async getPendingRewards(gauge: Address, _user: Address): Promise<RewardInfo[]> {
    throw DefiError.unsupported(`[${this.protocolName}] Use getPendingRewardsByTokenId for CL gauges`);
  }

  async getPendingRewardsByTokenId(gauge: Address, tokenId: bigint): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC required");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    return await client.readContract({
      address: gauge, abi: gaugeCLAbi,
      functionName: "earned", args: [tokenId],
    }) as bigint;
  }

  // ─── VoteEscrow ──────────────────────────────────────────────

  async buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Create veNFT lock`,
      to: this.veToken,
      data: encodeFunctionData({ abi: veAbi, functionName: "create_lock", args: [amount, BigInt(lockDuration)] }),
      value: 0n, gas_estimate: 300_000,
    };
  }

  async buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Increase veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData({ abi: veAbi, functionName: "increase_amount", args: [tokenId, amount] }),
      value: 0n, gas_estimate: 200_000,
    };
  }

  async buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Extend veNFT #${tokenId} lock`,
      to: this.veToken,
      data: encodeFunctionData({ abi: veAbi, functionName: "increase_unlock_time", args: [tokenId, BigInt(lockDuration)] }),
      value: 0n, gas_estimate: 200_000,
    };
  }

  async buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData({ abi: veAbi, functionName: "withdraw", args: [tokenId] }),
      value: 0n, gas_estimate: 200_000,
    };
  }

  // ─── Voter ──────────────────────────────────────────────────

  async buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx> {
    return {
      description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData({ abi: voterAbi, functionName: "vote", args: [tokenId, pools, weights] }),
      value: 0n, gas_estimate: 500_000,
    };
  }

  async buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx> {
    const tokensPerBribe: Address[][] = bribes.map(() => []);
    return {
      description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData({ abi: voterAbi, functionName: "claimBribes", args: [bribes, tokensPerBribe, tokenId] }),
      value: 0n, gas_estimate: 300_000,
    };
  }

  async buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx> {
    const tokensPerFee: Address[][] = fees.map(() => []);
    return {
      description: `[${this.protocolName}] Claim fees for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData({ abi: voterAbi, functionName: "claimFees", args: [fees, tokensPerFee, tokenId] }),
      value: 0n, gas_estimate: 300_000,
    };
  }
}
