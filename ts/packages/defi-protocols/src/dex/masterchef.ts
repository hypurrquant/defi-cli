import { encodeFunctionData, parseAbi, createPublicClient, http } from "viem";
import type { Address } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
import type {
  IGauge,
  ProtocolEntry,
  RewardInfo,
  DeFiTx,
} from "@hypurrquant/defi-core";

const masterchefAbi = parseAbi([
  "function deposit(uint256 pid, uint256 amount) external",
  "function withdraw(uint256 pid, uint256 amount) external",
  "function claim(uint256[] calldata pids) external",
  "function pendingRewards(address account, uint256[] calldata pids) view returns (uint256[] memory moeRewards)",
  "function getNumberOfFarms() view returns (uint256)",
  "function getPidByPool(address pool) view returns (uint256)",
]);

export class MasterChefAdapter implements IGauge {
  private readonly protocolName: string;
  private readonly masterchef: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const masterchef = entry.contracts?.["masterchef"];
    if (!masterchef) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'masterchef' contract");
    }
    this.masterchef = masterchef;
    this.rpcUrl = rpcUrl;
  }

  name(): string {
    return this.protocolName;
  }

  /**
   * Deposit LP tokens into a MasterChef farm.
   * `gauge` is the pool address (unused for calldata — MasterChef is the target).
   * `tokenId` carries the farm pid.
   */
  async buildDeposit(gauge: Address, amount: bigint, tokenId?: bigint): Promise<DeFiTx> {
    const pid = tokenId ?? 0n;
    const data = encodeFunctionData({
      abi: masterchefAbi,
      functionName: "deposit",
      args: [pid, amount],
    });
    return {
      description: `[${this.protocolName}] Deposit ${amount} LP to farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /**
   * Withdraw LP tokens from a MasterChef farm.
   * `gauge` is used to look up the pid description only; call site should pass pid via tokenId
   * on the deposit flow. Here pid defaults to 0 — callers should encode the pid in the gauge
   * address slot or wrap this adapter with a pid-aware helper.
   */
  async buildWithdraw(gauge: Address, amount: bigint): Promise<DeFiTx> {
    // IGauge interface does not carry tokenId on withdraw; default pid=0.
    // Callers that need a specific pid should call buildWithdrawPid directly.
    const pid = 0n;
    const data = encodeFunctionData({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /** Withdraw LP tokens specifying a pid explicitly (MasterChef extension beyond IGauge). */
  async buildWithdrawPid(pid: bigint, amount: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /** Claim pending MOE rewards. IGauge interface provides no pid — defaults to pid=0. */
  async buildClaimRewards(gauge: Address): Promise<DeFiTx> {
    const pid = 0n;
    const data = encodeFunctionData({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]],
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /** Claim pending MOE rewards for a specific pid (MasterChef extension beyond IGauge). */
  async buildClaimRewardsPid(pid: bigint): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]],
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  /** Get pending MOE rewards for a user. Requires rpcUrl. */
  async getPendingRewards(_gauge: Address, user: Address): Promise<RewardInfo[]> {
    if (!this.rpcUrl) {
      throw DefiError.unsupported(`[${this.protocolName}] getPendingRewards requires RPC`);
    }
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const rewards = await client.readContract({
      address: this.masterchef,
      abi: masterchefAbi,
      functionName: "pendingRewards",
      args: [user, [0n]],
    });
    return (rewards as bigint[]).map((amount) => ({
      token: this.masterchef,
      symbol: "MOE",
      amount,
    }));
  }
}
