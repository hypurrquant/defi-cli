import type { Command } from "commander";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { Registry, ProtocolCategory, multicallRead } from "@hypurrquant/defi-core";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function decodeU256(data: Hex | null, wordOffset = 0): bigint {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}

function getExplorerApi(chainId: number, explorerUrl?: string): { base: string; apiKey?: string } | null {
  // routescan (free, no key)
  const routescanChains = [1, 43114, 10, 5000];
  if (routescanChains.includes(chainId)) {
    return {
      base: `https://api.routescan.io/v2/network/mainnet/evm/${chainId}/etherscan/api`,
    };
  }

  // Etherscan V2 unified API
  const apiKey = process.env["ETHERSCAN_API_KEY"];
  if (apiKey) {
    return {
      base: `https://api.etherscan.io/v2/api?chainid=${chainId}`,
      apiKey,
    };
  }

  return null;
}

export function registerWhales(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("whales")
    .description("Find top token holders (whales) and their positions")
    .requiredOption("--token <token>", "Token symbol or address")
    .option("--top <n>", "Number of top holders to show", "10")
    .option("--positions", "Also scan each whale's lending positions")
    .action(async (opts: { token: string; top: string; positions?: boolean }) => {
      const mode = getOpts();
      const registry = Registry.loadEmbedded();
      const chainName = (parent.opts<{ chain?: string }>().chain ?? "hyperevm").toLowerCase();

      let chain;
      try {
        chain = registry.getChain(chainName);
      } catch {
        printOutput({ error: `Chain not found: ${chainName}` }, mode);
        return;
      }

      const rpc = chain.effectiveRpcUrl();
      const top = parseInt(opts.top, 10) || 10;

      // Resolve token
      let token;
      try {
        token = registry.resolveToken(chainName, opts.token);
      } catch {
        printOutput({ error: `Token not found: ${opts.token}` }, mode);
        return;
      }

      // Get explorer API
      const explorerApi = getExplorerApi(chain.chain_id, chain.explorer_url);
      if (!explorerApi) {
        printOutput(
          {
            error: `No explorer API available for ${chain.name} (chain_id: ${chain.chain_id}). Set ETHERSCAN_API_KEY to enable.`,
          },
          mode,
        );
        return;
      }

      // Build URL
      const tokenAddr = token.address;
      let url = `${explorerApi.base}?module=token&action=tokenholderlist&contractaddress=${tokenAddr}&page=1&offset=${top}`;
      if (explorerApi.apiKey) {
        url += `&apikey=${explorerApi.apiKey}`;
      }

      // Fetch top holders
      let body: { status?: string; result?: unknown };
      try {
        const resp = await fetch(url);
        body = (await resp.json()) as { status?: string; result?: unknown };
      } catch (e) {
        printOutput({ error: `Explorer API request failed: ${e instanceof Error ? e.message : String(e)}` }, mode);
        return;
      }

      if (body.status !== "1") {
        const msg = typeof body.result === "string" ? body.result : "Unknown error";
        if (msg.includes("API Key") || msg.includes("apikey")) {
          printOutput(
            { error: "Explorer API requires API key. Set ETHERSCAN_API_KEY environment variable." },
            mode,
          );
          return;
        }
        printOutput({ error: `Explorer API error: ${msg}` }, mode);
        return;
      }

      const holders = Array.isArray(body.result) ? body.result : [];

      // Parse holders
      const whaleList: Array<{ address: Address; balance: number }> = [];
      for (const h of holders) {
        const addrStr: string = h["TokenHolderAddress"] ?? "";
        const qtyStr: string = h["TokenHolderQuantity"] ?? "0";
        if (/^0x[0-9a-fA-F]{40}$/.test(addrStr)) {
          const raw = BigInt(qtyStr || "0");
          const balance = Number(raw) / 10 ** token.decimals;
          whaleList.push({ address: addrStr as Address, balance });
        }
      }

      const whaleData: unknown[] = [];

      if (opts.positions && whaleList.length > 0) {
        // Get lending pools
        const lendingPools = registry
          .getProtocolsForChain(chainName)
          .filter(
            (p) =>
              p.category === ProtocolCategory.Lending &&
              (p.interface === "aave_v3" || p.interface === "aave_v2"),
          )
          .filter((p) => p.contracts?.["pool"])
          .map((p) => ({
            name: p.name,
            pool: p.contracts!["pool"] as Address,
            iface: p.interface,
          }));

        // Build multicall: each whale × each pool
        const calls: Array<[Address, Hex]> = [];
        for (const whale of whaleList) {
          for (const { pool } of lendingPools) {
            calls.push([
              pool,
              encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [whale.address] }),
            ]);
          }
        }

        let results: (Hex | null)[] = [];
        if (calls.length > 0) {
          try {
            results = await multicallRead(rpc, calls);
          } catch {
            results = [];
          }
        }

        const poolsPerWhale = lendingPools.length;

        for (let wi = 0; wi < whaleList.length; wi++) {
          const whale = whaleList[wi]!;
          const positions: unknown[] = [];

          for (let pi = 0; pi < lendingPools.length; pi++) {
            const { name: protoName, iface } = lendingPools[pi]!;
            const idx = wi * poolsPerWhale + pi;
            const data = results[idx] ?? null;

            if (data && data.length >= 2 + 192 * 2) {
              const dec = iface === "aave_v2" ? 18 : 8;
              const divisor = 10 ** dec;
              const collateral = Number(decodeU256(data, 0)) / divisor;
              const debt = Number(decodeU256(data, 1)) / divisor;
              const hfRaw = decodeU256(data, 5);
              let hf: number | null = null;
              if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
                const v = Number(hfRaw) / 1e18;
                hf = v > 1e10 ? null : round2(v);
              }

              if (collateral > 0.01 || debt > 0.01) {
                positions.push({
                  protocol: protoName,
                  collateral_usd: round2(collateral),
                  debt_usd: round2(debt),
                  health_factor: hf,
                });
              }
            }
          }

          whaleData.push({
            rank: wi + 1,
            address: whale.address,
            balance: round4(whale.balance),
            positions,
          });
        }
      } else {
        for (let wi = 0; wi < whaleList.length; wi++) {
          const whale = whaleList[wi]!;
          whaleData.push({
            rank: wi + 1,
            address: whale.address,
            balance: round4(whale.balance),
          });
        }
      }

      printOutput(
        {
          chain: chain.name,
          token: opts.token,
          token_address: tokenAddr,
          decimals: token.decimals,
          top,
          holders: whaleData,
          explorer: chain.explorer_url ?? "",
        },
        mode,
      );
    });
}
