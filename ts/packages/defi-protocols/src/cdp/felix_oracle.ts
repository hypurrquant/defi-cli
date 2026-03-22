import { createPublicClient, http, parseAbi } from "viem";
import type { Address } from "viem";
import type { IOracle } from "@hypurrquant/defi-core";
import { DefiError, type ProtocolEntry, type PriceData } from "@hypurrquant/defi-core";

const PRICE_FEED_ABI = parseAbi([
  "function fetchPrice() external view returns (uint256 price, bool isNewOracleFailureDetected)",
  "function lastGoodPrice() external view returns (uint256)",
]);

export class FelixOracleAdapter implements IOracle {
  private readonly protocolName: string;
  private readonly priceFeed: Address;
  private readonly asset: Address;
  private readonly rpcUrl: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const feed = contracts["price_feed"];
    if (!feed) throw DefiError.contractError(`[${entry.name}] Missing 'price_feed' contract address`);
    this.priceFeed = feed;
    // The asset address is stored under "asset" or falls back to zero (WHYPE native)
    this.asset = contracts["asset"] ?? ("0x0000000000000000000000000000000000000000" as Address);
  }

  name(): string {
    return this.protocolName;
  }

  async getPrice(asset: Address): Promise<PriceData> {
    if (asset !== this.asset && this.asset !== "0x0000000000000000000000000000000000000000") {
      throw DefiError.unsupported(`[${this.protocolName}] Felix PriceFeed only supports asset ${this.asset}`);
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });

    let priceVal: bigint;
    try {
      const result = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice",
      });
      const [price] = result as [bigint, boolean];
      priceVal = price;
    } catch {
      // Fall back to lastGoodPrice
      priceVal = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "lastGoodPrice",
      }).catch((e: unknown) => {
        throw DefiError.rpcError(`[${this.protocolName}] lastGoodPrice failed: ${e}`);
      }) as bigint;
    }

    // Felix prices are already in 18-decimal USD
    const priceF64 = Number(priceVal) / 1e18;

    return {
      source: "Felix PriceFeed",
      source_type: "oracle",
      asset,
      price_usd: priceVal,
      price_f64: priceF64,
    };
  }

  async getPrices(assets: Address[]): Promise<PriceData[]> {
    const results: PriceData[] = [];
    for (const asset of assets) {
      try {
        results.push(await this.getPrice(asset));
      } catch {
        // Skip unsupported assets
      }
    }
    return results;
  }
}
