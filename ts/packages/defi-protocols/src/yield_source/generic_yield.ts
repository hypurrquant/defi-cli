import type { Address } from "viem";
import type { IYieldSource } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type YieldInfo,
  type DeFiTx,
} from "@hypurrquant/defi-core";

export class GenericYieldAdapter implements IYieldSource {
  private readonly protocolName: string;
  private readonly interfaceName: string;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }

  name(): string {
    return this.protocolName;
  }

  async getYields(): Promise<YieldInfo[]> {
    throw DefiError.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }

  async buildDeposit(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), ` +
      `Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.`,
    );
  }

  async buildWithdraw(_pool: string, _amount: bigint, _recipient: Address): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), ` +
      `Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.`,
    );
  }
}
