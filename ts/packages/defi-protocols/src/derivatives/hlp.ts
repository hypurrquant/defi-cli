import { parseAbi, encodeFunctionData } from "viem";
import type { IDerivatives } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type DerivativesPositionParams,
  type DeFiTx,
} from "@hypurrquant/defi-core";
import type { Address } from "viem";

const HLP_ABI = parseAbi([
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)",
]);

export class HlpVaultAdapter implements IDerivatives {
  private readonly protocolName: string;
  private readonly vault: Address;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError.contractError("Missing 'vault' contract");
    this.vault = vault;
  }

  name(): string {
    return this.protocolName;
  }

  async buildOpenPosition(params: DerivativesPositionParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: HLP_ABI,
      functionName: "deposit",
      args: [params.collateral],
    });
    return {
      description: `[${this.protocolName}] Deposit ${params.collateral} into HLP vault`,
      to: this.vault,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async buildClosePosition(params: DerivativesPositionParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: HLP_ABI,
      functionName: "withdraw",
      args: [params.size],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.size} from HLP vault`,
      to: this.vault,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }
}
