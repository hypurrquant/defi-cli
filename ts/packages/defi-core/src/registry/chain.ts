export class ChainConfig {
  name!: string;
  chain_id!: number;
  rpc_url!: string;
  explorer_url?: string;
  native_token!: string;
  wrapped_native?: string;
  multicall3?: string;

  effectiveRpcUrl(): string {
    const chainEnv = this.name.toUpperCase().replace(/ /g, "_") + "_RPC_URL";
    return (
      process.env[chainEnv] ??
      process.env["HYPEREVM_RPC_URL"] ??
      this.rpc_url
    );
  }
}
