import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import type { IVault } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type VaultInfo,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const ERC4626_ABI = parseAbi([
  "function asset() external view returns (address)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)",
]);

export class ERC4626VaultAdapter implements IVault {
  private readonly protocolName: string;
  private readonly vaultAddress: Address;
  private readonly rpcUrl?: string;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError.contractError("Missing 'vault' contract address");
    this.vaultAddress = vault;
  }

  name(): string {
    return this.protocolName;
  }

  async buildDeposit(assets: bigint, receiver: Address): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: ERC4626_ABI,
      functionName: "deposit",
      args: [assets, receiver],
    });
    return {
      description: `[${this.protocolName}] Deposit ${assets} assets into vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async buildWithdraw(assets: bigint, receiver: Address, owner: Address): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi: ERC4626_ABI,
      functionName: "withdraw",
      args: [assets, receiver, owner],
    });
    return {
      description: `[${this.protocolName}] Withdraw ${assets} assets from vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async totalAssets(): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets",
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
    }) as Promise<bigint>;
  }

  async convertToShares(assets: bigint): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] convertToShares failed: ${e}`);
    }) as Promise<bigint>;
  }

  async convertToAssets(shares: bigint): Promise<bigint> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares],
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] convertToAssets failed: ${e}`);
    }) as Promise<bigint>;
  }

  async getVaultInfo(): Promise<VaultInfo> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const [totalAssets, totalSupply, asset] = await Promise.all([
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalAssets" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`); }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalSupply" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`); }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "asset" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] asset failed: ${e}`); }),
    ]);

    return {
      protocol: this.protocolName,
      vault_address: this.vaultAddress,
      asset: asset as Address,
      total_assets: totalAssets as bigint,
      total_supply: totalSupply as bigint,
    };
  }
}
