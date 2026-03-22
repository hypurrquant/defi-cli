import { createPublicClient, http, type PublicClient } from "viem";

const providerCache = new Map<string, PublicClient>();

export function getProvider(rpcUrl: string): PublicClient {
  const cached = providerCache.get(rpcUrl);
  if (cached) return cached;

  const client = createPublicClient({ transport: http(rpcUrl) });
  providerCache.set(rpcUrl, client);
  return client;
}

export function clearProviderCache(): void {
  providerCache.clear();
}
