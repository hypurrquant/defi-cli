import { createPublicClient, http, parseAbi } from "viem";
import type { Address } from "viem";
import type { IOracle } from "@hypurrquant/defi-core";
import { DefiError, type ProtocolEntry, type PriceData } from "@hypurrquant/defi-core";

const ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)",
]);

export class AaveOracleAdapter implements IOracle {
  private readonly protocolName: string;
  private readonly oracle: Address;
  private readonly rpcUrl: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const oracle = entry.contracts?.["oracle"];
    if (!oracle) throw DefiError.contractError(`[${entry.name}] Missing 'oracle' contract address`);
    this.oracle = oracle;
  }

  name(): string {
    return this.protocolName;
  }

  async getPrice(asset: Address): Promise<PriceData> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "BASE_CURRENCY_UNIT",
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });

    const priceVal = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "getAssetPrice",
      args: [asset],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] getAssetPrice failed: ${e}`);
    });

    const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
    const priceUsd = baseUnit > 0n
      ? (priceVal * (10n ** 18n)) / baseUnit
      : 0n;

    return {
      source: `${this.protocolName} Oracle`,
      source_type: "oracle",
      asset,
      price_usd: priceUsd,
      price_f64: priceF64,
    };
  }

  async getPrices(assets: Address[]): Promise<PriceData[]> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "BASE_CURRENCY_UNIT",
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });

    const rawPrices = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "getAssetsPrices",
      args: [assets],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] getAssetsPrices failed: ${e}`);
    });

    return (rawPrices as bigint[]).map((priceVal, i) => {
      const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
      const priceUsd = baseUnit > 0n ? (priceVal * (10n ** 18n)) / baseUnit : 0n;
      return {
        source: `${this.protocolName} Oracle`,
        source_type: "oracle",
        asset: assets[i]!,
        price_usd: priceUsd,
        price_f64: priceF64,
      };
    });
  }
}
