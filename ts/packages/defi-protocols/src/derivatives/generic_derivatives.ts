import type { IDerivatives } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type DerivativesPositionParams,
  type DeFiTx,
} from "@hypurrquant/defi-core";

export class GenericDerivativesAdapter implements IDerivatives {
  private readonly protocolName: string;
  private readonly interfaceName: string;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }

  name(): string {
    return this.protocolName;
  }

  async buildOpenPosition(_params: DerivativesPositionParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`,
    );
  }

  async buildClosePosition(_params: DerivativesPositionParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`,
    );
  }
}
