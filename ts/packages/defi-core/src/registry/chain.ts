/**
 * Per-chain DEX aggregator slug map. Each entry is the chain identifier the
 * aggregator's API expects:
 *   - For per-chain-named aggregators (KyberSwap, OpenOcean, LiquidSwap), this is the
 *     chain slug (e.g., "ethereum", "bsc", "base").
 *   - For chainId-based aggregators (LI.FI, Relay), use "auto" — the adapter falls
 *     back to `chain_id` numeric.
 *   - Omit a key to mark the aggregator as unsupported on that chain.
 */
export interface AggregatorSlugs {
  kyber?: string;
  openocean?: string;
  liquid?: string;
  lifi?: string;
  relay?: string;
}

/**
 * Minimal viem-compatible Chain shape. We type it locally rather than
 * importing viem's Chain because defi-core is also consumed in browser /
 * MCP contexts that may not have viem in their dependency closure.
 */
export interface ViemChainShape {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: readonly [string] } };
  blockExplorers?: { default: { name: string; url: string } };
  contracts?: { multicall3?: { address: `0x${string}` } };
}

export class ChainConfig {
  name!: string;
  chain_id!: number;
  rpc_url!: string;
  explorer_url?: string;
  native_token!: string;
  wrapped_native?: string;
  multicall3?: string;
  aggregators?: AggregatorSlugs;

  effectiveRpcUrl(): string {
    // Resolve per-chain RPC: prefer chain-specific env var (HYPEREVM_RPC_URL,
    // MANTLE_RPC_URL, BASE_RPC_URL, BNB_RPC_URL, MONAD_RPC_URL), then the
    // bundled default from chains.toml. NEVER fall back to another chain's
    // RPC — calling Base via HYPEREVM_RPC_URL would route to the wrong chain.
    const chainEnv = this.name.toUpperCase().replace(/ /g, "_") + "_RPC_URL";
    return process.env[chainEnv] ?? this.rpc_url;
  }

  /**
   * Build a viem Chain object pinned to this config so wallet/public clients
   * can sign with an explicit chainId rather than auto-fetching it from the
   * RPC. SSOT 7.4: anchoring chainId at client-construction time defends
   * against an MITM RPC that returns the wrong eth_chainId, and keeps
   * offline signing safe against RPC drift.
   */
  viemChain(): ViemChainShape {
    const rpcUrl = this.effectiveRpcUrl();
    return {
      id: this.chain_id,
      name: this.name,
      nativeCurrency: {
        name: this.native_token,
        symbol: this.native_token,
        decimals: 18,
      },
      rpcUrls: { default: { http: [rpcUrl] as const } },
      ...(this.explorer_url
        ? { blockExplorers: { default: { name: this.name, url: this.explorer_url } } }
        : {}),
      ...(this.multicall3
        ? { contracts: { multicall3: { address: this.multicall3 as `0x${string}` } } }
        : {}),
    };
  }
}
