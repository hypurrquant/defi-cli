import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";

// ── Chain name mappings ──

const CHAIN_NAMES: Record<string, { kyber?: string; openocean: string }> = {
  hyperevm: { kyber: "hyperevm", openocean: "hyperevm" },
  mantle:   { openocean: "mantle" },
};

// ── KyberSwap ──

const KYBER_API = "https://aggregator-api.kyberswap.com";

async function kyberGetQuote(
  chain: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ tokenIn, tokenOut, amountIn });
  const url = `${KYBER_API}/${chain}/api/v1/routes?${params}`;
  const res = await fetch(url, { headers: { "x-client-id": "defi-cli" } });
  if (!res.ok) throw new Error(`KyberSwap quote failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const data = json.data as Record<string, unknown> | undefined;
  if (!data?.routeSummary) throw new Error(`KyberSwap: no route found`);
  return data;
}

async function kyberBuildTx(
  chain: string,
  routeSummary: unknown,
  sender: string,
  recipient: string,
  slippageTolerance: number,
): Promise<{ to: string; data: string; value: string }> {
  const url = `${KYBER_API}/${chain}/api/v1/route/build`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-id": "defi-cli" },
    body: JSON.stringify({ routeSummary, sender, recipient, slippageTolerance }),
  });
  if (!res.ok) throw new Error(`KyberSwap build failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const data = json.data as Record<string, unknown> | undefined;
  if (!data) throw new Error("KyberSwap: no build data");
  return {
    to: String(data.routerAddress),
    data: String(data.data),
    value: String(data.value ?? "0x0"),
  };
}

// ── OpenOcean ──

const OPENOCEAN_API = "https://open-api.openocean.finance/v4";

async function openoceanSwap(
  chain: string,
  inTokenAddress: string,
  outTokenAddress: string,
  amountIn: string,
  slippagePct: string,
  account: string,
): Promise<{ to: string; data: string; value: string; outAmount: string }> {
  const params = new URLSearchParams({
    inTokenAddress,
    outTokenAddress,
    amount: amountIn,
    gasPrice: "0.1",
    slippage: slippagePct,
    account,
  });
  const url = `${OPENOCEAN_API}/${chain}/swap?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenOcean swap failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const data = json.data as Record<string, unknown> | undefined;
  if (!data) throw new Error("OpenOcean: no swap data");
  return {
    to: String(data.to),
    data: String(data.data),
    value: String(data.value ?? "0x0"),
    outAmount: String(data.outAmount ?? "0"),
  };
}

// ── LiquidSwap (HyperEVM only) ──

const LIQD_API = "https://api.liqd.ag/v2";
const LIQD_ROUTER = "0x744489ee3d540777a66f2cf297479745e0852f7a";

async function liquidSwapRoute(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippagePct: string,
): Promise<{ to: string; data: string; value: string; outAmount: string }> {
  const params = new URLSearchParams({ tokenIn, tokenOut, amountIn, slippage: slippagePct });
  const url = `${LIQD_API}/route?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LiquidSwap route failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const execution = json.execution as Record<string, unknown> | undefined;
  if (!execution) throw new Error("LiquidSwap: no execution data in response");
  const details = json.details as Record<string, unknown> | undefined;
  return {
    to: String(execution.to ?? LIQD_ROUTER),
    data: String(execution.calldata),
    value: String(execution.value ?? "0x0"),
    outAmount: String(details?.amountOut ?? json.amountOut ?? "0"),
  };
}

// ── Command registration ──

export function registerSwap(
  parent: Command,
  getOpts: () => OutputMode,
  makeExecutor: () => Executor,
): void {
  parent
    .command("swap")
    .description("Swap tokens via DEX aggregator (KyberSwap, OpenOcean, LiquidSwap)")
    .requiredOption("--from <token>", "Input token symbol or address")
    .requiredOption("--to <token>", "Output token symbol or address")
    .requiredOption("--amount <amount>", "Amount of input token in wei")
    .option("--provider <name>", "Aggregator: kyber, openocean, liquid", "kyber")
    .option("--slippage <bps>", "Slippage tolerance in bps", "50")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const provider = (opts.provider as string).toLowerCase();
      const slippageBps = parseInt(opts.slippage as string, 10);

      // Resolve token addresses
      const fromAddr: string = (opts.from as string).startsWith("0x")
        ? opts.from as string
        : registry.resolveToken(chainName, opts.from as string).address;
      const toAddr: string = (opts.to as string).startsWith("0x")
        ? opts.to as string
        : registry.resolveToken(chainName, opts.to as string).address;

      const wallet = (process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;

      if (provider === "kyber") {
        const chainNames = CHAIN_NAMES[chainName];
        if (!chainNames?.kyber) {
          printOutput({ error: `KyberSwap: unsupported chain '${chainName}'. Supported: hyperevm` }, getOpts());
          return;
        }
        const kyberChain = chainNames.kyber;

        try {
          const quoteData = await kyberGetQuote(kyberChain, fromAddr, toAddr, opts.amount as string);
          const routeSummary = quoteData.routeSummary as Record<string, unknown>;
          const amountOut = String((routeSummary as Record<string, unknown>).amountOut ?? "0");

          // Build tx for the executor
          const txData = await kyberBuildTx(
            kyberChain,
            routeSummary,
            wallet,
            wallet,
            slippageBps,
          );

          const tx = {
            description: `KyberSwap: swap ${opts.amount} of ${fromAddr} -> ${toAddr}`,
            to: txData.to as Address,
            data: txData.data as `0x${string}`,
            value: txData.value.startsWith("0x") ? BigInt(txData.value) : BigInt(txData.value || 0),
            approvals: [{ token: fromAddr as Address, spender: txData.to as Address, amount: BigInt(opts.amount as string) }],
          };

          const result = await executor.execute(tx);
          printOutput({
            provider: "kyber",
            chain: kyberChain,
            from_token: fromAddr,
            to_token: toAddr,
            amount_in: opts.amount,
            amount_out: amountOut,
            router: txData.to,
            ...result,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `KyberSwap error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "openocean") {
        const chainNames = CHAIN_NAMES[chainName];
        if (!chainNames) {
          printOutput({ error: `OpenOcean: unsupported chain '${chainName}'. Supported: ${Object.keys(CHAIN_NAMES).join(", ")}` }, getOpts());
          return;
        }
        const ooChain = chainNames.openocean;
        // OpenOcean amount is human-readable — convert wei to decimal
        const fromToken = (opts.from as string).startsWith("0x")
          ? registry.tokens.get(chainName)?.find(t => t.address.toLowerCase() === (opts.from as string).toLowerCase())
          : registry.tokens.get(chainName)?.find(t => t.symbol.toLowerCase() === (opts.from as string).toLowerCase());
        const fromDecimals = fromToken?.decimals ?? 18;
        const humanAmount = (Number(opts.amount) / 10 ** fromDecimals).toString();
        const slippagePct = (slippageBps / 100).toFixed(2);

        try {
          const swap = await openoceanSwap(
            ooChain,
            fromAddr,
            toAddr,
            humanAmount,
            slippagePct,
            wallet,
          );

          const tx = {
            description: `OpenOcean: swap ${opts.amount} of ${fromAddr} -> ${toAddr}`,
            to: swap.to as Address,
            data: swap.data as `0x${string}`,
            value: swap.value.startsWith("0x") ? BigInt(swap.value) : BigInt(swap.value || 0),
            approvals: [{ token: fromAddr as Address, spender: swap.to as Address, amount: BigInt(opts.amount as string) }],
          };

          const result = await executor.execute(tx);
          printOutput({
            provider: "openocean",
            chain: ooChain,
            from_token: fromAddr,
            to_token: toAddr,
            amount_in: opts.amount,
            amount_out: swap.outAmount,
            router: swap.to,
            ...result,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `OpenOcean error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "liquid") {
        if (chainName !== "hyperevm") {
          printOutput({ error: `LiquidSwap only supports hyperevm, got '${chainName}'` }, getOpts());
          return;
        }
        const slippagePct = (slippageBps / 100).toFixed(2);

        try {
          const route = await liquidSwapRoute(fromAddr, toAddr, opts.amount as string, slippagePct);

          const tx = {
            description: `LiquidSwap: swap ${opts.amount} of ${fromAddr} -> ${toAddr}`,
            to: route.to as Address,
            data: route.data as `0x${string}`,
            value: route.value.startsWith("0x") ? BigInt(route.value) : BigInt(route.value || 0),
            approvals: [{ token: fromAddr as Address, spender: route.to as Address, amount: BigInt(opts.amount as string) }],
          };

          const result = await executor.execute(tx);
          printOutput({
            provider: "liquid",
            chain: chainName,
            from_token: fromAddr,
            to_token: toAddr,
            amount_in: opts.amount,
            amount_out: route.outAmount,
            router: route.to,
            ...result,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `LiquidSwap error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
        }
        return;
      }

      printOutput({ error: `Unknown provider '${opts.provider}'. Choose: kyber, openocean, liquid` }, getOpts());
    });
}
