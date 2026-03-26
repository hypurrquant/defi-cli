import pc from "picocolors";
import { encodeFunctionData, parseAbi, formatUnits, createPublicClient, http } from "viem";
import type { Address, Hex } from "viem";
import { Registry, multicallRead, decodeU256, MULTICALL3_ADDRESS } from "@hypurrquant/defi-core";
import type { TokenEntry } from "@hypurrquant/defi-core";

// Tokens to show on the landing page (ordered by importance)
const HYPEREVM_DISPLAY = ["HYPE", "WHYPE", "USDC", "USDT0", "USDe", "kHYPE", "wstHYPE"];
const MANTLE_DISPLAY = ["MNT", "WMNT", "USDC", "USDT", "WETH", "mETH"];

const balanceOfAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

// multicall3 getEthBalance ABI
const getEthBalanceAbi = parseAbi([
  "function getEthBalance(address addr) view returns (uint256)",
]);

interface TokenBalance {
  symbol: string;
  balance: string; // formatted, or "?" on error
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
        encodeFunctionData({
          abi: getEthBalanceAbi,
          functionName: "getEthBalance",
          args: [wallet],
        }),
      ];
    }
    return [
      t.address,
      encodeFunctionData({
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [wallet],
      }),
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
    // Trim trailing zeros but keep 2 decimal places minimum
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

export async function showLandingPage(isJson: boolean): Promise<void> {
  const registry = Registry.loadEmbedded();
  const wallet = process.env.DEFI_WALLET_ADDRESS as Address | undefined;

  if (isJson) {
    if (!wallet) {
      console.log(JSON.stringify({ error: "DEFI_WALLET_ADDRESS not set" }, null, 2));
      return;
    }
    const heChain = registry.getChain("hyperevm");
    const mantleChain = registry.getChain("mantle");
    const heTokens = (registry.tokens.get("hyperevm") ?? []).filter(t => HYPEREVM_DISPLAY.includes(t.symbol));
    const mantleTokens = (registry.tokens.get("mantle") ?? []).filter(t => MANTLE_DISPLAY.includes(t.symbol));

    // Sort to match display order
    const heSorted = HYPEREVM_DISPLAY.map(s => heTokens.find(t => t.symbol === s)).filter(Boolean) as TokenEntry[];
    const mantleSorted = MANTLE_DISPLAY.map(s => mantleTokens.find(t => t.symbol === s)).filter(Boolean) as TokenEntry[];

    const [heBalances, mantleBalances] = await Promise.all([
      fetchBalances(heChain.effectiveRpcUrl(), wallet, heSorted),
      fetchBalances(mantleChain.effectiveRpcUrl(), wallet, mantleSorted),
    ]);

    console.log(JSON.stringify({
      wallet,
      chains: {
        hyperevm: { name: heChain.name, balances: heBalances },
        mantle: { name: mantleChain.name, balances: mantleBalances },
      },
    }, null, 2));
    return;
  }

  // Human-readable mode
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

  const heChain = registry.getChain("hyperevm");
  const mantleChain = registry.getChain("mantle");

  const heTokens = (registry.tokens.get("hyperevm") ?? []).filter(t => HYPEREVM_DISPLAY.includes(t.symbol));
  const mantleTokens = (registry.tokens.get("mantle") ?? []).filter(t => MANTLE_DISPLAY.includes(t.symbol));

  const heSorted = HYPEREVM_DISPLAY.map(s => heTokens.find(t => t.symbol === s)).filter(Boolean) as TokenEntry[];
  const mantleSorted = MANTLE_DISPLAY.map(s => mantleTokens.find(t => t.symbol === s)).filter(Boolean) as TokenEntry[];

  // Fetch both chains in parallel
  const [heBalances, mantleBalances] = await Promise.all([
    fetchBalances(heChain.effectiveRpcUrl(), wallet, heSorted).catch(() =>
      heSorted.map(t => ({ symbol: t.symbol, balance: "?", decimals: t.decimals }))
    ),
    fetchBalances(mantleChain.effectiveRpcUrl(), wallet, mantleSorted).catch(() =>
      mantleSorted.map(t => ({ symbol: t.symbol, balance: "?", decimals: t.decimals }))
    ),
  ]);

  const colWidth = 38;
  const divider = "─".repeat(colWidth - 2);

  console.log("");
  console.log(
    pc.bold(pc.cyan("  DeFi CLI v" + version)) +
    pc.dim("  —  ") +
    pc.bold(heChain.name) +
    pc.dim(" · ") +
    pc.bold(mantleChain.name)
  );
  console.log("");
  console.log("  Wallet: " + pc.yellow(shortenAddress(wallet)));
  console.log("");

  // Chain headers
  const heHeader = padRight("  " + pc.bold(heChain.name), colWidth + 10 /* account for ANSI */);
  const mantleHeader = pc.bold(mantleChain.name);
  console.log(heHeader + "  " + mantleHeader);

  const heDivider = padRight("  " + pc.dim(divider), colWidth + 10);
  const mantleDivider = pc.dim(divider);
  console.log(heDivider + "  " + mantleDivider);

  const maxRows = Math.max(heBalances.length, mantleBalances.length);
  for (let i = 0; i < maxRows; i++) {
    const heEntry = heBalances[i];
    const mantleEntry = mantleBalances[i];

    const heText = heEntry ? formatBalanceLine(heEntry.symbol, heEntry.balance) : "";
    const mantleText = mantleEntry ? formatBalanceLine(mantleEntry.symbol, mantleEntry.balance) : "";

    // Color zero balances dimly, non-zero normally
    const heColored = heEntry
      ? (heEntry.balance === "0.00" || heEntry.balance === "?"
        ? pc.dim(heText)
        : heText)
      : "";
    const mantleColored = mantleEntry
      ? (mantleEntry.balance === "0.00" || mantleEntry.balance === "?"
        ? pc.dim(mantleText)
        : mantleText)
      : "";

    // Pad the left column (strip ANSI for length calculation)
    const visibleLen = heText.length;
    const padNeeded = colWidth - visibleLen;
    const paddedHe = heColored + (padNeeded > 0 ? " ".repeat(padNeeded) : "");

    console.log(paddedHe + "  " + mantleColored);
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
