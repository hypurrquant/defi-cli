import { createPublicClient, encodeFunctionData, http, parseAbi, zeroAddress } from "viem";
import type { Address } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
import type {
  IGaugeSystem,
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

export class SolidlyGaugeAdapter implements IGaugeSystem {
  private readonly protocolName: string;
  private readonly voter: Address;
  private readonly veToken: Address;
  private readonly rpcUrl: string | undefined;

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
  }

  name(): string {
    return this.protocolName;
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
