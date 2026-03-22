import type { Address } from "viem";
import type { IYieldSource } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type YieldInfo,
  type DeFiTx,
} from "@hypurrquant/defi-core";

export class PendleAdapter implements IYieldSource {
  private readonly protocolName: string;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    if (!entry.contracts?.["router"]) {
      throw DefiError.contractError("Missing 'router' contract");
    }
  }

  name(): string {
    return this.protocolName;
  }

  async getYields(): Promise<YieldInfo[]> {
    throw DefiError.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }

  async buildDeposit(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.`,
    );
  }

  async buildWithdraw(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Pendle withdraw requires market-specific params`,
    );
  }
}
