import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
// Load global ~/.defi/.env first, then CWD .env overrides it
config({ path: resolve(process.env.HOME || "~", ".defi", ".env"), quiet: true });
config({ quiet: true });

import { program } from "./cli.js";
import { showLandingPage } from "./landing.js";

/** Known top-level subcommands registered in cli.ts. Anything else in argv is
 *  treated as either a global flag or, if no known subcommand is present,
 *  triggers the landing-page render instead of commander's "unknown command"
 *  error. Kept as an exported set so the dispatch decision is unit-testable
 *  without invoking the CLI. */
export const KNOWN_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "status", "schema", "lp", "lending", "cdp", "vault",
  "yield", "portfolio",
  "price", "wallet", "token", "bridge", "swap",
  "agent", "setup", "init", "ows",
]);

export type EntryPointMode = "landing" | "command" | "help" | "version";

/** Pure dispatch decision: looks at the user's raw argv and decides whether
 *  to render the landing page, defer to commander, or print help/version.
 *  Exported so the routing branches stay testable without spawning the CLI. */
export function decideEntryPoint(rawArgs: string[]): {
  mode: EntryPointMode;
  isJson: boolean;
} {
  const isJson = rawArgs.includes("--json") || rawArgs.includes("--ndjson");
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    return { mode: "help", isJson };
  }
  if (rawArgs.includes("--version") || rawArgs.includes("-V")) {
    return { mode: "version", isJson };
  }
  const hasSubcommand = rawArgs.some(
    (a) => !a.startsWith("-") && KNOWN_SUBCOMMANDS.has(a),
  );
  if (rawArgs.length === 0 || !hasSubcommand) {
    return { mode: "landing", isJson };
  }
  return { mode: "command", isJson };
}

async function main() {
  try {
    const decision = decideEntryPoint(process.argv.slice(2));
    if (decision.mode === "landing") {
      await showLandingPage(decision.isJson);
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

// Guard so importing main.ts (in tests or other modules) doesn't fire main().
// Production: node invokes main.js directly → process.argv[1] === resolved
// path of this file → main() runs. Tests: vitest is process.argv[1] →
// main() is skipped.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
