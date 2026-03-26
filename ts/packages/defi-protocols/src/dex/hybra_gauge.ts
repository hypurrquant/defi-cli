import { createPublicClient, encodeFunctionData, http, parseAbi, zeroAddress } from "viem";
import type { Address } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
import type {
  IGaugeSystem,
  ProtocolEntry,
  RewardInfo,
  DeFiTx,
} from "@hypurrquant/defi-core";

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
    this.rpcUrl = rpcUrl;
  }

  name(): string { return this.protocolName; }

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
