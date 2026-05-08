import { createPublicClient, http, type Chain, type PublicClient } from "viem";

const providerCache = new Map<string, PublicClient>();

/**
 * SSOT 7.4: when a `chain` is passed, the public client is anchored to that
 * chainId at construction time. The cache key includes the chainId so two
 * callers with the same RPC but different anchors don't collide.
 */
export function getProvider(rpcUrl: string, chain?: Chain): PublicClient {
  const key = chain ? `${rpcUrl}@${chain.id}` : rpcUrl;
  const cached = providerCache.get(key);
  if (cached) return cached;

  const client = createPublicClient({
    transport: http(rpcUrl),
    ...(chain ? { chain } : {}),
  });
  providerCache.set(key, client);
  return client;
}

export function clearProviderCache(): void {
  providerCache.clear();
}
