import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry, buildApprove, buildTransfer, erc20Abi } from "@hypurrquant/defi-core";
import { createPublicClient, http, maxUint256 } from "viem";
import type { Address } from "viem";

export function registerToken(parent: Command, getOpts: () => OutputMode, executor: Executor): void {
  const token = parent.command("token").description("Token operations: approve, allowance, transfer, balance");

  token
    .command("balance")
    .description("Query token balance for an address")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--owner <address>", "Wallet address to query")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const tokenAddr = opts.token.startsWith("0x")
        ? opts.token as Address
        : registry.resolveToken(chainName, opts.token).address as Address;

      const [balance, symbol, decimals] = await Promise.all([
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "balanceOf", args: [opts.owner as Address] }),
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" }),
      ]);

      printOutput({
        token: tokenAddr,
        symbol,
        owner: opts.owner,
        balance,
        decimals,
      }, getOpts());
    });

  token
    .command("approve")
    .description("Approve a spender for a token")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--spender <address>", "Spender address")
    .option("--amount <amount>", "Amount to approve (use 'max' for unlimited)", "max")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const tokenAddr = opts.token.startsWith("0x")
        ? opts.token as Address
        : registry.resolveToken(chainName, opts.token).address as Address;

      const amount = opts.amount === "max" ? maxUint256 : BigInt(opts.amount);
      const tx = buildApprove(tokenAddr, opts.spender as Address, amount);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  token
    .command("allowance")
    .description("Check token allowance")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--owner <address>", "Owner address")
    .requiredOption("--spender <address>", "Spender address")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const tokenAddr = opts.token.startsWith("0x")
        ? opts.token as Address
        : registry.resolveToken(chainName, opts.token).address as Address;

      const allowance = await client.readContract({
        address: tokenAddr, abi: erc20Abi, functionName: "allowance",
        args: [opts.owner as Address, opts.spender as Address],
      });

      printOutput({ token: tokenAddr, owner: opts.owner, spender: opts.spender, allowance }, getOpts());
    });

  token
    .command("transfer")
    .description("Transfer tokens to an address")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--to <address>", "Recipient address")
    .requiredOption("--amount <amount>", "Amount to transfer (in wei)")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const tokenAddr = opts.token.startsWith("0x")
        ? opts.token as Address
        : registry.resolveToken(chainName, opts.token).address as Address;

      const tx = buildTransfer(tokenAddr, opts.to as Address, BigInt(opts.amount));
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
