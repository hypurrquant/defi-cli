import { Command } from "commander";
import { createRequire } from "node:module";
import type { Chain } from "viem";
import { Executor } from "./executor.js";
import { parseOutputMode } from "./output.js";
import type { OutputMode } from "./output.js";
import { Registry } from "@hypurrquant/defi-core";

const _require = createRequire(import.meta.url);
const _pkg = _require("../package.json") as { version: string };

import { registerStatus } from "./commands/status.js";
import { registerSchema } from "./commands/schema.js";
import { registerLP } from "./commands/lp.js";
import { registerLending } from "./commands/lending.js";
import { registerYield } from "./commands/yield.js";
import { registerPortfolio } from "./commands/portfolio.js";
import { registerPrice } from "./commands/price.js";
import { registerWallet } from "./commands/wallet.js";
import { registerToken } from "./commands/token.js";
import { registerBridge } from "./commands/bridge.js";
import { registerSwap } from "./commands/swap.js";
import { registerSetup } from "./commands/setup.js";
import { registerOws } from "./commands/ows.js";

function buildBanner(): string {
  let chainCount = 0;
  let protocolCount = 0;
  try {
    const reg = Registry.loadEmbedded();
    chainCount = reg.chains.size;
    // Match getProtocolsForChain's filter: only active + verified protocols.
    protocolCount = reg.protocols.filter(
      (p) => p.verified !== false && p.is_active !== false,
    ).length;
  } catch {
    // registry load failure shouldn't break --help; fall back silently
  }
  const stats = chainCount && protocolCount
    ? `${chainCount} chains · ${protocolCount} protocols · by HypurrQuant`
    : `by HypurrQuant`;
  return `
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  ${stats}

  Lending, LP farming, DEX swap, yield comparison
  — all from your terminal.
`;
}

const BANNER = buildBanner();

export const program = new Command()
  .name("defi")
  .description("DeFi CLI — Multi-chain DeFi toolkit")
  .version(_pkg.version)
  .addHelpText("before", BANNER)
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--fields <fields>", "Select specific output fields (comma-separated)")
  .option("--chain <chain>", "Target chain")
  .option("--dry-run", "Dry-run mode (default, no broadcast)", true)
  .option("--broadcast", "Actually broadcast the transaction");

// Helper: read global output mode from the root program options
function getOutputMode(): OutputMode {
  const opts = program.opts<{
    json?: boolean;
    ndjson?: boolean;
    fields?: string;
  }>();
  return parseOutputMode(opts);
}

// Build executor from global options (lazy — must be called inside action handler, not at registration)
function makeExecutor(): Executor {
  const opts = program.opts<{ broadcast?: boolean; chain?: string }>();
  const registry = Registry.loadEmbedded();
  if (!opts.chain) {
    process.stderr.write("Error: --chain is required for this command (e.g. --chain hyperevm)\n");
    process.exit(1);
  }
  const chain = registry.getChain(opts.chain);
  // SSOT 7.4: anchor wallet/public clients to this chainId at construction
  // time so RPC drift / MITM can't sign a tx for a different chain.
  // ChainConfig.viemChain() returns a viem-compatible Chain shape; the cast
  // bridges defi-core's local type (no viem dep) and viem's full Chain type.
  const viemChain = chain.viemChain() as unknown as Chain;
  return new Executor(!!opts.broadcast, chain.effectiveRpcUrl(), chain.explorer_url, viemChain);
}

// Register all commands
registerStatus(program, getOutputMode);
registerSchema(program, getOutputMode);
registerLP(program, getOutputMode, makeExecutor);
registerLending(program, getOutputMode, makeExecutor);
registerYield(program, getOutputMode, makeExecutor);
registerPortfolio(program, getOutputMode);
registerPrice(program, getOutputMode);
registerWallet(program, getOutputMode);
registerToken(program, getOutputMode, makeExecutor);
registerBridge(program, getOutputMode);
registerSwap(program, getOutputMode, makeExecutor);
registerSetup(program);
registerOws(program, getOutputMode);
