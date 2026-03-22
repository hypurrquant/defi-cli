import type { IOptions } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type OptionParams,
  type DeFiTx,
} from "@hypurrquant/defi-core";

export class GenericOptionsAdapter implements IOptions {
  private readonly protocolName: string;
  private readonly interfaceName: string;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }

  name(): string {
    return this.protocolName;
  }

  async buildBuy(_params: OptionParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`,
    );
  }

  async buildSell(_params: OptionParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. ` +
      `Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`,
    );
  }
}
