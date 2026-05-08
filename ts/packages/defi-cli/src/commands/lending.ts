import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { InterestRateMode, type MorphoMarketId } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { createLending } from "@hypurrquant/defi-protocols";
import { resolveContext, resolveTokenAddress, resolveWallet } from "../utils.js";

/**
 * Accept "max" / "all" (case-insensitive) as a sentinel for type(uint256).max
 * — the well-known Aave V3 / Compound V2 convention for "withdraw all" /
 * "repay all" / unlimited approve. Without this carve-out, BigInt("max")
 * throws SyntaxError and the CLI surfaces a confusing
 * `Cannot convert max to a BigInt` error.
 *
 * Mirrors `commands/token.ts approve --amount max`, which has supported
 * this since the SSOT 7.x baseline; lending lagged behind.
 */
function parseAmount(s: string): bigint {
  const lower = s.toLowerCase();
  if (lower === "max" || lower === "all") return maxUint256;
  return BigInt(s);
}

export function registerLending(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lending = parent.command("lending").description("Lending operations: supply, borrow, repay, withdraw, rates, position");

  lending.command("rates")
    .description("Show current lending rates")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .action(async (opts) => {
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const rates = await adapter.getRates(asset);
      printOutput(rates, getOpts());
    });

  lending.command("position")
    .description("Show current lending position")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const address = (opts.address ?? process.env["DEFI_WALLET_ADDRESS"]) as Address | undefined;
      if (!address) { printOutput({ error: "--address required (or set DEFI_WALLET_ADDRESS)" }, getOpts()); return; }
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const position = await adapter.getUserPosition(address);
      printOutput(position, getOpts());
    });

  lending.command("supply")
    .description("Supply an asset to a lending protocol")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount to supply in wei (or 'max')")
    .option("--market <marketId>", "Morpho Blue marketId (32-byte hex) — required for direct Morpho markets, ignored elsewhere")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildSupply({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount), on_behalf_of: onBehalfOf,
        market_id: opts.market as MorphoMarketId | undefined,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("borrow")
    .description("Borrow an asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--rate-mode <mode>", "variable or stable", "variable")
    .option("--market <marketId>", "Morpho Blue marketId (32-byte hex) — required for direct Morpho markets, ignored elsewhere")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildBorrow({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount),
        interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
        on_behalf_of: onBehalfOf,
        market_id: opts.market as MorphoMarketId | undefined,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("repay")
    .description("Repay a borrowed asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--rate-mode <mode>", "variable or stable", "variable")
    .option("--market <marketId>", "Morpho Blue marketId (32-byte hex) — required for direct Morpho markets, ignored elsewhere")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildRepay({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount),
        interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
        on_behalf_of: onBehalfOf,
        market_id: opts.market as MorphoMarketId | undefined,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("withdraw")
    .description("Withdraw a supplied asset")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .option("--market <marketId>", "Morpho Blue marketId (32-byte hex) — required for direct Morpho markets, ignored elsewhere")
    .option("--to <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const to = resolveWallet(opts.to);
      const tx = await adapter.buildWithdraw({
        protocol: ctx.protocol!.name, asset, amount: parseAmount(opts.amount), to,
        market_id: opts.market as MorphoMarketId | undefined,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("toggle-collateral")
    .description("Enable or disable a supplied reserve as collateral (Aave V3 family)")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--asset <token>", "Token symbol or address")
    .option("--enable", "Enable as collateral")
    .option("--disable", "Disable as collateral")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      if (!opts.enable && !opts.disable) {
        printOutput({ error: "must pass either --enable or --disable" }, getOpts());
        return;
      }
      if (opts.enable && opts.disable) {
        printOutput({ error: "--enable and --disable are mutually exclusive" }, getOpts());
        return;
      }
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      if (typeof adapter.buildSetUseReserveAsCollateral !== "function") {
        printOutput({
          error: `[${ctx.protocol!.name}] adapter does not implement buildSetUseReserveAsCollateral. ` +
                 `Aave V3 forks support this; Compound V2/Morpho Blue use different flows.`,
        }, getOpts());
        return;
      }
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const tx = await adapter.buildSetUseReserveAsCollateral(asset, !!opts.enable);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("set-emode")
    .description("Enroll the user in an Aave V3 efficiency-mode category (0 to opt out)")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--category-id <id>", "eMode category id (0 = opt out)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      if (typeof adapter.buildSetEMode !== "function") {
        printOutput({
          error: `[${ctx.protocol!.name}] adapter does not implement buildSetEMode (Aave V3 only)`,
        }, getOpts());
        return;
      }
      const id = parseInt(opts.categoryId as string, 10);
      if (!Number.isInteger(id) || id < 0 || id > 255) {
        printOutput({ error: `--category-id must be an integer in [0, 255], got '${opts.categoryId}'` }, getOpts());
        return;
      }
      const tx = await adapter.buildSetEMode(id);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("enter-markets")
    .description("Compound V2 (Venus): enter supplied assets as collateral via Comptroller.enterMarkets")
    .requiredOption("--protocol <protocol>", "Protocol slug (must be a Compound V2 fork)")
    .requiredOption("--asset <token>", "Underlying asset symbol or address (resolved to its cToken)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      if (typeof adapter.buildEnterMarkets !== "function") {
        printOutput({
          error: `[${ctx.protocol!.name}] adapter does not implement buildEnterMarkets. ` +
                 `This is a Compound V2 family operation; Aave V3 uses toggle-collateral instead.`,
        }, getOpts());
        return;
      }
      // Resolve underlying asset → cToken via the protocol entry's contracts.
      // Compound V2 vTokens are registered under names like vusdt/vusdc/vbnb.
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const contracts = (ctx.protocol!.contracts ?? {}) as Record<string, Address>;
      // Try matching by underlying address via the adapter's internal cache —
      // expose via an opt-in cast (the cache is private, so we resort to a
      // straightforward grep over the registered vTokens).
      const vTokenEntries = Object.entries(contracts).filter(([k]) => /^v[a-z][a-z0-9]*$/i.test(k));
      if (vTokenEntries.length === 0) {
        printOutput({ error: `[${ctx.protocol!.name}] no vTokens registered in TOML` }, getOpts());
        return;
      }
      // We can't introspect vToken.underlying() without RPC; require the user to
      // pass --asset matching one of the vToken keys (e.g. --asset USDT → vusdt).
      // For convenience, try matching the asset symbol against vToken keys.
      const symbol = (opts.asset as string).toLowerCase();
      const matchedKey = vTokenEntries.find(([k]) => k.toLowerCase() === `v${symbol}`);
      const vToken = matchedKey ? (matchedKey[1] as Address) : undefined;
      if (!vToken) {
        printOutput({
          error: `[${ctx.protocol!.name}] could not resolve a vToken for '${opts.asset}'. ` +
                 `Registered vTokens: ${vTokenEntries.map(([k]) => k).join(", ")}. ` +
                 `Pass --asset matching the symbol after the 'v' prefix (e.g. USDT for vusdt).`,
        }, getOpts());
        return;
      }
      // asset arg silenced (used only for symbol matching above); reference it
      // with a noop so the unused-var lint is happy without disabling the rule.
      void asset;
      const tx = await adapter.buildEnterMarkets([vToken]);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("supply-collateral")
    .description("Supply the collateral side of a Morpho Blue market (different selector from supply)")
    .requiredOption("--protocol <protocol>", "Protocol slug (must be a Morpho Blue adapter)")
    .requiredOption("--asset <token>", "Collateral token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .requiredOption("--market <marketId>", "32-byte Morpho marketId (find via Morpho API)")
    .option("--on-behalf-of <address>", "On behalf of address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      if (typeof adapter.buildSupplyCollateral !== "function") {
        printOutput({
          error: `[${ctx.protocol!.name}] adapter does not implement buildSupplyCollateral. ` +
                 `Only Morpho Blue forks expose this; Aave V3 / Compound use plain supply.`,
        }, getOpts());
        return;
      }
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const onBehalfOf = resolveWallet(opts.onBehalfOf);
      const tx = await adapter.buildSupplyCollateral({
        protocol: ctx.protocol!.name,
        asset,
        amount: parseAmount(opts.amount),
        on_behalf_of: onBehalfOf,
        market_id: opts.market as MorphoMarketId,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  lending.command("withdraw-collateral")
    .description("Withdraw the collateral side of a Morpho Blue market")
    .requiredOption("--protocol <protocol>", "Protocol slug (must be a Morpho Blue adapter)")
    .requiredOption("--asset <token>", "Collateral token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei (or 'max')")
    .requiredOption("--market <marketId>", "32-byte Morpho marketId")
    .option("--to <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const ctx = resolveContext(parent, getOpts, opts.protocol);
      if (!ctx) return;
      const adapter = createLending(ctx.protocol!, ctx.rpcUrl);
      if (typeof adapter.buildWithdrawCollateral !== "function") {
        printOutput({
          error: `[${ctx.protocol!.name}] adapter does not implement buildWithdrawCollateral.`,
        }, getOpts());
        return;
      }
      const asset = resolveTokenAddress(ctx.registry, ctx.chainName, opts.asset);
      const to = resolveWallet(opts.to);
      const tx = await adapter.buildWithdrawCollateral({
        protocol: ctx.protocol!.name,
        asset,
        amount: parseAmount(opts.amount),
        to,
        market_id: opts.market as MorphoMarketId,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });
}
