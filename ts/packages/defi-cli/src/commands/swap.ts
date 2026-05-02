import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { requireChain, resolveTokenAddress, resolveWallet, errMsg, parseBigIntValue } from "../utils.js";

// ── Chain name mappings ──

// Aggregator chain slugs are now defined in chains.toml under `[chain.X.aggregators]`
// and surfaced via ChainConfig.aggregators. This function preserves the legacy lookup
// shape so the existing call sites stay readable.
function getAggregatorSlugs(chainCfg: { aggregators?: { kyber?: string; openocean?: string; liquid?: string } }): { kyber?: string; openocean?: string; liquid?: string } {
  return chainCfg.aggregators ?? {};
}

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

// ── LI.FI (multi-chain via chainId) ──
//
// API: GET https://li.quest/v1/quote — single same-chain swap or cross-chain bridge.
// Supports most EVM chains (1, 42161, 8453, 56, 5000, …) via numeric chainId.
const LIFI_API = "https://li.quest/v1";

async function lifiQuote(
  chainId: number,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  fromAddress: string,
  slippagePct: string,
): Promise<{ to: string; data: string; value: string; outAmount: string }> {
  const params = new URLSearchParams({
    fromChain: String(chainId),
    toChain: String(chainId),
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    slippage: (Number(slippagePct) / 100).toFixed(4),
  });
  const url = `${LIFI_API}/quote?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LI.FI quote failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const txReq = json.transactionRequest as Record<string, unknown> | undefined;
  if (!txReq) throw new Error("LI.FI: no transactionRequest in response");
  const estimate = json.estimate as Record<string, unknown> | undefined;
  return {
    to: String(txReq.to),
    data: String(txReq.data),
    value: String(txReq.value ?? "0x0"),
    outAmount: String(estimate?.toAmount ?? "0"),
  };
}

// ── Relay (multi-chain via chainId) ──
//
// API: POST https://api.relay.link/quote — single-chain swap or cross-chain.
// Returns a multi-step plan; we always execute the first item (same-chain swap = single step).
const RELAY_API = "https://api.relay.link";

async function relayQuote(
  chainId: number,
  fromToken: string,
  toToken: string,
  amount: string,
  user: string,
): Promise<{ to: string; data: string; value: string; outAmount: string }> {
  const body = {
    user,
    originChainId: chainId,
    destinationChainId: chainId,
    originCurrency: fromToken,
    destinationCurrency: toToken,
    recipient: user,
    tradeType: "EXACT_INPUT",
    amount,
  };
  const res = await fetch(`${RELAY_API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Relay quote failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as Record<string, unknown>;
  const steps = json.steps as Array<Record<string, unknown>> | undefined;
  // Relay returns multiple steps (approve + swap). The executor handles approval via
  // the `approvals` array, so take the swap step (skipping any "approve" step).
  const swapStep = steps?.find((s) => s.id !== "approve") ?? steps?.[steps.length - 1];
  const items = swapStep?.items as Array<Record<string, unknown>> | undefined;
  const txData = items?.[0]?.data as Record<string, unknown> | undefined;
  if (!txData) throw new Error("Relay: no swap step in quote");
  const details = json.details as Record<string, unknown> | undefined;
  const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
  return {
    to: String(txData.to),
    data: String(txData.data),
    value: String(txData.value ?? "0x0"),
    outAmount: String(currencyOut?.amount ?? "0"),
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
    .description("Swap tokens via DEX aggregator (KyberSwap, OpenOcean, LiquidSwap, LI.FI, Relay)")
    .requiredOption("--from <token>", "Input token symbol or address")
    .requiredOption("--to <token>", "Output token symbol or address")
    .requiredOption("--amount <amount>", "Amount of input token in wei")
    .option("--provider <name>", "Aggregator: kyber, openocean, liquid, lifi, relay", "kyber")
    .option("--slippage <bps>", "Slippage tolerance in bps", "50")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const registry = Registry.loadEmbedded();
      const provider = (opts.provider as string).toLowerCase();
      const slippageBps = parseInt(opts.slippage as string, 10);

      // Resolve token addresses
      const fromAddr: string = resolveTokenAddress(registry, chainName, opts.from as string);
      const toAddr: string = resolveTokenAddress(registry, chainName, opts.to as string);

      const wallet = resolveWallet();

      if (provider === "kyber") {
        const aggCfg = getAggregatorSlugs(registry.getChain(chainName));
        if (!aggCfg.kyber) {
          const supported = Array.from(registry.chains.keys()).filter((c) => registry.getChain(c).aggregators?.kyber).join(", ");
          printOutput({ error: `KyberSwap: unsupported chain '${chainName}'. Supported: ${supported || "(none)"}` }, getOpts());
          return;
        }
        const kyberChain = aggCfg.kyber;

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
            value: parseBigIntValue(txData.value),
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
          printOutput({ error: `KyberSwap error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "openocean") {
        const aggCfg = getAggregatorSlugs(registry.getChain(chainName));
        if (!aggCfg.openocean) {
          const supported = Array.from(registry.chains.keys()).filter((c) => registry.getChain(c).aggregators?.openocean).join(", ");
          printOutput({ error: `OpenOcean: unsupported chain '${chainName}'. Supported: ${supported || "(none)"}` }, getOpts());
          return;
        }
        const ooChain = aggCfg.openocean;
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

          // Native gas tokens are paid via tx.value, not pulled by the router,
          // so attaching an approvals[] entry would just trigger a doomed
          // allowance() probe in dry-run / a no-op approve in broadcast.
          // The executor's sentinel-skip is a safety net; suppressing the
          // entry here keeps dry-run output honest about what actually moves.
          const fromLower = (fromAddr as string).toLowerCase();
          const isNativeInput =
            fromLower === "0x0000000000000000000000000000000000000000" ||
            fromLower === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
          const tx = {
            description: `OpenOcean: swap ${opts.amount} of ${fromAddr} -> ${toAddr}`,
            to: swap.to as Address,
            data: swap.data as `0x${string}`,
            value: parseBigIntValue(swap.value),
            ...(isNativeInput
              ? {}
              : { approvals: [{ token: fromAddr as Address, spender: swap.to as Address, amount: BigInt(opts.amount as string) }] }),
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
          printOutput({ error: `OpenOcean error: ${errMsg(e)}` }, getOpts());
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
            value: parseBigIntValue(route.value),
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
          printOutput({ error: `LiquidSwap error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "lifi" || provider === "relay") {
        const chainCfg = registry.getChain(chainName);
        const chainId = chainCfg.chain_id;
        if (!chainId) {
          printOutput({ error: `${provider}: chain '${chainName}' has no chain_id in registry` }, getOpts());
          return;
        }
        const slippagePct = (slippageBps / 100).toFixed(2);
        try {
          const route = provider === "lifi"
            ? await lifiQuote(chainId, fromAddr, toAddr, opts.amount as string, wallet, slippagePct)
            : await relayQuote(chainId, fromAddr, toAddr, opts.amount as string, wallet);
          const tx = {
            description: `${provider}: swap ${opts.amount} of ${fromAddr} -> ${toAddr}`,
            to: route.to as Address,
            data: route.data as `0x${string}`,
            value: parseBigIntValue(route.value),
            approvals: [{ token: fromAddr as Address, spender: route.to as Address, amount: BigInt(opts.amount as string) }],
          };
          const result = await executor.execute(tx);
          printOutput({
            provider,
            chain: chainName,
            chain_id: chainId,
            from_token: fromAddr,
            to_token: toAddr,
            amount_in: opts.amount,
            amount_out: route.outAmount,
            router: route.to,
            ...result,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `${provider} error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      printOutput({ error: `Unknown provider '${opts.provider}'. Choose: kyber, openocean, liquid, lifi, relay` }, getOpts());
    });
}
