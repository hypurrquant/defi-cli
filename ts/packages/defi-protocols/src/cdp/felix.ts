import { createPublicClient, http, parseAbi, encodeFunctionData, zeroAddress } from "viem";
import type { Address } from "viem";
import type { ICdp } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type OpenCdpParams,
  type AdjustCdpParams,
  type CloseCdpParams,
  type CdpInfo,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const BORROWER_OPS_ABI = parseAbi([
  "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
  "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
  "function closeTrove(uint256 _troveId) external",
]);

const TROVE_MANAGER_ABI = parseAbi([
  "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)",
]);

const HINT_HELPERS_ABI = parseAbi([
  "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)",
]);

const SORTED_TROVES_ABI = parseAbi([
  "function findInsertPosition(uint256 _annualInterestRate, uint256 _prevId, uint256 _nextId) external view returns (uint256 prevId, uint256 nextId)",
]);

export class FelixCdpAdapter implements ICdp {
  private readonly protocolName: string;
  private readonly borrowerOperations: Address;
  private readonly troveManager?: Address;
  private readonly hintHelpers?: Address;
  private readonly sortedTroves?: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const bo = contracts["borrower_operations"];
    if (!bo) throw DefiError.contractError("Missing 'borrower_operations' contract");
    this.borrowerOperations = bo;
    this.troveManager = contracts["trove_manager"];
    this.hintHelpers = contracts["hint_helpers"];
    this.sortedTroves = contracts["sorted_troves"];
  }

  name(): string {
    return this.protocolName;
  }

  private async getHints(interestRate: bigint): Promise<[bigint, bigint]> {
    if (!this.hintHelpers || !this.sortedTroves || !this.rpcUrl) {
      return [0n, 0n];
    }
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const approxResult = await client.readContract({
      address: this.hintHelpers,
      abi: HINT_HELPERS_ABI,
      functionName: "getApproxHint",
      args: [0n, interestRate, 15n, 42n],
    }).catch(() => null);

    if (!approxResult) return [0n, 0n];
    const [hintId] = approxResult as [bigint, bigint, bigint];

    const insertResult = await client.readContract({
      address: this.sortedTroves,
      abi: SORTED_TROVES_ABI,
      functionName: "findInsertPosition",
      args: [interestRate, hintId, hintId],
    }).catch(() => null);

    if (!insertResult) return [0n, 0n];
    const [prevId, nextId] = insertResult as [bigint, bigint];
    return [prevId, nextId];
  }

  async buildOpen(params: OpenCdpParams): Promise<DeFiTx> {
    const interestRate = 50000000000000000n; // 5% default
    const [upperHint, lowerHint] = await this.getHints(interestRate);
    const hasHints = upperHint !== 0n || lowerHint !== 0n;

    const data = encodeFunctionData({
      abi: BORROWER_OPS_ABI,
      functionName: "openTrove",
      args: [
        params.recipient,
        0n,
        params.collateral_amount,
        params.debt_amount,
        upperHint,
        lowerHint,
        interestRate,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), // U256::MAX
        params.recipient,
        params.recipient,
        params.recipient,
      ],
    });

    return {
      description: `[${this.protocolName}] Open trove: collateral=${params.collateral_amount}, debt=${params.debt_amount} (hints=${hasHints ? "optimized" : "none"})`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: hasHints ? 500_000 : 5_000_000,
    };
  }

  async buildAdjust(params: AdjustCdpParams): Promise<DeFiTx> {
    const collChange = params.collateral_delta ?? 0n;
    const debtChange = params.debt_delta ?? 0n;

    const data = encodeFunctionData({
      abi: BORROWER_OPS_ABI,
      functionName: "adjustTrove",
      args: [
        params.cdp_id,
        collChange,
        params.add_collateral,
        debtChange,
        params.add_debt,
        0n,
        0n,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      ],
    });

    return {
      description: `[${this.protocolName}] Adjust trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 400_000,
    };
  }

  async buildClose(params: CloseCdpParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: BORROWER_OPS_ABI,
      functionName: "closeTrove",
      args: [params.cdp_id],
    });

    return {
      description: `[${this.protocolName}] Close trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async getCdpInfo(cdpId: bigint): Promise<CdpInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError(`[${this.protocolName}] getCdpInfo requires RPC — set HYPEREVM_RPC_URL`);
    if (!this.troveManager) throw DefiError.contractError(`[${this.protocolName}] trove_manager contract not configured`);

    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const data = await client.readContract({
      address: this.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getLatestTroveData",
      args: [cdpId],
    }).catch((e: unknown) => {
      throw DefiError.invalidParam(`[${this.protocolName}] Trove ${cdpId} not found: ${e}`);
    });

    const [entireDebt, entireColl] = data as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

    if (entireDebt === 0n && entireColl === 0n) {
      throw DefiError.invalidParam(`[${this.protocolName}] Trove ${cdpId} does not exist`);
    }

    const collRatio = entireDebt > 0n ? Number(entireColl) / Number(entireDebt) : 0;

    return {
      protocol: this.protocolName,
      cdp_id: cdpId,
      collateral: {
        token: zeroAddress as Address,
        symbol: "WHYPE",
        amount: entireColl,
        decimals: 18,
      },
      debt: {
        token: zeroAddress as Address,
        symbol: "feUSD",
        amount: entireDebt,
        decimals: 18,
      },
      collateral_ratio: collRatio,
    };
  }
}
