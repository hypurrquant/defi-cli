import type { Command } from "commander";
import type { Address } from "viem";
import type { OutputMode } from "./output.js";
import { printOutput } from "./output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { ProtocolEntry, ChainConfig } from "@hypurrquant/defi-core";
import { resolveWalletWithSigner } from "./signer/resolve.js";

// ── Chain validation ──

/**
 * Get chain name from global --chain option, or null with error output if missing.
 * For commands that require a specific chain (transactions, single-chain queries).
 */
export function requireChain(parent: Command, getOpts: () => OutputMode): string | null {
  const chain = parent.opts<{ chain?: string }>().chain;
  if (!chain) {
    printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts());
    return null;
  }
  return chain.toLowerCase();
}

/**
 * Get chain name if explicitly passed, or all chain keys if not.
 * For commands that scan all chains by default (yield, status).
 */
export function getChainKeys(parent: Command, registry: Registry): string[] {
  const chain = parent.opts<{ chain?: string }>().chain;
  return chain ? [chain.toLowerCase()] : Array.from(registry.chains.keys());
}

// ── Context resolution ──

export interface CommandContext {
  chainName: string;
  registry: Registry;
  chain: ChainConfig;
  rpcUrl: string;
  protocol?: ProtocolEntry;
}

/**
 * Resolve chain + registry + optional protocol in one call.
 * Returns null (with error output) if --chain is missing.
 */
export function resolveContext(
  parent: Command,
  getOpts: () => OutputMode,
  protocolSlug?: string,
): CommandContext | null {
  const chainName = requireChain(parent, getOpts);
  if (!chainName) return null;
  const registry = Registry.loadEmbedded();
  const chain = registry.getChain(chainName);
  const protocol = protocolSlug ? registry.getProtocol(protocolSlug) : undefined;
  return { chainName, registry, chain, rpcUrl: chain.effectiveRpcUrl(), protocol };
}

// ── Token resolution ──

/**
 * Resolve token symbol or address to Address.
 */
export function resolveTokenAddress(registry: Registry, chainName: string, tokenOrAddress: string): Address {
  if (/^0x[0-9a-fA-F]{40}$/.test(tokenOrAddress)) return tokenOrAddress as Address;
  return registry.resolveToken(chainName, tokenOrAddress).address;
}

// ── Wallet address ──

const FALLBACK_ADDRESS = "0x0000000000000000000000000000000000000001" as Address;

/**
 * Resolve wallet address from explicit option, env var (including OWS), or fallback.
 */
export function resolveWallet(override?: string): Address {
  if (override) return override as Address;
  try {
    const { address } = resolveWalletWithSigner();
    return address;
  } catch {
    return FALLBACK_ADDRESS;
  }
}

// ── Error formatting ──

/**
 * Extract error message from unknown error.
 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Value parsing ──

/**
 * Parse a hex or decimal string to BigInt (for tx value fields).
 */
export function parseBigIntValue(v: string): bigint {
  return v.startsWith("0x") ? BigInt(v) : BigInt(v || 0);
}
