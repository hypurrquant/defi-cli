import { config } from "dotenv";
import { resolve } from "path";
// Load global ~/.defi/.env first, then CWD .env overrides it
config({ path: resolve(process.env.HOME || "~", ".defi", ".env"), quiet: true });
config({ quiet: true });

import { program } from "./cli.js";
import { showLandingPage } from "./landing.js";

async function main() {
  try {
    const rawArgs = process.argv.slice(2);
    // Known subcommands registered in cli.ts — everything that isn't a flag
    const knownSubcommands = new Set([
      "status", "schema", "lp", "lending", "cdp", "vault",
      "yield", "portfolio", "monitor", "alert", "scan", "positions",
      "price", "wallet", "token", "whales", "bridge",
      "agent", "setup", "init",
    ]);
    const hasSubcommand = rawArgs.some(a => !a.startsWith("-") && knownSubcommands.has(a));
    const isJson = rawArgs.includes("--json") || rawArgs.includes("--ndjson");
    const isHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
    const isVersion = rawArgs.includes("--version") || rawArgs.includes("-V");

    if (!isHelp && !isVersion && (rawArgs.length === 0 || !hasSubcommand)) {
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
