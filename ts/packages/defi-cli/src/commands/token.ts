import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry, buildApprove, buildTransfer, erc20Abi } from "@hypurrquant/defi-core";
import { createPublicClient, encodeFunctionData, http, maxUint256, parseAbi } from "viem";
import type { Address } from "viem";
import { requireChain, resolveTokenAddress } from "../utils.js";

export function registerToken(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const token = parent.command("token").description("Token operations: approve, allowance, transfer, balance");

  token
    .command("balance")
    .description("Query token balance for an address")
    .requiredOption("--token <token>", "Token symbol or address")
    .option("--owner <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const owner = opts.owner ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!owner) { printOutput({ error: "--owner required (or set DEFI_WALLET_ADDRESS)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const tokenAddr = resolveTokenAddress(registry, chainName, opts.token) as Address;

      const [balance, symbol, decimals] = await Promise.all([
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "balanceOf", args: [owner as Address] }),
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" }),
      ]);

      printOutput({
        token: tokenAddr,
        symbol,
        owner,
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
      const executor = makeExecutor();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const tokenAddr = resolveTokenAddress(registry, chainName, opts.token) as Address;

      const amount = opts.amount === "max" ? maxUint256 : BigInt(opts.amount);
      const tx = buildApprove(tokenAddr, opts.spender as Address, amount);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  token
    .command("allowance")
    .description("Check token allowance")
    .requiredOption("--token <token>", "Token symbol or address")
    .option("--owner <address>", "Owner address (defaults to DEFI_WALLET_ADDRESS)")
    .requiredOption("--spender <address>", "Spender address")
    .action(async (opts) => {
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const owner = opts.owner ?? process.env["DEFI_WALLET_ADDRESS"];
      if (!owner) { printOutput({ error: "--owner required (or set DEFI_WALLET_ADDRESS)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });

      const tokenAddr = resolveTokenAddress(registry, chainName, opts.token) as Address;

      const allowance = await client.readContract({
        address: tokenAddr, abi: erc20Abi, functionName: "allowance",
        args: [owner as Address, opts.spender as Address],
      });

      printOutput({ token: tokenAddr, owner, spender: opts.spender, allowance }, getOpts());
    });

  // WETH9-shape wrapped-native interface (deposit/withdraw). Every chain we
  // support exposes `wrapped_native` in chains.toml as the WETH9 fork's
  // address; selectors below are stable across that family:
  //   deposit()             → 0xd0e30db0
  //   withdraw(uint256)     → 0x2e1a7d4d
  const WETH9_ABI = parseAbi([
    "function deposit() payable",
    "function withdraw(uint256 amount)",
  ]);

  token
    .command("wrap")
    .description("Wrap native gas token into its ERC-20 wrapped form (WrappedNative.deposit())")
    .requiredOption("--amount <amount>", "Amount of native token to wrap (in wei)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      if (!chain.wrapped_native) {
        printOutput({ error: `[${chainName}] no wrapped_native registered in chains.toml` }, getOpts());
        return;
      }
      const amount = BigInt(opts.amount);
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: "deposit" });
      const result = await executor.execute({
        description: `[${chainName}] Wrap ${opts.amount} ${chain.native_token} → W${chain.native_token}`,
        to: chain.wrapped_native as Address,
        data,
        value: amount,
        gas_estimate: 80_000,
      });
      printOutput(result, getOpts());
    });

  token
    .command("unwrap")
    .description("Unwrap wrapped-native ERC-20 back into native gas token (WrappedNative.withdraw(amount))")
    .requiredOption("--amount <amount>", "Amount of wrapped token to unwrap (in wei)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      if (!chain.wrapped_native) {
        printOutput({ error: `[${chainName}] no wrapped_native registered in chains.toml` }, getOpts());
        return;
      }
      const amount = BigInt(opts.amount);
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: "withdraw", args: [amount] });
      const result = await executor.execute({
        description: `[${chainName}] Unwrap ${opts.amount} W${chain.native_token} → ${chain.native_token}`,
        to: chain.wrapped_native as Address,
        data,
        value: 0n,
        gas_estimate: 80_000,
      });
      printOutput(result, getOpts());
    });

  token
    .command("transfer")
    .description("Transfer tokens to an address")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--to <address>", "Recipient address")
    .requiredOption("--amount <amount>", "Amount to transfer (in wei)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const tokenAddr = resolveTokenAddress(registry, chainName, opts.token) as Address;

      const tx = buildTransfer(tokenAddr, opts.to as Address, BigInt(opts.amount));
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
