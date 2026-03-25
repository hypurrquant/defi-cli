import { Command } from "commander";
import { Executor } from "./executor.js";
import { parseOutputMode } from "./output.js";
import type { OutputMode } from "./output.js";
import { runAgent } from "./agent.js";
import { Registry } from "@hypurrquant/defi-core";

import { registerStatus } from "./commands/status.js";
import { registerSchema } from "./commands/schema.js";
import { registerDex } from "./commands/dex.js";
import { registerGauge } from "./commands/gauge.js";
import { registerLending } from "./commands/lending.js";
import { registerCdp } from "./commands/cdp.js";
import { registerStaking } from "./commands/staking.js";
import { registerVault } from "./commands/vault.js";
import { registerYield } from "./commands/yield.js";
import { registerPortfolio } from "./commands/portfolio.js";
import { registerMonitor } from "./commands/monitor.js";
import { registerAlert } from "./commands/alert.js";
import { registerScan } from "./commands/scan.js";
import { registerArb } from "./commands/arb.js";
import { registerPositions } from "./commands/positions.js";
import { registerPrice } from "./commands/price.js";
import { registerWallet } from "./commands/wallet.js";
import { registerToken } from "./commands/token.js";
import { registerWhales } from "./commands/whales.js";
import { registerCompare } from "./commands/compare.js";
import { registerSwap } from "./commands/swap.js";
import { registerBridge } from "./commands/bridge.js";
import { registerNft } from "./commands/nft.js";
import { registerFarm } from "./commands/farm.js";

const BANNER = `
  ██████╗ ███████╗███████╗██╗     ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔════╝██║    ██╔════╝██║     ██║
  ██║  ██║█████╗  █████╗  ██║    ██║     ██║     ██║
  ██║  ██║██╔══╝  ██╔══╝  ██║    ██║     ██║     ██║
  ██████╔╝███████╗██║     ██║    ╚██████╗███████╗██║
  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝

  2 chains · 32 protocols · by HypurrQuant

  Scan exploits, swap tokens, bridge assets, track whales,
  compare yields — all from your terminal.
`;

export const program = new Command()
  .name("defi")
  .description("DeFi CLI — Multi-chain DeFi toolkit")
  .version("0.1.0")
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
registerDex(program, getOutputMode, makeExecutor);
registerGauge(program, getOutputMode, makeExecutor);
registerLending(program, getOutputMode, makeExecutor);
registerCdp(program, getOutputMode, makeExecutor);
registerStaking(program, getOutputMode, makeExecutor);
registerVault(program, getOutputMode, makeExecutor);
registerYield(program, getOutputMode, makeExecutor);
registerPortfolio(program, getOutputMode);
registerMonitor(program, getOutputMode);
registerAlert(program, getOutputMode);
registerScan(program, getOutputMode);
registerArb(program, getOutputMode, makeExecutor);
registerPositions(program, getOutputMode);
registerPrice(program, getOutputMode);
registerWallet(program, getOutputMode);
registerToken(program, getOutputMode, makeExecutor);
registerWhales(program, getOutputMode);
registerCompare(program, getOutputMode);
registerSwap(program, getOutputMode, makeExecutor);
registerBridge(program, getOutputMode);
registerNft(program, getOutputMode);
registerFarm(program, getOutputMode, makeExecutor);

// Agent mode command
program
  .command("agent")
  .description("Agent mode: read JSON commands from stdin (for AI agents)")
  .action(async () => {
    // Registry loading is not yet wired — stub for now
    const executor = makeExecutor();
    process.stderr.write("Agent mode: reading JSON commands from stdin...\n");
    // TODO: wire registry when registry loading is available in TS
    // await runAgent(registry, executor);
    process.stderr.write("Agent mode not yet fully implemented in TS port.\n");
    process.exit(1);
  });
