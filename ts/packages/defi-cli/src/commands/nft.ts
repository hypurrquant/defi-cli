import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import { createNft } from "@hypurrquant/defi-protocols";
import type { Address } from "viem";

export function registerNft(parent: Command, getOpts: () => OutputMode): void {
  const nft = parent.command("nft").description("NFT operations: collection info, ownership, balance");

  nft.command("info")
    .description("Get NFT collection info (name, symbol, total supply)")
    .requiredOption("--collection <address>", "NFT collection contract address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const nftProtocols = registry.getProtocolsByCategory("nft" as any).filter(p => p.chain === chainName);
      const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
      try {
        const adapter = createNft(entry, chain.effectiveRpcUrl());
        const info = await adapter.getCollectionInfo(opts.collection as Address);
        printOutput(info, getOpts());
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
      }
    });

  nft.command("owner")
    .description("Check who owns a specific NFT token ID")
    .requiredOption("--collection <address>", "NFT collection contract address")
    .requiredOption("--token-id <id>", "Token ID")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const nftProtocols = registry.getProtocolsByCategory("nft" as any).filter(p => p.chain === chainName);
      const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
      try {
        const adapter = createNft(entry, chain.effectiveRpcUrl());
        const info = await adapter.getTokenInfo(opts.collection as Address, BigInt(opts.tokenId));
        printOutput(info, getOpts());
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
      }
    });

  nft.command("balance")
    .description("Check how many NFTs an address holds in a collection")
    .requiredOption("--collection <address>", "NFT collection contract address")
    .requiredOption("--owner <address>", "Owner address to query")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const nftProtocols = registry.getProtocolsByCategory("nft" as any).filter(p => p.chain === chainName);
      const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
      try {
        const adapter = createNft(entry, chain.effectiveRpcUrl());
        const balance = await adapter.getBalance(opts.owner as Address, opts.collection as Address);
        printOutput({ collection: opts.collection, owner: opts.owner, balance }, getOpts());
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
      }
    });

  nft.command("uri")
    .description("Get token URI for a specific NFT")
    .requiredOption("--collection <address>", "NFT collection contract address")
    .requiredOption("--token-id <id>", "Token ID")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const nftProtocols = registry.getProtocolsByCategory("nft" as any).filter(p => p.chain === chainName);
      const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
      try {
        const adapter = createNft(entry, chain.effectiveRpcUrl());
        const info = await adapter.getTokenInfo(opts.collection as Address, BigInt(opts.tokenId));
        printOutput({ collection: opts.collection, token_id: opts.tokenId, token_uri: info.token_uri }, getOpts());
      } catch (e) {
        printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
      }
    });
}
