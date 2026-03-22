import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { createPublicClient, http } from "viem";

interface ContractStatus {
  name: string;
  address: string;
  has_code?: boolean;
  status?: string;
}

interface ProtocolStatus {
  slug: string;
  name: string;
  category: string;
  interface: string;
  contracts: ContractStatus[];
}

interface StatusSummary {
  total_protocols: number;
  verified_contracts?: number;
  invalid_contracts?: number;
  placeholder_contracts?: number;
}

interface StatusOutput {
  chain: string;
  chain_id: number;
  rpc_url: string;
  block_number?: number;
  protocols: ProtocolStatus[];
  summary: StatusSummary;
}

function isPlaceholder(addr: string): boolean {
  if (!addr.startsWith("0x") || addr.length !== 42) return false;
  const hex = addr.slice(2).toLowerCase();
  return hex.slice(0, 36).split("").every((c) => c === "0") && parseInt(hex.slice(36), 16) <= 0x10;
}

export function registerStatus(
  parent: Command,
  getOpts: () => OutputMode,
): void {
  parent
    .command("status")
    .description("Show chain and protocol status")
    .option("--verify", "Verify contract addresses on-chain")
    .action(async (opts) => {
      const globalOpts = parent.opts<{ chain?: string }>();
      const chainName = globalOpts.chain ?? "hyperevm";

      const registry = Registry.loadEmbedded();
      const chainConfig = registry.getChain(chainName);
      const chainProtocols = registry.getProtocolsForChain(chainName);

      let blockNumber: number | undefined;
      let codeMap: Map<string, boolean> | undefined;
      let placeholderCount = 0;

      // Count placeholders
      for (const p of chainProtocols) {
        for (const addr of Object.values(p.contracts ?? {}) as string[]) {
          if (isPlaceholder(addr)) placeholderCount++;
        }
      }

      if (opts.verify) {
        const rpcUrl = chainConfig.effectiveRpcUrl();
        const client = createPublicClient({ transport: http(rpcUrl) });

        try {
          const bn = await client.getBlockNumber();
          blockNumber = Number(bn);
          process.stderr.write(
            `Connected to ${rpcUrl} (block #${blockNumber}). Verifying contracts...\n`,
          );
        } catch (e) {
          process.stderr.write(`Warning: could not get block number\n`);
        }

        codeMap = new Map();
        const allAddrs: Array<{ key: string; addr: Address }> = [];

        for (const p of chainProtocols) {
          for (const [name, addr] of Object.entries(p.contracts ?? {}) as [string, string][]) {
            if (!isPlaceholder(addr)) {
              allAddrs.push({ key: `${p.name}:${name}`, addr: addr as Address });
            }
          }
        }

        // Batch verify in chunks of 20
        for (let i = 0; i < allAddrs.length; i += 20) {
          const chunk = allAddrs.slice(i, i + 20);
          const results = await Promise.all(
            chunk.map(async ({ key, addr }) => {
              try {
                const code = await client.getCode({ address: addr as `0x${string}` });
                return { key, hasCode: !!code && code !== "0x" };
              } catch {
                return { key, hasCode: false };
              }
            }),
          );
          for (const r of results) {
            codeMap.set(r.key, r.hasCode);
          }
        }
      }

      // Build output
      let verifiedCount = 0;
      let invalidCount = 0;

      const protocols: ProtocolStatus[] = chainProtocols.map((p) => {
        const contracts: ContractStatus[] = (Object.entries(p.contracts ?? {}) as [string, string][]).map(
          ([name, addr]) => {
            if (isPlaceholder(addr)) {
              return { name, address: addr, status: "placeholder" };
            }
            if (codeMap) {
              const hasCode = codeMap.get(`${p.name}:${name}`) ?? false;
              if (hasCode) verifiedCount++;
              else invalidCount++;
              return {
                name,
                address: addr,
                has_code: hasCode,
                status: hasCode ? "verified" : "NO_CODE",
              };
            }
            return { name, address: addr };
          },
        );

        return {
          slug: p.slug,
          name: p.name,
          category: p.category,
          interface: p.interface,
          contracts,
        };
      });

      const output: StatusOutput = {
        chain: chainConfig.name,
        chain_id: chainConfig.chain_id,
        rpc_url: chainConfig.effectiveRpcUrl(),
        ...(blockNumber !== undefined ? { block_number: blockNumber } : {}),
        protocols,
        summary: {
          total_protocols: protocols.length,
          ...(opts.verify
            ? {
                verified_contracts: verifiedCount,
                invalid_contracts: invalidCount,
                placeholder_contracts: placeholderCount,
              }
            : {}),
        },
      };

      printOutput(output, getOpts());
    });
}
