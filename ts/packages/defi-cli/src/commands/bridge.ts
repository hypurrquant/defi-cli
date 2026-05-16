import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address, Hex, Chain } from "viem";
import { requireChain, resolveWallet, errMsg } from "../utils.js";

function resolveDestExecutor(slug: string, broadcast: boolean): Executor {
  const registry = Registry.loadEmbedded();
  try {
    const c = registry.getChain(slug);
    return new Executor(broadcast, c.effectiveRpcUrl(), c.explorer_url, c.viemChain() as unknown as Chain);
  } catch {
    const envKey = `${slug.toUpperCase()}_RPC_URL`;
    const envVal = process.env[envKey];
    const meta = DEST_CHAIN_META[slug];
    if (!meta) throw new Error(`Cannot resolve destination chain: ${slug}`);
    const rpc = envVal ?? DEST_RPC_FALLBACKS[slug];
    if (!rpc) throw new Error(`No RPC URL for ${slug}. Set ${envKey} or use a registered chain.`);
    const minimal: Chain = {
      id: meta.chain_id,
      name: meta.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    };
    return new Executor(broadcast, rpc, undefined, minimal);
  }
}

async function pollCctpAttestation(
  srcDomain: number,
  burnTxHash: string,
  maxSeconds: number,
): Promise<{ message: Hex; attestation: Hex }> {
  const intervalMs = 5000;
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://iris-api.circle.com/v2/messages/${srcDomain}?transactionHash=${burnTxHash}`);
      if (res.ok) {
        const data = await res.json() as { messages?: Array<{ message: string; attestation: string; status?: string }> };
        const m = data.messages?.[0];
        if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") {
          return { message: m.message as Hex, attestation: m.attestation as Hex };
        }
      }
    } catch { /* retry */ }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`CCTP attestation timeout after ${maxSeconds}s for tx ${burnTxHash}`);
}

const LIFI_API = "https://li.quest/v1";
const DLN_API = "https://dln.debridge.finance/v1.0/dln/order";
const CCTP_FEE_API = "https://iris-api.circle.com/v2/burn/USDC/fees";
// Relay (https://docs.relay.link) — uses the same /quote endpoint as swap,
// but with `originChainId != destinationChainId` it routes cross-chain.
const RELAY_API = "https://api.relay.link";

// Bridge destinations beyond the source-chain registry.
// These chains are not registered for source operations (lending/LP/swap) but
// are valid CCTP/LI.FI/deBridge destinations.
export const DEST_CHAIN_META: Record<string, { chain_id: number; name: string }> = {
  ethereum: { chain_id: 1, name: "Ethereum" },
  optimism: { chain_id: 10, name: "Optimism" },
  polygon: { chain_id: 137, name: "Polygon" },
  arbitrum: { chain_id: 42161, name: "Arbitrum" },
  avalanche: { chain_id: 43114, name: "Avalanche" },
  linea: { chain_id: 59144, name: "Linea" },
  zksync: { chain_id: 324, name: "zkSync" },
};

export function resolveDestChain(registry: Registry, slug: string): { chain_id: number; name: string } {
  try {
    const c = registry.getChain(slug);
    return { chain_id: c.chain_id, name: c.name };
  } catch {
    const meta = DEST_CHAIN_META[slug];
    if (!meta) {
      throw new Error(
        `Unknown destination chain '${slug}'. Source chains: hyperevm, mantle, base, bnb, monad. ` +
        `Bridge destinations also include: ${Object.keys(DEST_CHAIN_META).join(", ")}.`,
      );
    }
    return meta;
  }
}

// ── deBridge DLN ──

const DLN_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bnb: 56,
  polygon: 137,
  arbitrum: 42161,
  avalanche: 43114,
  base: 8453,
  linea: 59144,
  zksync: 324,
};

async function getDebridgeQuote(
  srcChainId: number,
  dstChainId: number,
  srcToken: string,
  dstToken: string,
  amountRaw: string,
  recipient: string,
): Promise<{ amountOut: string; estimatedTime: number; raw: unknown }> {
  const params = new URLSearchParams({
    srcChainId: String(srcChainId),
    srcChainTokenIn: srcToken,
    srcChainTokenInAmount: amountRaw,
    dstChainId: String(dstChainId),
    dstChainTokenOut: dstToken,
    prependOperatingExpenses: "true",
  });

  const res = await fetch(`${DLN_API}/quote?${params}`);
  if (!res.ok) throw new Error(`deBridge quote failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as Record<string, unknown>;

  const estimation = data.estimation as Record<string, unknown>;
  const dstOut = estimation?.dstChainTokenOut as Record<string, unknown>;
  const amountOut = String(dstOut?.recommendedAmount ?? dstOut?.amount ?? "0");
  const fulfillDelay = Number((data.order as Record<string, unknown>)?.approximateFulfillmentDelay ?? 10);

  // Get create-tx data for the transaction
  const createParams = new URLSearchParams({
    srcChainId: String(srcChainId),
    srcChainTokenIn: srcToken,
    srcChainTokenInAmount: amountRaw,
    dstChainId: String(dstChainId),
    dstChainTokenOut: dstToken,
    dstChainTokenOutAmount: amountOut,
    dstChainTokenOutRecipient: recipient,
    srcChainOrderAuthorityAddress: recipient,
    dstChainOrderAuthorityAddress: recipient,
    prependOperatingExpenses: "true",
  });

  const createRes = await fetch(`${DLN_API}/create-tx?${createParams}`);
  if (!createRes.ok) throw new Error(`deBridge create-tx failed: ${createRes.status} ${await createRes.text()}`);
  const createData = await createRes.json() as Record<string, unknown>;

  return {
    amountOut,
    estimatedTime: fulfillDelay,
    raw: createData,
  };
}

// ── Relay (cross-chain via origin≠destination chainIds) ──

async function getRelayBridgeQuote(
  srcChainId: number,
  dstChainId: number,
  srcToken: string,
  dstToken: string,
  amountRaw: string,
  user: string,
  recipient: string,
): Promise<{ to: string; data: string; value: string; amountOut: string; estimatedTime: number; tool: string; raw: unknown }> {
  const body = {
    user,
    recipient,
    originChainId: srcChainId,
    destinationChainId: dstChainId,
    originCurrency: srcToken,
    destinationCurrency: dstToken,
    tradeType: "EXACT_INPUT",
    amount: amountRaw,
  };
  const res = await fetch(`${RELAY_API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let code = "";
    let msg = text;
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      code = String(j.errorCode ?? j.code ?? "");
      msg = String(j.message ?? text);
    } catch { /* response not JSON */ }
    const hints: Record<string, string> = {
      AMOUNT_TOO_LOW: "Try a larger amount or use --provider lifi (Relay enforces a per-route fee floor)",
      INVALID_INPUT_CURRENCY: "Source token unsupported by Relay on this chain — try --provider lifi",
      INVALID_OUTPUT_CURRENCY: "Destination token unsupported by Relay on this chain — try --provider lifi or change --token",
      NO_QUOTES: "No Relay liquidity for this route right now — try --provider lifi or retry later",
      AMOUNT_TOO_HIGH: "Amount exceeds Relay per-tx cap — split into smaller amounts",
      UNSUPPORTED_CHAIN: "Relay does not support this origin/destination chain — use --provider lifi",
    };
    const hint = hints[code];
    const detail = code ? `${code}: ${msg}` : msg;
    throw new Error(`Relay quote failed (${res.status}): ${detail}${hint ? ` — ${hint}` : ""}`);
  }
  const json = await res.json() as Record<string, unknown>;
  // Relay returns multiple steps for cross-chain (often: approve → deposit). Skip
  // any "approve" step — the executor handles ERC20 approvals via `approvals[]`.
  const steps = json.steps as Array<Record<string, unknown>> | undefined;
  const swapStep = steps?.find((s) => s.id !== "approve") ?? steps?.[steps?.length ?? 1 - 1];
  const items = swapStep?.items as Array<Record<string, unknown>> | undefined;
  const txData = items?.[0]?.data as Record<string, unknown> | undefined;
  if (!txData) throw new Error("Relay: no executable step in cross-chain quote");
  const details = json.details as Record<string, unknown> | undefined;
  const currencyOut = details?.currencyOut as Record<string, unknown> | undefined;
  const timeEst = (details?.timeEstimate as number | undefined) ?? 30;
  return {
    to: String(txData.to),
    data: String(txData.data),
    value: String(txData.value ?? "0x0"),
    amountOut: String(currencyOut?.amount ?? "0"),
    estimatedTime: timeEst,
    tool: String((swapStep?.id as string | undefined) ?? "relay"),
    raw: json,
  };
}

// ── Circle CCTP ──

// CCTP domains per chain (V2)
const CCTP_DOMAINS: Record<string, number> = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  solana: 5,
  base: 6,
  polygon: 7,
  sui: 8,
  aptos: 9,
};

// TokenMessenger V2 contract address (same on all EVM chains)
const CCTP_TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";

// MessageTransmitter V2 contract address (same on all EVM V2 chains)
const CCTP_MESSAGE_TRANSMITTER_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

// Public-RPC fallbacks for non-registry destination chains. Override per chain
// via `<UPPER>_RPC_URL` (e.g. ETHEREUM_RPC_URL, ARBITRUM_RPC_URL).
const DEST_RPC_FALLBACKS: Record<string, string> = {
  ethereum: "https://eth.merkle.io",
  arbitrum: "https://arbitrum.drpc.org",
  optimism: "https://optimism.drpc.org",
  polygon: "https://polygon.drpc.org",
  avalanche: "https://avalanche.drpc.org",
  linea: "https://linea.drpc.org",
  zksync: "https://zksync.drpc.org",
};

// Native USDC addresses per chain
const CCTP_USDC_ADDRESSES: Record<string, string> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

/**
 * CCTP min-fee guard (v1.0.7). When the burn amount cannot cover the protocol
 * fee, return a structured error envelope instead of letting the depositForBurn
 * path return a negative `estimated_output`. Returns `null` when the amount is
 * sufficient.
 */
export function cctpMinFeeGuard(
  amountWei: bigint,
  maxFeeSubunits: bigint,
  feeUsdc: number,
): { error: string; minimum_amount_wei: string; minimum_amount_usdc: number } | null {
  if (amountWei <= maxFeeSubunits) {
    const amountUsdc = Number(amountWei) / 1e6;
    return {
      error: `CCTP: amount ${amountWei.toString()} (${amountUsdc} USDC) is below the minimum bridge fee of ${maxFeeSubunits} (${feeUsdc} USDC). Increase --amount.`,
      minimum_amount_wei: maxFeeSubunits.toString(),
      minimum_amount_usdc: feeUsdc,
    };
  }
  return null;
}

export async function getCctpFeeEstimate(
  srcDomain: number,
  dstDomain: number,
  amountUsdc: number,
): Promise<{ fee: number; maxFeeSubunits: bigint }> {
  try {
    const res = await fetch(`${CCTP_FEE_API}/${srcDomain}/${dstDomain}`);
    if (res.ok) {
      const schedules = await res.json() as Array<{
        finalityThreshold: number;
        minimumFee: number;
        forwardFee?: { low: number; med: number; high: number };
      }>;
      // Use standard finality (2000) schedule
      const schedule = schedules.find(s => s.finalityThreshold === 2000) ?? schedules[0];
      if (schedule) {
        const amountSubunits = BigInt(Math.round(amountUsdc * 1e6));
        const bpsRounded = BigInt(Math.round(schedule.minimumFee * 100));
        const protocolFee = (amountSubunits * bpsRounded) / 1_000_000n;
        const protocolFeeBuffered = (protocolFee * 120n) / 100n;

        if (schedule.forwardFee) {
          const forwardFeeSubunits = BigInt(schedule.forwardFee.high);
          const totalMaxFee = protocolFeeBuffered + forwardFeeSubunits;
          return { fee: Number(totalMaxFee) / 1e6, maxFeeSubunits: totalMaxFee };
        }

        const minFee = protocolFeeBuffered > 0n ? protocolFeeBuffered : 10000n;
        return { fee: Number(minFee) / 1e6, maxFeeSubunits: minFee };
      }
    }
  } catch {
    // use fallback
  }
  return { fee: 0.25, maxFeeSubunits: 250000n };
}

export function registerBridge(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  parent
    .command("bridge")
    .description("Cross-chain bridge: move assets between chains")
    // `--token` is the long-standing name; `--asset` is the alias added in
    // 2026-05-16 to align with `price` / `lending` / `yield`. Both accepted.
    .option("--token <token>", "Token symbol or address (alias: --asset)")
    .option("--asset <token>", "Token symbol or address (alias: --token)")
    .requiredOption("--amount <amount>", "Amount in wei")
    .requiredOption("--to-chain <chain>", "Destination chain name")
    .option("--recipient <address>", "Recipient address on destination chain")
    .option("--slippage <bps>", "Slippage in bps (LI.FI only)", "50")
    .option("--provider <name>", "Bridge provider: lifi, relay, debridge, cctp", "lifi")
    .option("--auto-receive", "(CCTP only) After burn, poll Circle attestation and auto-call MessageTransmitter.receiveMessage on destination", false)
    .option("--receive-timeout <seconds>", "(CCTP --auto-receive) max seconds to wait for attestation", "1200")
    .action(async (opts) => {
      const chainName = requireChain(parent, getOpts);
      if (!chainName) return;
      const tokenArg = (opts.asset ?? opts.token) as string | undefined;
      if (!tokenArg) { printOutput({ error: "--token (or --asset) is required" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const fromChain = registry.getChain(chainName);
      let toChain: { chain_id: number; name: string };
      try {
        toChain = resolveDestChain(registry, opts.toChain);
      } catch (e) {
        printOutput({ error: errMsg(e) }, getOpts());
        return;
      }
      const tokenAddr = tokenArg.startsWith("0x") ? tokenArg : registry.resolveToken(chainName, tokenArg).address;
      // Resolve the destination-chain equivalent of `--token`. Cross-chain
      // bridges need separate src/dst addresses because the same symbol (USDC,
      // USDT, WETH, …) lives at different contract addresses on each chain.
      // Symbol input → registry lookup on dst (if registered) → source-addr
      // fallback. Hex input → reuse on dst (caller knows what they want).
      let dstTokenAddr = tokenAddr;
      if (!tokenArg.startsWith("0x")) {
        try {
          dstTokenAddr = registry.resolveToken(opts.toChain, tokenArg).address;
        } catch {
          // Destination chain isn't registered or symbol not listed on it.
          // Fall back to the source address — works for native bridges (LI.FI,
          // Relay) where the protocol may emit the wrapped/native equivalent
          // automatically; will surface a route error from the provider when
          // the same address truly doesn't exist on the destination.
        }
      }
      const recipient = resolveWallet(opts.recipient);
      const provider = (opts.provider as string).toLowerCase();

      if (provider === "relay") {
        try {
          const result = await getRelayBridgeQuote(
            fromChain.chain_id, toChain.chain_id,
            tokenAddr, dstTokenAddr,
            opts.amount,
            recipient, recipient,
          );
          const isNative = tokenAddr.toLowerCase() === "0x0000000000000000000000000000000000000000";
          const executor = makeExecutor();
          const approvals = isNative ? [] : [{
            token: tokenAddr as Address,
            spender: result.to as Address,
            amount: BigInt(opts.amount),
          }];
          const action = await executor.execute({
            to: result.to as Address,
            data: result.data as Hex,
            value: BigInt(result.value || "0"),
            description: `Relay bridge ${fromChain.name} → ${toChain.name}`,
            approvals,
          });
          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: tokenAddr, amount: opts.amount,
            bridge: `Relay (${result.tool})`,
            estimated_output: result.amountOut,
            estimated_time_seconds: result.estimatedTime,
            action,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `Relay API error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "debridge") {
        try {
          const srcId = DLN_CHAIN_IDS[chainName] ?? fromChain.chain_id;
          const dstId = DLN_CHAIN_IDS[opts.toChain] ?? toChain.chain_id;

          const result = await getDebridgeQuote(
            srcId, dstId,
            tokenAddr, dstTokenAddr,
            opts.amount,
            recipient,
          );

          const tx = (result.raw as Record<string, unknown>).tx as Record<string, unknown> | undefined;
          if (!tx?.to || !tx?.data) {
            printOutput({ error: "deBridge: API did not return a tx envelope" }, getOpts());
            return;
          }
          const isNative = tokenAddr.toLowerCase() === "0x0000000000000000000000000000000000000000";
          const executor = makeExecutor();
          const approvals = isNative ? [] : [{
            token: tokenAddr as Address,
            spender: tx.to as Address,
            amount: BigInt(opts.amount),
          }];
          const action = await executor.execute({
            to: tx.to as Address,
            data: tx.data as Hex,
            value: BigInt((tx.value as string) ?? "0"),
            description: `deBridge DLN ${fromChain.name} → ${toChain.name}`,
            approvals,
          });
          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: tokenAddr, amount: opts.amount,
            bridge: "deBridge DLN",
            estimated_output: result.amountOut,
            estimated_time_seconds: result.estimatedTime,
            action,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `deBridge API error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      if (provider === "cctp") {
        try {
          const srcDomain = CCTP_DOMAINS[chainName];
          const dstDomain = CCTP_DOMAINS[opts.toChain];

          if (srcDomain === undefined) {
            printOutput({ error: `CCTP not supported on source chain: ${chainName}. Supported: ${Object.keys(CCTP_DOMAINS).join(", ")}` }, getOpts());
            return;
          }
          if (dstDomain === undefined) {
            printOutput({ error: `CCTP not supported on destination chain: ${opts.toChain}. Supported: ${Object.keys(CCTP_DOMAINS).join(", ")}` }, getOpts());
            return;
          }

          const usdcSrc = CCTP_USDC_ADDRESSES[chainName];
          const usdcDst = CCTP_USDC_ADDRESSES[opts.toChain];
          if (!usdcSrc) {
            printOutput({ error: `No native USDC address known for ${chainName}. CCTP requires native USDC.` }, getOpts());
            return;
          }

          const amountUsdc = Number(BigInt(opts.amount)) / 1e6;
          const { fee, maxFeeSubunits } = await getCctpFeeEstimate(srcDomain, dstDomain, amountUsdc);

          // Reject when the burn amount cannot cover the protocol fee — otherwise
          // we'd return negative output and the depositForBurn would revert.
          const guardErr = cctpMinFeeGuard(BigInt(opts.amount), maxFeeSubunits, fee);
          if (guardErr) {
            printOutput(guardErr, getOpts());
            return;
          }

          // Build depositForBurn call data
          // TokenMessenger V2: depositForBurn(amount, destinationDomain, mintRecipient, burnToken, maxFee, minFinalityThreshold)
          // mintRecipient must be 32 bytes (left-padded address)
          const recipientPadded = `0x${"0".repeat(24)}${recipient.replace("0x", "").toLowerCase()}` as `0x${string}`;

          const { encodeFunctionData, parseAbi } = await import("viem");
          const tokenMessengerAbi = parseAbi([
            "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)",
          ]);

          const data = encodeFunctionData({
            abi: tokenMessengerAbi,
            functionName: "depositForBurn",
            args: [
              BigInt(opts.amount),
              dstDomain,
              recipientPadded as `0x${string}`,
              usdcSrc as Address,
              `0x${"0".repeat(64)}` as `0x${string}`, // any caller
              maxFeeSubunits,
              2000, // standard finality
            ],
          });

          const executor = makeExecutor();
          const burnAction = await executor.execute({
            to: CCTP_TOKEN_MESSENGER_V2 as Address,
            data: data as Hex,
            value: 0n,
            description: `CCTP burn ${fromChain.name} → ${toChain.name}`,
            approvals: [{
              token: usdcSrc as Address,
              spender: CCTP_TOKEN_MESSENGER_V2 as Address,
              amount: BigInt(opts.amount),
            }],
          });

          let receiveAction: unknown = undefined;
          if (opts.autoReceive && burnAction.tx_hash && burnAction.status === "confirmed") {
            try {
              const timeoutSec = parseInt(opts.receiveTimeout) || 1200;
              process.stderr.write(`Polling Circle attestation for ${burnAction.tx_hash} (max ${timeoutSec}s)...\n`);
              const { message, attestation } = await pollCctpAttestation(srcDomain, burnAction.tx_hash, timeoutSec);
              process.stderr.write(`Attestation ready. Calling receiveMessage on ${opts.toChain}...\n`);

              const { encodeFunctionData: encReceive, parseAbi: parseAbiReceive } = await import("viem");
              const receiveAbi = parseAbiReceive([
                "function receiveMessage(bytes message, bytes attestation) external",
              ]);
              const receiveData = encReceive({
                abi: receiveAbi,
                functionName: "receiveMessage",
                args: [message, attestation],
              });
              const destExecutor = resolveDestExecutor(opts.toChain, !!parent.opts().broadcast);
              receiveAction = await destExecutor.execute({
                to: CCTP_MESSAGE_TRANSMITTER_V2 as Address,
                data: receiveData as Hex,
                value: 0n,
                description: `CCTP receive on ${toChain.name}`,
                approvals: [],
              });
            } catch (e) {
              receiveAction = { error: `auto-receive failed: ${errMsg(e)}` };
            }
          }

          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: usdcSrc,
            token_dst: usdcDst ?? tokenAddr,
            amount: opts.amount,
            bridge: "Circle CCTP V2",
            estimated_fee_usdc: fee,
            estimated_output: String(BigInt(opts.amount) - maxFeeSubunits),
            burn: burnAction,
            receive: receiveAction,
            note: opts.autoReceive
              ? undefined
              : "Pass --auto-receive to poll Circle attestation and auto-call MessageTransmitter.receiveMessage on the destination chain.",
          }, getOpts());
        } catch (e) {
          printOutput({ error: `CCTP error: ${errMsg(e)}` }, getOpts());
        }
        return;
      }

      // Default: LI.FI
      try {
        const params = new URLSearchParams({
          fromChain: String(fromChain.chain_id), toChain: String(toChain.chain_id),
          fromToken: tokenAddr, toToken: dstTokenAddr,
          fromAmount: opts.amount, fromAddress: recipient,
          slippage: String(parseInt(opts.slippage) / 10000),
        });
        const res = await fetch(`${LIFI_API}/quote?${params}`);
        const quote = await res.json() as any;

        if (!quote.transactionRequest) {
          printOutput({ error: "No LI.FI route found", details: quote }, getOpts());
          return;
        }
        const isNative = tokenAddr.toLowerCase() === "0x0000000000000000000000000000000000000000";
        const spender = (quote.estimate?.approvalAddress ?? quote.transactionRequest.to) as Address;
        const executor = makeExecutor();
        const approvals = isNative ? [] : [{
          token: tokenAddr as Address,
          spender,
          amount: BigInt(opts.amount),
        }];
        const action = await executor.execute({
          to: quote.transactionRequest.to as Address,
          data: quote.transactionRequest.data as Hex,
          value: BigInt(quote.transactionRequest.value ?? "0"),
          description: `LI.FI ${fromChain.name} → ${toChain.name}`,
          approvals,
        });
        printOutput({
          from_chain: fromChain.name, to_chain: toChain.name,
          token: tokenAddr, amount: opts.amount,
          bridge: quote.toolDetails?.name ?? "LI.FI",
          estimated_output: quote.estimate?.toAmount,
          action,
        }, getOpts());
      } catch (e) {
        printOutput({ error: `LI.FI API error: ${errMsg(e)}` }, getOpts());
      }
    });
}
