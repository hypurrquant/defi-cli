import { program } from "./cli.js";
import { showLandingPage } from "./landing.js";

async function main() {
  try {
    const rawArgs = process.argv.slice(2);
    // Known subcommands registered in cli.ts — everything that isn't a flag
    const knownSubcommands = new Set([
      "status", "schema", "dex", "gauge", "lending", "cdp", "staking", "vault",
      "yield", "portfolio", "monitor", "alert", "scan", "arb", "positions",
      "price", "wallet", "token", "whales", "compare", "swap", "bridge", "nft",
      "farm", "agent",
    ]);
    const hasSubcommand = rawArgs.some(a => !a.startsWith("-") && knownSubcommands.has(a));
    const isJson = rawArgs.includes("--json") || rawArgs.includes("--ndjson");
    const isHelp = rawArgs.includes("--help") || rawArgs.includes("-h");

    if (!isHelp && (rawArgs.length === 0 || !hasSubcommand)) {
      await showLandingPage(isJson);
      return;
    }

    await program.parseAsync(process.argv);
  } catch (error) {
    const isJsonMode =
      process.argv.includes("--json") || process.argv.includes("--ndjson");

    if (isJsonMode) {
      const errorObj = {
        error: error instanceof Error ? error.message : String(error),
      };
      process.stderr.write(JSON.stringify(errorObj, null, 2) + "\n");
    } else {
      process.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    process.exit(1);
  }
}

main();
