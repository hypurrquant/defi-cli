import { Command } from "commander";
import { createRequire } from "node:module";
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
import { registerCdp } from "./commands/cdp.js";
import { registerVault } from "./commands/vault.js";
import { registerYield } from "./commands/yield.js";
import { registerPortfolio } from "./commands/portfolio.js";
import { registerMonitor } from "./commands/monitor.js";
import { registerAlert } from "./commands/alert.js";
import { registerScan } from "./commands/scan.js";
import { registerPositions } from "./commands/positions.js";
import { registerPrice } from "./commands/price.js";
import { registerWallet } from "./commands/wallet.js";
import { registerToken } from "./commands/token.js";
import { registerWhales } from "./commands/whales.js";
import { registerBridge } from "./commands/bridge.js";
import { registerSetup } from "./commands/setup.js";

const BANNER = `
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  2 chains · 21 protocols · by HypurrQuant

  Lending, LP provision, farming, gauges, vaults,
  yield comparison — all from your terminal.
`;

export const program = new Command()
  .name("defi")
  .description("DeFi CLI — Multi-chain DeFi toolkit")
  .version(_pkg.version)
  .addHelpText("before", BANNER)
  .option("--json", "Output as JSON")
  .option("--ndjson", "Output as newline-delimited JSON")
  .option("--fields <fields>", "Select specific output fields (comma-separated)")
  .option("--chain <chain>", "Target chain", "hyperevm")
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
  const chain = registry.getChain(opts.chain ?? "hyperevm");
  return new Executor(!!opts.broadcast, chain.effectiveRpcUrl(), chain.explorer_url);
}

// Register all commands
registerStatus(program, getOutputMode);
registerSchema(program, getOutputMode);
registerLP(program, getOutputMode, makeExecutor);
registerLending(program, getOutputMode, makeExecutor);
registerCdp(program, getOutputMode, makeExecutor);
registerVault(program, getOutputMode, makeExecutor);
registerYield(program, getOutputMode, makeExecutor);
registerPortfolio(program, getOutputMode);
registerMonitor(program, getOutputMode);
registerAlert(program, getOutputMode);
registerScan(program, getOutputMode);
registerPositions(program, getOutputMode);
registerPrice(program, getOutputMode);
registerWallet(program, getOutputMode);
registerToken(program, getOutputMode, makeExecutor);
registerWhales(program, getOutputMode);
registerBridge(program, getOutputMode);

registerSetup(program);
