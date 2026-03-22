import { createPublicClient, http, parseAbi } from "viem";
import type { Address } from "viem";
import type { INft, NftCollectionInfo, NftTokenInfo } from "@hypurrquant/defi-core";
import { DefiError, type ProtocolEntry } from "@hypurrquant/defi-core";

const ERC721_ABI = parseAbi([
  "function name() returns (string)",
  "function symbol() returns (string)",
  "function totalSupply() returns (uint256)",
  "function ownerOf(uint256 tokenId) returns (address)",
  "function balanceOf(address owner) returns (uint256)",
  "function tokenURI(uint256 tokenId) returns (string)",
]);

export class ERC721Adapter implements INft {
  private readonly protocolName: string;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
  }

  name(): string {
    return this.protocolName;
  }

  async getCollectionInfo(collection: Address): Promise<NftCollectionInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const [collectionName, symbol, totalSupply] = await Promise.all([
      client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "name" })
        .catch((e: unknown) => {
          throw DefiError.rpcError(`[${this.protocolName}] name failed: ${e}`);
        }),
      client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "symbol" })
        .catch((e: unknown) => {
          throw DefiError.rpcError(`[${this.protocolName}] symbol failed: ${e}`);
        }),
      client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "totalSupply" })
        .catch(() => undefined),
    ]);

    return {
      address: collection,
      name: collectionName as string,
      symbol: symbol as string,
      total_supply: totalSupply as bigint | undefined,
    };
  }

  async getTokenInfo(collection: Address, tokenId: bigint): Promise<NftTokenInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const [owner, tokenUri] = await Promise.all([
      client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] })
        .catch((e: unknown) => {
          throw DefiError.rpcError(`[${this.protocolName}] ownerOf failed: ${e}`);
        }),
      client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "tokenURI", args: [tokenId] })
        .catch(() => undefined),
    ]);

    return {
      collection,
      token_id: tokenId,
      owner: owner as Address,
      token_uri: tokenUri as string | undefined,
    };
  }

  async getBalance(owner: Address, collection: Address): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    return client
      .readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] })
      .catch((e: unknown) => {
        throw DefiError.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
      }) as Promise<bigint>;
  }
}
