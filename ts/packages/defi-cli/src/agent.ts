import * as readline from "readline";
import type { Executor } from "./executor.js";
import { DefiError } from "@hypurrquant/defi-core";
import type { Registry } from "@hypurrquant/defi-core";

export interface AgentCommand {
  action: string;
  params: unknown;
}

export interface AgentResponse {
  action: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export async function runAgent(registry: Registry, executor: Executor): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let cmd: AgentCommand;
    try {
      cmd = JSON.parse(trimmed) as AgentCommand;
    } catch (e: unknown) {
      const resp: AgentResponse = {
        action: "unknown",
        success: false,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      };
      console.log(JSON.stringify(resp));
      continue;
    }

    const resp = await dispatchCommand(cmd, registry, executor);
    console.log(JSON.stringify(resp));
  }
}

async function dispatchCommand(
  cmd: AgentCommand,
  registry: Registry,
  executor: Executor,
): Promise<AgentResponse> {
  try {
    const result = await handleAction(cmd.action, cmd.params, registry, executor);
    return { action: cmd.action, success: true, result };
  } catch (e: unknown) {
    return {
      action: cmd.action,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function handleAction(
  action: string,
  params: unknown,
  registry: Registry,
  executor: Executor,
): Promise<unknown> {
  const p = (params ?? {}) as Record<string, unknown>;

  switch (action) {
    case "status":
      return handleStatus(registry);

    case "list_protocols":
      return handleListProtocols(registry, p);

    case "schema":
      return handleSchema(p);

    case "dex.swap":
    case "dex.quote":
    case "lending.supply":
    case "lending.borrow":
    case "lending.repay":
    case "lending.withdraw":
    case "staking.stake":
    case "staking.unstake":
    case "vault.deposit":
    case "vault.withdraw":
    case "cdp.open":
      throw DefiError.unsupported(`Agent action '${action}' not yet implemented in TS port`);

    default:
      throw DefiError.unsupported(`Unknown action: ${action}`);
  }
}

function handleStatus(registry: Registry): unknown {
  const chain = registry.getChain("hyperevm");
  const protocols = registry.protocols.map((p) => ({
    name: p.name,
    slug: p.slug,
    category: p.category,
    interface: p.interface,
    native: p.native,
  }));

  return {
    chain: chain.name,
    chain_id: chain.chain_id,
    protocol_count: protocols.length,
    protocols,
  };
}

function handleListProtocols(registry: Registry, params: Record<string, unknown>): unknown {
  const categoryFilter = typeof params["category"] === "string" ? params["category"] : undefined;

  const protocols = registry.protocols
    .filter((p) => !categoryFilter || p.category.toLowerCase() === categoryFilter.toLowerCase())
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      category: p.category,
      interface: p.interface,
    }));

  return { protocols };
}

export function handleSchema(params: Record<string, unknown>): unknown {
  const action = typeof params["action"] === "string" ? params["action"] : "all";

  switch (action) {
    case "dex.swap":
      return {
        action: "dex.swap",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug (e.g. hyperswap-v3)" },
          token_in: { type: "string", required: true, description: "Input token symbol or address" },
          token_out: { type: "string", required: true, description: "Output token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable, e.g. '1.5')" },
          slippage_bps: { type: "number", required: false, default: 50, description: "Slippage in basis points" },
          recipient: { type: "string", required: false, description: "Recipient address" },
        },
      };

    case "dex.quote":
      return {
        action: "dex.quote",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          token_in: { type: "string", required: true, description: "Input token symbol or address" },
          token_out: { type: "string", required: true, description: "Output token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" },
        },
      };

    case "lending.supply":
    case "lending.borrow":
    case "lending.repay":
    case "lending.withdraw":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          asset: { type: "string", required: true, description: "Token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" },
        },
      };

    case "staking.stake":
    case "staking.unstake":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" },
        },
      };

    case "vault.deposit":
    case "vault.withdraw":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" },
        },
      };

    case "cdp.open":
      return {
        action: "cdp.open",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          collateral: { type: "string", required: true, description: "Collateral token symbol or address" },
          collateral_amount: { type: "string", required: true, description: "Collateral amount (human-readable)" },
          debt_amount: { type: "string", required: true, description: "Debt amount (human-readable)" },
        },
      };

    case "status":
      return { action: "status", params: {} };

    case "list_protocols":
      return {
        action: "list_protocols",
        params: {
          category: { type: "string", required: false, description: "Filter by category (e.g. dex, lending, vault)" },
        },
      };

    default:
      return {
        actions: [
          "status", "list_protocols", "schema",
          "dex.swap", "dex.quote",
          "lending.supply", "lending.borrow", "lending.repay", "lending.withdraw",
          "staking.stake", "staking.unstake",
          "vault.deposit", "vault.withdraw",
          "cdp.open",
        ],
      };
  }
}
