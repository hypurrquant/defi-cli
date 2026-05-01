import pc from "picocolors";
import { encodeFunctionData, parseAbi, formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { Registry, multicallRead, decodeU256, MULTICALL3_ADDRESS } from "@hypurrquant/defi-core";
import type { TokenEntry } from "@hypurrquant/defi-core";

// Per-chain dashboard token list (ordered by importance)
const DASHBOARD_CHAINS: Array<{ slug: string; tokens: string[] }> = [
  { slug: "hyperevm", tokens: ["HYPE", "WHYPE", "USDC", "USDT0", "USDe", "kHYPE", "wstHYPE"] },
  { slug: "mantle",   tokens: ["MNT", "WMNT", "USDC", "USDT", "WETH", "mETH"] },
  { slug: "base",     tokens: ["ETH", "WETH", "USDC", "AERO"] },
  { slug: "bnb",      tokens: ["BNB", "WBNB", "USDT", "USDC", "BUSD", "CAKE"] },
  { slug: "monad",    tokens: ["MON", "WMON", "USDC", "USDT0", "WETH", "WBTC"] },
];

const balanceOfAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const getEthBalanceAbi = parseAbi([
  "function getEthBalance(address addr) view returns (uint256)",
]);

interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
}

async function fetchBalances(
  rpcUrl: string,
  wallet: Address,
  tokens: TokenEntry[],
): Promise<TokenBalance[]> {
  const calls: Array<[Address, Hex]> = tokens.map((t) => {
    const isNative = t.tags?.includes("native") || t.address === "0x0000000000000000000000000000000000000000";
    if (isNative) {
      return [
        MULTICALL3_ADDRESS,
        encodeFunctionData({ abi: getEthBalanceAbi, functionName: "getEthBalance", args: [wallet] }),
      ];
    }
    return [
      t.address,
      encodeFunctionData({ abi: balanceOfAbi, functionName: "balanceOf", args: [wallet] }),
    ];
  });

  let results: (Hex | null)[];
  try {
    results = await multicallRead(rpcUrl, calls);
  } catch {
    results = tokens.map(() => null);
  }

  return tokens.map((t, i) => {
    const raw = decodeU256(results[i]);
    const formatted = formatUnits(raw, t.decimals);
    const num = parseFloat(formatted);
    const display = num === 0 ? "0.00" : num >= 1000
      ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    return { symbol: t.symbol, balance: display, decimals: t.decimals };
  });
}

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function formatBalanceLine(sym: string, bal: string): string {
  const symPad = padRight(sym, 10);
  const balPad = padLeft(bal, 12);
  return `  ${symPad}${balPad}`;
}

interface ResolvedChain {
  slug: string;
  name: string;
  tokens: TokenEntry[];
  balances: TokenBalance[];
}

async function resolveChainBalances(registry: Registry, wallet: Address): Promise<ResolvedChain[]> {
  const chains = DASHBOARD_CHAINS.map(({ slug, tokens: order }) => {
    const chain = registry.getChain(slug);
    const allTokens = registry.tokens.get(slug) ?? [];
    const sorted = order
      .map(s => allTokens.find(t => t.symbol === s))
      .filter(Boolean) as TokenEntry[];
    return { slug, chain, tokens: sorted };
  });

  const balanceLists = await Promise.all(
    chains.map(({ chain, tokens }) =>
      fetchBalances(chain.effectiveRpcUrl(), wallet, tokens).catch(() =>
        tokens.map(t => ({ symbol: t.symbol, balance: "?", decimals: t.decimals })),
      ),
    ),
  );

  return chains.map((c, i) => ({
    slug: c.slug,
    name: c.chain.name,
    tokens: c.tokens,
    balances: balanceLists[i] ?? [],
  }));
}

export async function showLandingPage(isJson: boolean): Promise<void> {
  const registry = Registry.loadEmbedded();
  const wallet = process.env.DEFI_WALLET_ADDRESS as Address | undefined;

  if (isJson) {
    if (!wallet) {
      console.log(JSON.stringify({ error: "DEFI_WALLET_ADDRESS not set" }, null, 2));
      return;
    }
    const resolved = await resolveChainBalances(registry, wallet);
    const chains: Record<string, { name: string; balances: TokenBalance[] }> = {};
    for (const c of resolved) chains[c.slug] = { name: c.name, balances: c.balances };
    console.log(JSON.stringify({ wallet, chains }, null, 2));
    return;
  }

  const { createRequire } = await import("node:module");
  const _require = createRequire(import.meta.url);
  const pkg = _require("../package.json") as { version: string };
  const version = pkg.version;

  if (!wallet) {
    console.log("");
    console.log(pc.bold(pc.cyan("  DeFi CLI v" + version)));
    console.log("");
    console.log(pc.yellow("  Wallet not configured."));
    console.log("  Set DEFI_WALLET_ADDRESS to see your balances:");
    console.log("");
    console.log(pc.dim("    export DEFI_WALLET_ADDRESS=0x..."));
    console.log("");
    console.log("  Commands:");
    console.log(pc.dim("    defi status              Protocol overview"));
    console.log(pc.dim("    defi lending rates       Compare lending APYs"));
    console.log(pc.dim("    defi lp discover         Find LP farming pools"));
    console.log(pc.dim("    defi portfolio           View all positions"));
    console.log(pc.dim("    defi scan                Exploit detection"));
    console.log(pc.dim("    defi --help              Full command list"));
    console.log("");
    return;
  }

  const resolved = await resolveChainBalances(registry, wallet);

  const colWidth = 38;
  const divider = "─".repeat(colWidth - 2);
  const chainNames = resolved.map(c => c.name).join(pc.dim(" · "));

  console.log("");
  console.log(pc.bold(pc.cyan("  DeFi CLI v" + version)) + pc.dim("  —  ") + pc.bold(chainNames));
  console.log("");
  console.log("  Wallet: " + pc.yellow(shortenAddress(wallet)));
  console.log("");

  // Render in 2-column rows; last odd chain rendered alone
  for (let i = 0; i < resolved.length; i += 2) {
    const left = resolved[i]!;
    const right = resolved[i + 1];

    const leftHeader = padRight("  " + pc.bold(left.name), colWidth + 10);
    const rightHeader = right ? pc.bold(right.name) : "";
    console.log(leftHeader + (right ? "  " + rightHeader : ""));

    const leftDivider = padRight("  " + pc.dim(divider), colWidth + 10);
    const rightDivider = right ? pc.dim(divider) : "";
    console.log(leftDivider + (right ? "  " + rightDivider : ""));

    const maxRows = Math.max(left.balances.length, right?.balances.length ?? 0);
    for (let r = 0; r < maxRows; r++) {
      const lEntry = left.balances[r];
      const rEntry = right?.balances[r];

      const lText = lEntry ? formatBalanceLine(lEntry.symbol, lEntry.balance) : "";
      const rText = rEntry ? formatBalanceLine(rEntry.symbol, rEntry.balance) : "";

      const lColored = lEntry
        ? (lEntry.balance === "0.00" || lEntry.balance === "?" ? pc.dim(lText) : lText)
        : "";
      const rColored = rEntry
        ? (rEntry.balance === "0.00" || rEntry.balance === "?" ? pc.dim(rText) : rText)
        : "";

      const lVisible = lText.length;
      const lPad = colWidth - lVisible;
      const lPadded = lColored + (lPad > 0 ? " ".repeat(lPad) : "");

      console.log(lPadded + (right ? "  " + rColored : ""));
    }

    if (i + 2 < resolved.length) console.log("");
  }

  console.log("");
  console.log("  " + pc.bold("Commands:"));
  console.log("    " + pc.cyan("defi status") + "              Protocol overview");
  console.log("    " + pc.cyan("defi lending rates") + "       Compare lending APYs");
  console.log("    " + pc.cyan("defi dex quote") + "           Get swap quotes");
  console.log("    " + pc.cyan("defi portfolio") + "           View all positions");
  console.log("    " + pc.cyan("defi scan") + "                Exploit detection");
  console.log("    " + pc.cyan("defi --help") + "              Full command list");
  console.log("");
}
