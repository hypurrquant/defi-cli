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
    const chainEnv = this.name.toUpperCase().replace(/ /g, "_") + "_RPC_URL";
    return (
      process.env[chainEnv] ??
      process.env["HYPEREVM_RPC_URL"] ??
      this.rpc_url
    );
  }
}
