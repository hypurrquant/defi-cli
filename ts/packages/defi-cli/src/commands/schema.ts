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
      const action = opts.all ? "all" : (command ?? "all");
      const params: Record<string, unknown> = { action };
      const schema = handleSchema(params);
      printOutput(schema, mode);
    });
}
