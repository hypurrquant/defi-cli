#!/usr/bin/env node
import {
  program
} from "./chunk-F2I4LLKZ.js";

// src/main.ts
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const isJsonMode = process.argv.includes("--json") || process.argv.includes("--ndjson");
    if (isJsonMode) {
      const errorObj = {
        error: error instanceof Error ? error.message : String(error)
      };
      process.stderr.write(JSON.stringify(errorObj, null, 2) + "\n");
    } else {
      process.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}
`
      );
    }
    process.exit(1);
  }
}
main();
//# sourceMappingURL=main.js.map