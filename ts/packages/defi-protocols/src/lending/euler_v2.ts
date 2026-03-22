import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const EULER_VAULT_ABI = parseAbi([
  "function deposit(uint256 amount, address receiver) external returns (uint256)",
  "function withdraw(uint256 amount, address receiver, address owner) external returns (uint256)",
  "function borrow(uint256 amount, address receiver) external returns (uint256)",
  "function repay(uint256 amount, address receiver) external returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function interestRate() external view returns (uint256)",
]);

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

export class EulerV2Adapter implements ILending {
  private readonly protocolName: string;
  private readonly euler: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const euler = contracts["evk_vault"] ?? contracts["euler"] ?? contracts["markets"];
    if (!euler) throw DefiError.contractError("Missing 'evk_vault' or 'euler' contract address");
    this.euler = euler;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: EULER_VAULT_ABI,
      functionName: "deposit",
      args: [params.amount, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Deposit ${params.amount} into Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: EULER_VAULT_ABI,
      functionName: "borrow",
      args: [params.amount, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: EULER_VAULT_ABI,
      functionName: "repay",
      args: [params.amount, params.on_behalf_of],
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: EULER_VAULT_ABI,
      functionName: "withdraw",
      args: [params.amount, params.to, params.to],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const [totalSupply, totalBorrows, interestRate] = await Promise.all([
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalSupply" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`); }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalBorrows" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] totalBorrows failed: ${e}`); }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "interestRate" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] interestRate failed: ${e}`); }),
    ]);

    // Euler V2 interest rates per-second scaled by 1e27
    const rateF64 = Number(interestRate) / 1e27;
    const borrowApy = rateF64 * SECONDS_PER_YEAR * 100;

    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? (borrowF / supplyF) * 100 : 0;
    const supplyApy = borrowApy * (borrowF / Math.max(supplyF, 1));

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply as bigint,
      total_borrow: totalBorrows as bigint,
    };
  }

  async getUserPosition(_user: Address): Promise<UserPosition> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Euler V2 user positions require querying individual vault balances. Use the vault address directly to check balanceOf(user) for supply positions.`,
    );
  }
}
