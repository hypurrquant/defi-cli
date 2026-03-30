import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { Registry } from "@hypurrquant/defi-core";
import type { Address } from "viem";

const LIFI_API = "https://li.quest/v1";
const DLN_API = "https://dln.debridge.finance/v1.0/dln/order";
const CCTP_FEE_API = "https://iris-api.circle.com/v2/burn/USDC/fees";

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

// Native USDC addresses per chain
const CCTP_USDC_ADDRESSES: Record<string, string> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

async function getCctpFeeEstimate(
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

export function registerBridge(parent: Command, getOpts: () => OutputMode): void {
  parent
    .command("bridge")
    .description("Cross-chain bridge: move assets between chains")
    .requiredOption("--token <token>", "Token symbol or address")
    .requiredOption("--amount <amount>", "Amount in wei")
    .requiredOption("--to-chain <chain>", "Destination chain name")
    .option("--recipient <address>", "Recipient address on destination chain")
    .option("--slippage <bps>", "Slippage in bps (LI.FI only)", "50")
    .option("--provider <name>", "Bridge provider: lifi, debridge, cctp", "lifi")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const fromChain = registry.getChain(chainName);
      const toChain = registry.getChain(opts.toChain);
      const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
      const recipient = (opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001") as Address;
      const provider = (opts.provider as string).toLowerCase();

      if (provider === "debridge") {
        try {
          const srcId = DLN_CHAIN_IDS[chainName] ?? fromChain.chain_id;
          const dstId = DLN_CHAIN_IDS[opts.toChain] ?? toChain.chain_id;

          const result = await getDebridgeQuote(
            srcId, dstId,
            tokenAddr, tokenAddr,
            opts.amount,
            recipient,
          );

          const tx = (result.raw as Record<string, unknown>).tx as Record<string, unknown> | undefined;
          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: tokenAddr, amount: opts.amount,
            bridge: "deBridge DLN",
            estimated_output: result.amountOut,
            estimated_time_seconds: result.estimatedTime,
            tx: tx ? { to: tx.to, data: tx.data, value: tx.value } : undefined,
          }, getOpts());
        } catch (e) {
          printOutput({ error: `deBridge API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
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

          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: usdcSrc,
            token_dst: usdcDst ?? tokenAddr,
            amount: opts.amount,
            bridge: "Circle CCTP V2",
            estimated_fee_usdc: fee,
            estimated_output: String(BigInt(opts.amount) - maxFeeSubunits),
            note: "After burn, poll https://iris-api.circle.com/v2/messages/{srcDomain} for attestation, then call MessageTransmitter.receiveMessage() on destination",
            tx: {
              to: CCTP_TOKEN_MESSENGER_V2,
              data,
              value: "0x0",
            },
          }, getOpts());
        } catch (e) {
          printOutput({ error: `CCTP error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
        }
        return;
      }

      // Default: LI.FI
      try {
        const params = new URLSearchParams({
          fromChain: String(fromChain.chain_id), toChain: String(toChain.chain_id),
          fromToken: tokenAddr, toToken: tokenAddr,
          fromAmount: opts.amount, fromAddress: recipient,
          slippage: String(parseInt(opts.slippage) / 10000),
        });
        const res = await fetch(`${LIFI_API}/quote?${params}`);
        const quote = await res.json() as any;

        if (quote.transactionRequest) {
          printOutput({
            from_chain: fromChain.name, to_chain: toChain.name,
            token: tokenAddr, amount: opts.amount,
            bridge: quote.toolDetails?.name ?? "LI.FI",
            estimated_output: quote.estimate?.toAmount,
            tx: { to: quote.transactionRequest.to, data: quote.transactionRequest.data, value: quote.transactionRequest.value },
          }, getOpts());
        } else {
          printOutput({ error: "No LI.FI route found", details: quote }, getOpts());
        }
      } catch (e) {
        printOutput({ error: `LI.FI API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
      }
    });
}
