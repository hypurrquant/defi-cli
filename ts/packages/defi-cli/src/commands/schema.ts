import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { handleSchema } from "../agent.js";

export function registerSchema(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("schema [command]")
    .description("Output JSON schema for a command (agent-friendly)")
    .option("--all", "Show all schemas")
    .action(async (command: string | undefined, opts: { all?: boolean }) => {
      const mode = getOpts();
      // CLI passes hyphenated forms (`schema lending-supply`); the action
      // dispatcher in agent.ts uses dotted keys (`lending.supply`). Normalise
      // here so the schema lookup hits the right case instead of falling
      // through to the generic action list.
      const raw = opts.all ? "all" : (command ?? "all");
      const action = raw.replace(/-/g, ".");
      const params: Record<string, unknown> = { action };
      const schema = handleSchema(params);
      printOutput(schema, mode);
    });
}
