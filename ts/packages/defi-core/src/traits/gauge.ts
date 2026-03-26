import type { Address } from "viem";
import type { DeFiTx, GaugedPool, RewardInfo } from "../types.js";

/** ve(3,3) Gauge operations — stake LP tokens to earn emissions */
export interface IGauge {
  name(): string;
  /** Resolve gauge address from pool address via voter */
  resolveGauge?(pool: Address): Promise<Address>;
  /** Deposit LP tokens into gauge */
  buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
  /** Withdraw LP tokens or NFT from gauge */
  buildWithdraw(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx>;
  /** Claim earned rewards from gauge */
  buildClaimRewards(gauge: Address, account?: Address): Promise<DeFiTx>;
  /** Claim rewards for a CL gauge NFT position (Hybra V4 style) */
  buildClaimRewardsByTokenId?(gauge: Address, tokenId: bigint): Promise<DeFiTx>;
  /** Get pending rewards for a user */
  getPendingRewards(gauge: Address, user: Address): Promise<RewardInfo[]>;
  /** Get pending rewards for a CL gauge NFT position */
  getPendingRewardsByTokenId?(gauge: Address, tokenId: bigint): Promise<bigint>;
  /** Discover all pools that have active emission gauges */
  discoverGaugedPools?(): Promise<GaugedPool[]>;
}

/** ve(3,3) Vote-escrow operations — lock tokens for veNFT */
export interface IVoteEscrow {
  name(): string;
  /** Create a new veNFT lock */
  buildCreateLock(amount: bigint, lockDuration: number): Promise<DeFiTx>;
  /** Increase lock amount */
  buildIncreaseAmount(tokenId: bigint, amount: bigint): Promise<DeFiTx>;
  /** Increase lock duration */
  buildIncreaseUnlockTime(tokenId: bigint, lockDuration: number): Promise<DeFiTx>;
  /** Withdraw after lock expires */
  buildWithdrawExpired(tokenId: bigint): Promise<DeFiTx>;
}

/** ve(3,3) Voter operations — vote on gauge emissions */
export interface IVoter {
  name(): string;
  /** Vote for gauges with veNFT */
  buildVote(tokenId: bigint, pools: Address[], weights: bigint[]): Promise<DeFiTx>;
  /** Claim bribes for voted pools */
  buildClaimBribes(bribes: Address[], tokenId: bigint): Promise<DeFiTx>;
  /** Claim trading fees */
  buildClaimFees(fees: Address[], tokenId: bigint): Promise<DeFiTx>;
}

/** Combined ve(3,3) system — gauge staking + vote-escrow + voter */
export interface IGaugeSystem extends IGauge, IVoteEscrow, IVoter {}
