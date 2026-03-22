import { encodeFunctionData, parseAbi, zeroAddress } from "viem";
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
  "function getReward(address account) external",
  "function earned(address account) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
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
]);

export class SolidlyGaugeAdapter implements IGaugeSystem {
  private readonly protocolName: string;
  private readonly voter: Address;
  private readonly veToken: Address;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
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
  }

  name(): string {
    return this.protocolName;
  }

  // IGauge

  async buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx> {
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

  async buildClaimRewards(gauge: Address): Promise<DeFiTx> {
    // account param will be overridden by msg.sender in most gauge implementations
    const data = encodeFunctionData({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [zeroAddress],
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async getPendingRewards(_gauge: Address, _user: Address): Promise<RewardInfo[]> {
    throw DefiError.unsupported(`[${this.protocolName}] get_pending_rewards requires RPC`);
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
