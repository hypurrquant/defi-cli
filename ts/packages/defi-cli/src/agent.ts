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

    case "yield":
    case "lending.rates":
    case "lending.position":
    case "lending.supply":
    case "lending.borrow":
    case "lending.repay":
    case "lending.withdraw":
    case "lp.discover":
    case "lp.add":
    case "lp.farm":
    case "lp.claim":
    case "lp.remove":
    case "swap":
    case "price":
    case "token.balance":
    case "token.approve":
    case "token.transfer":
    case "wallet.balance":
    case "portfolio.show":
    case "bridge":
      throw DefiError.unsupported(`Agent action '${action}' — use CLI commands directly (e.g. defi --chain hyperevm lending rates --protocol hypurrfi --asset USDC)`);

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
    case "status":
      return { action: "status", params: {}, cli: "defi status" };

    case "list_protocols":
      return {
        action: "list_protocols",
        params: {
          category: { type: "string", required: false, description: "Filter by category (e.g. dex, lending)" },
        },
        cli: "defi status",
      };

    case "yield":
      return {
        action: "yield",
        params: {
          chain: { type: "string", required: false, description: "Target chain (omit for all chains)" },
          asset: { type: "string", required: false, default: "USDC", description: "Token symbol" },
        },
        cli: "defi yield --asset USDC",
      };

    case "lending.rates":
      return {
        action: "lending.rates",
        params: {
          chain: { type: "string", required: true, description: "Target chain" },
          protocol: { type: "string", required: true, description: "Protocol slug" },
          asset: { type: "string", required: true, description: "Token symbol or address" },
        },
        cli: "defi --chain hyperevm lending rates --protocol hypurrfi --asset USDC",
      };

    case "lending.supply":
    case "lending.borrow":
    case "lending.repay":
    case "lending.withdraw":
      return {
        action,
        params: {
          chain: { type: "string", required: true, description: "Target chain" },
          protocol: { type: "string", required: true, description: "Protocol slug" },
          asset: { type: "string", required: true, description: "Token symbol or address" },
          amount: { type: "string", required: true, description: "Amount in wei" },
        },
        cli: `defi --chain hyperevm lending ${action.split(".")[1]} --protocol hypurrfi --asset USDC --amount 1000000`,
      };

    case "lp.discover":
      return {
        action: "lp.discover",
        params: {
          chain: { type: "string", required: true, description: "Target chain" },
          protocol: { type: "string", required: false, description: "Filter by protocol slug" },
        },
        cli: "defi --chain hyperevm lp discover",
      };

    case "swap":
      return {
        action: "swap",
        params: {
          chain: { type: "string", required: true, description: "Target chain" },
          from: { type: "string", required: true, description: "Input token symbol or address" },
          to: { type: "string", required: true, description: "Output token symbol or address" },
          amount: { type: "string", required: true, description: "Amount in wei" },
          provider: { type: "string", required: false, default: "kyber", description: "Aggregator: kyber, openocean, liquid" },
          slippage: { type: "string", required: false, default: "50", description: "Slippage in bps" },
        },
        cli: "defi --chain hyperevm swap --from USDC --to WHYPE --amount 1000000",
      };

    case "price":
      return {
        action: "price",
        params: {
          chain: { type: "string", required: true, description: "Target chain" },
          asset: { type: "string", required: true, description: "Token symbol or address" },
        },
        cli: "defi --chain hyperevm price --asset WHYPE",
      };

    case "bridge":
      return {
        action: "bridge",
        params: {
          chain: { type: "string", required: true, description: "Source chain" },
          token: { type: "string", required: true, description: "Token symbol or address" },
          amount: { type: "string", required: true, description: "Amount in wei" },
          to_chain: { type: "string", required: true, description: "Destination chain" },
        },
        cli: "defi --chain hyperevm bridge --token USDC --amount 1000000 --to-chain mantle",
      };

    default:
      return {
        actions: [
          "status", "list_protocols", "schema",
          "yield",
          "lending.rates", "lending.supply", "lending.borrow", "lending.repay", "lending.withdraw",
          "lp.discover", "lp.add", "lp.farm", "lp.claim", "lp.remove",
          "swap", "price",
          "token.balance", "token.approve", "token.transfer",
          "wallet.balance",
          "portfolio.show",
          "bridge",
        ],
      };
  }
}
