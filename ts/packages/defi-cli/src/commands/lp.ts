import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import type { Address, Hex } from "viem";
import { parseAbi, encodeFunctionData, decodeFunctionResult, createPublicClient, http, zeroAddress } from "viem";
import { multicallRead, decodeU256 } from "@hypurrquant/defi-core";
import {
  createDex,
  createGauge,
  createKittenSwapFarming,
  createMerchantMoeLB,
  createLending,
  createNestOffChain,
} from "@hypurrquant/defi-protocols";
import { loadWhitelist } from "../whitelist.js";
import type { WhitelistEntry } from "../whitelist.js";
import { resolveWalletWithSigner } from "../signer/resolve.js";

/** Resolve the wallet owner address from options or env vars (including OWS wallets) */
function resolveAccount(optOwner?: string, optWallet?: string): Address {
  if (optOwner) return optOwner as Address;
  const { address } = resolveWalletWithSigner(optWallet ? { wallet: optWallet } : undefined);
  return address;
}

interface PipelineStep {
  step: "mint" | "stake" | "claim" | "collect";
  function: string;
  optional?: boolean;
  note?: string;
  cli_command?: string;
}

interface PipelineInput {
  chain?: string;
  pool?: string;
  tokenA?: string;
  tokenB?: string;
  amountA?: string;
  amountB?: string;
  tickLower?: string;
  tickUpper?: string;
  range?: string;
  tokenId?: string;
  gauge?: string;
}

/** Build a CLI command string with provided args inlined and `<placeholder>` for unknowns */
function buildCmd(parts: Array<[string, string | undefined, string]>): string {
  // parts: [flag, value, placeholder]
  const segs: string[] = [];
  for (const [flag, value, placeholder] of parts) {
    segs.push(`${flag} ${value ?? `<${placeholder}>`}`);
  }
  return segs.join(" ");
}

/**
 * Translate a protocol's reward_strategy into the on-chain function sequence
 * a caller must execute. cli_command fields are filled with provided args
 * (or `<placeholder>` for unknown values).
 */
function buildPipelineSteps(
  p: { slug: string; reward_strategy?: string; interface?: string },
  input: PipelineInput = {},
): PipelineStep[] {
  const slug = p.slug;
  const chainFlag = input.chain ? `--chain ${input.chain} ` : "";
  const baseAdd = `defi ${chainFlag}lp add ` + buildCmd([
    ["--protocol", slug, "slug"],
    ["--token-a", input.tokenA, "token-a"],
    ["--token-b", input.tokenB, "token-b"],
    ["--amount-a", input.amountA, "amount-a"],
    ["--amount-b", input.amountB, "amount-b"],
    ...(input.pool ? [["--pool", input.pool, "pool"] as [string, string, string]] : []),
    ...(input.tickLower ? [["--tick-lower", input.tickLower, "tick-lower"] as [string, string, string]] : []),
    ...(input.tickUpper ? [["--tick-upper", input.tickUpper, "tick-upper"] as [string, string, string]] : []),
    ...(input.range ? [["--range", input.range, "range"] as [string, string, string]] : []),
  ]);
  const baseFarm = `defi ${chainFlag}lp farm ` + buildCmd([
    ["--protocol", slug, "slug"],
    ["--token-a", input.tokenA, "token-a"],
    ["--token-b", input.tokenB, "token-b"],
    ["--amount-a", input.amountA, "amount-a"],
    ["--amount-b", input.amountB, "amount-b"],
    ...(input.pool ? [["--pool", input.pool, "pool"] as [string, string, string]] : []),
  ]);
  const claimWithTokenId = (extra = "") => `defi ${chainFlag}lp claim ` + buildCmd([
    ["--protocol", slug, "slug"],
    ["--token-id", input.tokenId, "token-id-from-mint-result"],
    ...(input.pool ? [["--pool", input.pool, "pool"] as [string, string, string]] : []),
    ...(input.gauge ? [["--gauge", input.gauge, "gauge"] as [string, string, string]] : []),
  ]) + extra;
  const claimWithGauge = () => `defi ${chainFlag}lp claim ` + buildCmd([
    ["--protocol", slug, "slug"],
    ["--gauge", input.gauge, "gauge-from-voter.gaugeForPool"],
  ]);
  // Ramses CL auto_stake (uniswap_v3 interface): claim path goes through
  // NPM.getPeriodReward which needs the position tokenId in addition to the
  // gauge address. Earlier pipeline output omitted --token-id so the printed
  // copy-paste command failed at the CLI before reaching the on-chain call.
  const claimAutoStakeNftGauge = () => `defi ${chainFlag}lp claim ` + buildCmd([
    ["--protocol", slug, "slug"],
    ["--gauge", input.gauge, "gauge-from-voter.gaugeForPool"],
    ["--token-id", input.tokenId, "token-id-from-mint-result"],
  ]);

  switch (p.reward_strategy) {
    case "lp_fee_only":
      return [
        { step: "mint", function: "NPM.mint(MintParams)", cli_command: baseAdd },
        { step: "collect", function: "NPM.collect(tokenId, recipient)", note: "No emissions; collects accrued LP trading fees only", cli_command: claimWithTokenId() },
      ];
    case "on_chain_farming_center":
      return [
        { step: "mint", function: "NPM.mint(MintParams)", cli_command: baseAdd },
        { step: "stake", function: "farmingCenter.enterFarming(incentiveKey, tokenId)", cli_command: baseFarm, note: "lp farm chains mint+stake into one tx sequence" },
        { step: "claim", function: "farmingCenter.collectRewards(incentiveKey, tokenId)", cli_command: claimWithTokenId() },
      ];
    case "on_chain_gauge_tokenid":
      return [
        { step: "mint", function: "NPM.mint(MintParams)", cli_command: baseAdd },
        { step: "stake", function: "gauge.deposit(tokenId)", cli_command: baseFarm, note: "lp farm chains mint+stake into one tx sequence" },
        { step: "claim", function: "gauge.earned(tokenId) → gauge.getReward(tokenId)", cli_command: claimWithTokenId() },
      ];
    case "on_chain_gauge":
      return [
        { step: "mint", function: "Router.addLiquidity / NPM.mint", cli_command: baseAdd },
        { step: "stake", function: "gauge.deposit(amount)", cli_command: baseFarm },
        { step: "claim", function: "gauge.earned(token, account) → gauge.getReward(account, tokens[])", cli_command: claimWithGauge() },
      ];
    case "auto_stake": {
      // Ramses CL pattern (uniswap_v3 + auto_stake): claim must go through
      // NPM.getPeriodReward(currentEpoch, tokenId, tokens[], receiver) because
      // gauge.getReward* reverts NOT_AUTHORIZED_CLAIMER for EOAs. Pipeline
      // must include --token-id alongside --gauge so the printed command
      // matches the actual `lp claim` requirements.
      const isNftAutoStake = p.interface === "uniswap_v3";
      return [
        { step: "mint", function: "Router.addLiquidity / NPM.mint", note: "LP automatically receives x(3,3) emissions — no separate stake step", cli_command: baseAdd },
        {
          step: "claim",
          function: isNftAutoStake
            ? "NPM.getPeriodReward(currentEpoch, tokenId, tokens[], receiver)"
            : "gauge.getReward(account, tokens[])",
          note: isNftAutoStake
            ? "Ramses CL: claim via NPM with --token-id; gauge.getReward* reverts NOT_AUTHORIZED_CLAIMER for EOAs"
            : "Multi-token reward (xRAM + WHYPE on Ramses HL)",
          cli_command: isNftAutoStake ? claimAutoStakeNftGauge() : claimWithGauge(),
        },
      ];
    }
    case "on_chain_masterchef":
      return [
        { step: "mint", function: "NPM.mint or pool.mint", cli_command: baseAdd },
        { step: "stake", function: "MasterChef.deposit(pid, amount)", cli_command: baseFarm },
        { step: "claim", function: "MasterChef.harvest(pid) or pendingCake(pid, user)", cli_command: claimWithTokenId() },
      ];
    case "off_chain_api":
      return [
        { step: "mint", function: "NPM.mint(MintParams)", cli_command: baseAdd },
        { step: "claim", function: "GET claim-data → voter.aggregateClaim(...)", note: "Read-only: backend-signed ticket only; broadcast ABI unresolved (selector 0xd6d7a454, 11 args, public registries miss). Use the printed `ticket` payload to submit through the Nest UI.", cli_command: `defi ${chainFlag}lp claim --protocol ${slug} --address <wallet>` },
      ];
    case "none":
      return [{ step: "mint", function: "Router/NPM mint", note: "No reward path declared", cli_command: baseAdd }];
    default:
      return [{ step: "mint", function: "Router/NPM mint", note: "reward_strategy unset — pipeline cannot be inferred", cli_command: baseAdd }];
  }
}

/** Resolve a pool: "TOKEN_A/TOKEN_B" name → address from registry, or raw 0x address */
function resolvePoolAddress(registry: ReturnType<typeof Registry.loadEmbedded>, protocolSlug: string, pool: string): Address {
  if (pool.startsWith("0x")) return pool as Address;
  return registry.resolvePool(protocolSlug, pool).address;
}

// ── Gauge APR enrichment ──

type V3PositionInfo = {
  token0: Address;
  token1: Address;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

/**
 * Probe a V3-style NPM.positions(tokenId) and return normalized position info.
 * Tries the Ramses-CL non-standard layout (no nonce/operator) first, then the
 * standard Uniswap-V3 layout. Returns null if both decode attempts fail.
 */
async function detectV3Liquidity(
  client: ReturnType<typeof createPublicClient>,
  npm: Address,
  tokenId: bigint,
): Promise<V3PositionInfo | null> {
  const ramsesAbi = parseAbi([
    "function positions(uint256) view returns (address t0, address t1, int24 ts, int24 tl, int24 tu, uint128 liq, uint256 a, uint256 b, uint128 o0, uint128 o1)",
  ]);
  const standardAbi = parseAbi([
    "function positions(uint256) view returns (uint96 nonce, address op, address t0, address t1, uint24 fee, int24 tl, int24 tu, uint128 liq, uint256 a, uint256 b, uint128 o0, uint128 o1)",
  ]);
  try {
    const r = await client.readContract({ address: npm, abi: ramsesAbi, functionName: "positions", args: [tokenId] }) as readonly [Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];
    if (r[5] !== undefined) {
      return { token0: r[0], token1: r[1], tickLower: r[3], tickUpper: r[4], liquidity: r[5] };
    }
  } catch { /* try standard */ }
  try {
    const r = await client.readContract({ address: npm, abi: standardAbi, functionName: "positions", args: [tokenId] }) as readonly [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint];
    return { token0: r[2], token1: r[3], tickLower: r[5], tickUpper: r[6], liquidity: r[7] };
  } catch {
    return null;
  }
}

const V2_PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() external view returns (uint256)",
]);
const ERC20_DECIMALS_ABI = parseAbi(["function decimals() external view returns (uint8)"]);

interface DiscoveredPool {
  protocol: string;
  pool: string;
  pair?: string;
  type: "FEE" | "EMISSION";
  source: "gauge" | "farming" | "lb_hooks" | "fee" | "masterchef" | "curve_factory";
  apr?: string;
  total_reward?: string;
  bonus_reward?: string;
  active?: boolean;
  stopped?: boolean;
  moePerDay?: number;
  aprPercent?: number;
  rangeTvlUsd?: number;
  poolTvlUsd?: number;
  isTopPool?: boolean;
  rewardedBins?: number;
  minBinId?: number;
  maxBinId?: number;
  totalMoePerDay?: number;
  moePriceUsd?: number;
  rewardRate?: string;
  totalStaked?: string;
  rewardToken?: string;
  rewardPerDay?: number;
  rewardTokenSymbol?: string;
}

/**
 * Enrich gauge pools with APR by querying on-chain prices.
 * Only processes pools with rewardRate > 0.
 */
async function _enrichGaugeAprs(
  pools: DiscoveredPool[],
  rpcUrl: string,
  registry: ReturnType<typeof Registry.loadEmbedded>,
  chainName: string,
): Promise<void> {
  const active = pools.filter(p => p.source === "gauge" && p.rewardRate && BigInt(p.rewardRate) > 0n);
  if (active.length === 0) return;

  // Use chain's wrapped native token instead of hardcoded WHYPE
  const chain = registry.getChain(chainName);
  const WRAPPED_NATIVE = (chain.wrapped_native ?? "0x0000000000000000000000000000000000000000") as Address;

  try {
    // Step 1: Get wrapped native token price via lending oracle
    let nativePriceUsd = 0;
    try {
      const protos = registry.getProtocolsForChain(chainName).filter(p => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");
      if (protos.length > 0) {
        const { createOracleFromLending } = await import("@hypurrquant/defi-protocols");
        const oracle = createOracleFromLending(protos[0]!, chain.effectiveRpcUrl());
        const price = await oracle.getPrice(WRAPPED_NATIVE);
        nativePriceUsd = price.price_f64;
      }
    } catch { /* skip */ }

    // Fallback: try stablecoin price (USDC = $1) if no Aave oracle
    if (nativePriceUsd === 0) {
      const tokens = registry.tokens.get(chainName);
      const stablecoin = tokens?.find(t => t.tags?.includes("stablecoin") && (t.symbol === "USDC" || t.symbol === "USDT"));
      if (stablecoin) {
        // Try to get native price from a native/stablecoin pool in the discovered set
        const nativeStablePool = pools.find(p => {
          const pair = p.pair?.toUpperCase() ?? "";
          const nativeSym = chain.native_token?.toUpperCase() ?? "";
          const wrappedSym = "W" + nativeSym;
          return (pair.includes(nativeSym) || pair.includes(wrappedSym)) && (pair.includes("USDC") || pair.includes("USDT"));
        });
        if (nativeStablePool?.pool) {
          try {
            const [resRaw] = await multicallRead(rpcUrl, [
              [nativeStablePool.pool as Address, encodeFunctionData({ abi: V2_PAIR_ABI, functionName: "getReserves" })],
            ]);
            if (resRaw) {
              const _resAbi = parseAbi(["function f() view returns (uint112, uint112, uint32)"]);
              const [r0, r1] = decodeFunctionResult({ abi: _resAbi, functionName: "f", data: resRaw }) as unknown as [bigint, bigint, bigint];
              const stableDecimals = stablecoin.decimals ?? 6;
              const nativeIsToken0 = WRAPPED_NATIVE.toLowerCase() < stablecoin.address.toLowerCase();
              const reserveNative = Number(nativeIsToken0 ? r0 : r1) / 1e18;
              const reserveStable = Number(nativeIsToken0 ? r1 : r0) / (10 ** stableDecimals);
              if (reserveNative > 0) nativePriceUsd = reserveStable / reserveNative;
            }
          } catch { /* skip */ }
        }
      }
    }

    if (nativePriceUsd === 0) return;

    // Step 2: For each active gauge pool, compute APR
    for (const p of active) {
      const rewardRate = BigInt(p.rewardRate!);
      const totalStaked = BigInt(p.totalStaked || "0");
      const rewardPerDay = Number(rewardRate * 86400n) / 1e18;
      p.rewardPerDay = rewardPerDay;

      if (totalStaked === 0n || rewardPerDay === 0) continue;

      // Get reward token price
      // For now: assume reward tokens trade against WHYPE
      // NEST, HYBR, xRAM all have WHYPE pairs
      let rewardTokenPriceUsd = 0;
      const rewardToken = p.rewardToken as Address | undefined;

      if (rewardToken) {
        if (rewardToken.toLowerCase() === WRAPPED_NATIVE.toLowerCase()) {
          rewardTokenPriceUsd = nativePriceUsd;
        } else {
          // Find the reward token's pool paired with WHYPE
          // Use the pool from this gauge itself if it contains the reward token + WHYPE
          // Otherwise search all discovered pools
          const pair = p.pair ?? "";
          const nativeSym = chain.native_token ?? "ETH";
          const isRewardWhypePair = pair.toUpperCase().includes("W" + nativeSym.toUpperCase()) || pair.toUpperCase().includes(nativeSym.toUpperCase());
          const tokenPoolAddr = isRewardWhypePair ? p.pool : pools.find(q =>
            q.source === "gauge" && q.pool.startsWith("0x") && q.pair &&
            (q.pair.toUpperCase().includes("W" + nativeSym.toUpperCase()) || q.pair.toUpperCase().includes(nativeSym.toUpperCase())) && q.rewardToken?.toLowerCase() === rewardToken.toLowerCase()
          )?.pool;

          if (tokenPoolAddr) {
            try {
              const [resRaw] = await multicallRead(rpcUrl, [
                [tokenPoolAddr as Address, encodeFunctionData({ abi: V2_PAIR_ABI, functionName: "getReserves" })],
              ]);
              if (resRaw) {
                const _resAbi = parseAbi(["function f() view returns (uint112, uint112, uint32)"]);
                const [r0, r1] = decodeFunctionResult({ abi: _resAbi, functionName: "f", data: resRaw }) as unknown as [bigint, bigint, bigint];
                const rewardIsToken0 = rewardToken.toLowerCase() < WRAPPED_NATIVE.toLowerCase();
                const reserveReward = Number(rewardIsToken0 ? r0 : r1) / 1e18;
                const reserveWhype = Number(rewardIsToken0 ? r1 : r0) / 1e18;
                if (reserveReward > 0) {
                  rewardTokenPriceUsd = (reserveWhype / reserveReward) * nativePriceUsd;
                }
              }
            } catch { /* skip - might be CL pool */ }
          }

          // Fallback: try oracle for reward token price
          if (rewardTokenPriceUsd === 0) {
            try {
              const protos = registry.getProtocolsForChain(chainName).filter(pr => pr.category === ProtocolCategory.Lending);
              if (protos.length > 0) {
                const { createOracleFromLending } = await import("@hypurrquant/defi-protocols");
                const chain = registry.getChain(chainName);
                const oracle = createOracleFromLending(protos[0]!, chain.effectiveRpcUrl());
                const price = await oracle.getPrice(rewardToken);
                rewardTokenPriceUsd = price.price_f64;
              }
            } catch { /* no oracle price */ }
          }
        }

        // Find symbol for reward token
        const tokens = registry.tokens.get(chainName);
        const tokenInfo = tokens?.find(t => t.address.toLowerCase() === rewardToken.toLowerCase());
        if (tokenInfo) p.rewardTokenSymbol = tokenInfo.symbol;
      }

      if (rewardTokenPriceUsd === 0) continue;

      // Get LP token value: query pool reserves + totalSupply
      try {
        const [resRaw, tsRaw] = await multicallRead(rpcUrl, [
          [p.pool as Address, encodeFunctionData({ abi: V2_PAIR_ABI, functionName: "getReserves" })],
          [p.pool as Address, encodeFunctionData({ abi: V2_PAIR_ABI, functionName: "totalSupply" })],
        ]);

        if (resRaw && tsRaw) {
          const _resAbi = parseAbi(["function f() view returns (uint112, uint112, uint32)"]);
          const [r0, r1] = decodeFunctionResult({ abi: _resAbi, functionName: "f", data: resRaw }) as unknown as [bigint, bigint, bigint];
          const totalSupply = decodeU256(tsRaw);

          // Simplified: assume both tokens are 18 decimals for V2 pairs
          // TVL = 2 × reserve_whype_side × whype_price (since V2 pools are 50/50)
          const pair = p.pair ?? "";
          const tokens = pair.split("/");

          // Figure out which side is WHYPE (or valued token)
          let poolTvlUsd = 0;
          const r0F = Number(r0) / 1e18;
          const r1F = Number(r1) / 1e18;

          // If one side is WHYPE, double it for total TVL
          if (tokens[0] === "WHYPE" || tokens[0] === "HYPE") {
            poolTvlUsd = r0F * nativePriceUsd * 2;
          } else if (tokens[1] === "WHYPE" || tokens[1] === "HYPE") {
            poolTvlUsd = r1F * nativePriceUsd * 2;
          } else {
            // Try both reserves with known prices
            poolTvlUsd = r0F * rewardTokenPriceUsd + r1F * nativePriceUsd;
          }

          p.poolTvlUsd = poolTvlUsd;

          // Staked ratio
          const stakedRatio = totalSupply > 0n ? Number(totalStaked) / Number(totalSupply) : 0;
          const stakedTvlUsd = poolTvlUsd * stakedRatio;

          // APR = (rewardPerDay × rewardPrice × 365) / stakedTvlUsd × 100
          if (stakedTvlUsd > 10) { // minimum $10 staked to avoid division-by-dust
            p.aprPercent = (rewardPerDay * rewardTokenPriceUsd * 365 / stakedTvlUsd) * 100;
          }
        }
      } catch { /* skip pool with no V2 reserves (CL pool) */ }
    }
  } catch { /* APR enrichment failed, pools still have basic data */ }
}

export function registerLP(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lp = parent
    .command("lp")
    .description("Unified LP operations: discover, add, farm, claim, remove, positions")
    .option("--wallet <name>", "OWS wallet name (alternative to DEFI_WALLET_ADDRESS)");

  // ─────────────────────────────────────────
  // lp discover
  // ─────────────────────────────────────────
  lp.command("discover")
    .description("Scan all protocols for fee + emission pools (gauges, farming, LB rewards)")
    .option("--protocol <protocol>", "Filter to a single protocol slug")
    .option("--emission-only", "Only show emission (gauge/farming) pools, skip fee-only")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();

      // Determine which protocols to scan
      const allProtocols = registry.getProtocolsForChain(chainName);
      const protocols = opts.protocol
        ? [registry.getProtocol(opts.protocol)]
        : allProtocols;

      const results: DiscoveredPool[] = [];

      await Promise.allSettled(
        protocols.map(async (protocol) => {
          try {
            // Gauge-based protocols (solidly_v2, solidly_cl, algebra_v3, hybra, uniswap_v3 with voter)
            const isGaugeProtocol = ["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(protocol.interface) ||
              (protocol.interface === "uniswap_v3" && protocol.contracts?.["voter"]);
            if (isGaugeProtocol) {
              const chainTokens = registry.tokens.get(chainName)?.map(t => t.address);
              const adapter = createGauge(protocol, rpcUrl, chainTokens);
              if (adapter.discoverGaugedPools) {
                const pools = await adapter.discoverGaugedPools();
                for (const p of pools) {
                  results.push({
                    protocol: protocol.slug,
                    pool: p.pool,
                    pair: `${p.token0}/${p.token1}`,
                    type: "EMISSION",
                    source: "gauge",
                    rewardRate: p.rewardRate ? p.rewardRate.toString() : undefined,
                    totalStaked: p.totalStaked ? p.totalStaked.toString() : undefined,
                    rewardToken: p.rewardToken,
                  });
                }
              }
            }

            // KittenSwap Algebra eternal farming
            if (protocol.interface === "algebra_v3" && protocol.contracts?.["farming_center"]) {
              const adapter = createKittenSwapFarming(protocol, rpcUrl);
              const pools = await adapter.discoverFarmingPools();
              for (const p of pools) {
                results.push({
                  protocol: protocol.slug,
                  pool: p.pool,
                  type: "EMISSION",
                  source: "farming",
                  total_reward: p.totalReward.toString(),
                  bonus_reward: p.bonusReward.toString(),
                  active: p.active,
                });
              }
            }

            // Merchant Moe LB hooks (also TraderJoe LB on Monad — same Liquidity Book)
            if (protocol.interface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
              const adapter = createMerchantMoeLB(protocol, rpcUrl);
              const rewardedPools = await adapter.discoverRewardedPools();
              const rewardedSet = new Set(rewardedPools.map((p) => p.pool.toLowerCase()));

              for (const p of rewardedPools) {
                if (!opts.emissionOnly || !p.stopped) {
                  results.push({
                    protocol: protocol.slug,
                    pool: p.pool,
                    pair: `${p.symbolX}/${p.symbolY}`,
                    type: "EMISSION",
                    source: "lb_hooks",
                    stopped: p.stopped,
                    moePerDay: p.moePerDay,
                    aprPercent: p.aprPercent,
                    rangeTvlUsd: p.rangeTvlUsd,
                    poolTvlUsd: p.poolTvlUsd,
                    isTopPool: p.isTopPool,
                    rewardedBins: p.rewardedBins,
                    minBinId: p.minBinId,
                    maxBinId: p.maxBinId,
                    totalMoePerDay: p.totalMoePerDay,
                    moePriceUsd: p.moePriceUsd,
                  });
                }
              }

              // Fee-only LB pools (no rewarder) — surface them so users can find
              // pools to deposit into for trading-fee yield even without emissions.
              // Skipped when --emission-only filters them out.
              if (!opts.emissionOnly) {
                const allPools = await adapter.discoverAllPools().catch(() => []);
                for (const p of allPools) {
                  if (rewardedSet.has(p.pool.toLowerCase())) continue;
                  results.push({
                    protocol: protocol.slug,
                    pool: p.pool,
                    pair: `${p.symbolX}/${p.symbolY}`,
                    type: "FEE",
                    source: "lb_hooks",
                  });
                }
              }
            }
            // PancakeSwap V3 MasterChef emissions
            if (protocol.interface === "uniswap_v3" && protocol.contracts?.["masterchef"]) {
              const mcAddr = protocol.contracts["masterchef"] as Address;
              const mcAbi = parseAbi([
                "function poolLength() view returns (uint256)",
                "function poolInfo(uint256) view returns (uint256 allocPoint, address v3Pool, address token0, address token1, uint24 fee, uint256 totalLiquidity, uint256 totalBoostLiquidity)",
                "function totalAllocPoint() view returns (uint256)",
                "function latestPeriodCakePerSecond() view returns (uint256)",
                "function CAKE() view returns (address)",
              ]);
              const mcClient = createPublicClient({ transport: http(rpcUrl) });
              try {
                const [poolLen, totalAlloc, cakePerSec, cakeAddr] = await Promise.all([
                  mcClient.readContract({ address: mcAddr, abi: mcAbi, functionName: "poolLength" }) as Promise<bigint>,
                  mcClient.readContract({ address: mcAddr, abi: mcAbi, functionName: "totalAllocPoint" }) as Promise<bigint>,
                  mcClient.readContract({ address: mcAddr, abi: mcAbi, functionName: "latestPeriodCakePerSecond" }) as Promise<bigint>,
                  mcClient.readContract({ address: mcAddr, abi: mcAbi, functionName: "CAKE" }) as Promise<Address>,
                ]);
                // Scan top pools (limit to 100 with highest allocPoint)
                const MAX_MC_SCAN = Math.min(Number(poolLen), 100);
                const poolInfoCalls: Array<[Address, Hex]> = [];
                for (let i = 0; i < MAX_MC_SCAN; i++) {
                  poolInfoCalls.push([mcAddr, encodeFunctionData({ abi: mcAbi, functionName: "poolInfo", args: [BigInt(i)] })]);
                }
                const poolInfoResults = await multicallRead(rpcUrl, poolInfoCalls);
                // Get CAKE price via oracle
                let cakePriceUsd = 0;
                try {
                  const lendingProtos = registry.getProtocolsForChain(chainName).filter(lp => lp.category === ProtocolCategory.Lending && lp.interface === "aave_v3");
                  if (lendingProtos.length > 0) {
                    const { createOracleFromLending } = await import("@hypurrquant/defi-protocols");
                    const oracleInst = createOracleFromLending(lendingProtos[0]!, rpcUrl);
                    const price = await oracleInst.getPrice(cakeAddr);
                    cakePriceUsd = price.price_f64;
                  }
                } catch { /* skip */ }

                for (let i = 0; i < poolInfoResults.length; i++) {
                  const raw = poolInfoResults[i];
                  if (!raw || raw.length < 66) continue;
                  try {
                    const decoded = decodeFunctionResult({ abi: mcAbi, functionName: "poolInfo", data: raw }) as unknown as [bigint, Address, Address, Address, number, bigint, bigint];
                    const [allocPoint, v3Pool, t0, t1, , totalLiq] = decoded;
                    if (allocPoint === 0n || v3Pool === zeroAddress) continue;
                    const tokens = registry.tokens.get(chainName);
                    const sym0 = tokens?.find(t => t.address.toLowerCase() === t0?.toLowerCase())?.symbol ?? t0?.slice(0, 8) ?? "?";
                    const sym1 = tokens?.find(t => t.address.toLowerCase() === t1?.toLowerCase())?.symbol ?? t1?.slice(0, 8) ?? "?";
                    // Compute APR: (allocPoint/totalAlloc) * cakePerSec * 86400 * 365 * cakePrice / poolTvl
                    const cakePerDay = totalAlloc > 0n ? Number(cakePerSec * BigInt(allocPoint) * 86400n / totalAlloc) / 1e18 : 0;
                    results.push({
                      protocol: protocol.slug,
                      pool: v3Pool,
                      pair: `${sym0}/${sym1}`,
                      type: "EMISSION",
                      source: "masterchef",
                      rewardRate: totalAlloc > 0n ? String(cakePerSec * BigInt(allocPoint) / totalAlloc) : "0",
                      totalStaked: String(totalLiq),
                      rewardToken: cakeAddr,
                      rewardTokenSymbol: "CAKE",
                      rewardPerDay: cakePerDay,
                    } as DiscoveredPool);
                  } catch { /* skip malformed pool */ }
                }
              } catch { /* masterchef query failed */ }
            }

            // Curve StableswapNG: enumerate via factory.pool_count + pool_list
            if (protocol.interface === "curve_stableswap" && protocol.contracts?.["stableswap_factory"]) {
              const factory = protocol.contracts["stableswap_factory"] as Address;
              const factoryAbi = parseAbi([
                "function pool_count() view returns (uint256)",
                "function pool_list(uint256) view returns (address)",
              ]);
              const poolAbi = parseAbi([
                "function coins(uint256) view returns (address)",
                "function name() view returns (string)",
              ]);
              const cClient = createPublicClient({ transport: http(rpcUrl) });
              try {
                const count = await cClient.readContract({ address: factory, abi: factoryAbi, functionName: "pool_count" }) as bigint;
                const MAX_SCAN = Math.min(Number(count), 50);
                for (let i = 0; i < MAX_SCAN; i++) {
                  try {
                    const pool = await cClient.readContract({ address: factory, abi: factoryAbi, functionName: "pool_list", args: [BigInt(i)] }) as Address;
                    const [c0, c1, name] = await Promise.all([
                      cClient.readContract({ address: pool, abi: poolAbi, functionName: "coins", args: [0n] }).catch(() => null) as Promise<Address | null>,
                      cClient.readContract({ address: pool, abi: poolAbi, functionName: "coins", args: [1n] }).catch(() => null) as Promise<Address | null>,
                      cClient.readContract({ address: pool, abi: poolAbi, functionName: "name" }).catch(() => "") as Promise<string>,
                    ]);
                    results.push({
                      protocol: protocol.slug,
                      pool,
                      pair: name || `${c0 ?? "?"}/${c1 ?? "?"}`,
                      type: "FEE",
                      source: "curve_factory",
                    } as DiscoveredPool);
                  } catch { /* skip malformed pool */ }
                }
              } catch { /* factory query failed */ }
            }

          } catch {
            // Skip protocols that fail discovery (no adapter, missing contracts, etc.)
          }
        }),
      );

      // Compute APR for gauge pools with active rewardRate
      await _enrichGaugeAprs(results, rpcUrl, registry, chainName);

      // Sort by APR descending (puts top-yield pools first; pools with no APR sink to bottom)
      results.sort((a, b) => (b.aprPercent ?? 0) - (a.aprPercent ?? 0));
      if (opts.emissionOnly) {
        // Filter to pools that are actually distributing rewards right now (moePerDay > 0 OR rewardRate > 0)
        printOutput(
          results.filter((r) =>
            r.type === "EMISSION" &&
            ((r.moePerDay ?? 0) > 0 || (r.rewardRate && BigInt(r.rewardRate) > 0n)),
          ),
          getOpts(),
        );
      } else {
        printOutput(results, getOpts());
      }
    });

  // ─────────────────────────────────────────
  // lp add
  // ─────────────────────────────────────────
  lp.command("add")
    .description("Add liquidity to a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-a <token>", "First token symbol or address")
    .requiredOption("--token-b <token>", "Second token symbol or address")
    .requiredOption("--amount-a <amount>", "Amount of token A in wei")
    .requiredOption("--amount-b <amount>", "Amount of token B in wei")
    .option("--pool <name_or_address>", "Pool name (e.g. WHYPE/USDC) or address")
    .option("--recipient <address>", "Recipient address")
    .option("--tick-lower <tick>", "Lower tick for concentrated LP (default: full range)")
    .option("--tick-upper <tick>", "Upper tick for concentrated LP (default: full range)")
    .option("--range <percent>", "±N% concentrated range around current price (e.g. --range 2)")
    .option("--num-bins <n>", "Merchant Moe LB: bins on each side of active (default 5)")
    .option("--slippage <bps>", "Slippage tolerance in basis points (default 50 = 0.5%). Sets amount{0,1}Min per side via applyMinSlippage.")
    .option("--amount-a-min <wei>", "Explicit minimum of token_a accepted on add (overrides --slippage for that side).")
    .option("--amount-b-min <wei>", "Explicit minimum of token_b accepted on add (overrides --slippage for that side).")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const tokenA = opts.tokenA.startsWith("0x")
        ? (opts.tokenA as Address)
        : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x")
        ? (opts.tokenB as Address)
        : registry.resolveToken(chainName, opts.tokenB).address as Address;
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const poolAddr = opts.pool ? resolvePoolAddress(registry, opts.protocol, opts.pool) : undefined;

      // Merchant Moe LB add: distinct path from V2 — uses LBRouter.addLiquidity with bin distribution
      if (protocol.interface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
        if (!poolAddr) throw new Error(`--pool is required for ${protocol.name} (Liquidity Book — pass --pool <addr>; use \`lp discover --protocol ${protocol.slug}\` to list active pools)`);
        const lbAdapter = createMerchantMoeLB(protocol, chain.effectiveRpcUrl());
        const [tokenX, tokenY, amountX, amountY] = tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA, tokenB, BigInt(opts.amountA), BigInt(opts.amountB)]
          : [tokenB, tokenA, BigInt(opts.amountB), BigInt(opts.amountA)];
        const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });
        const binStep = await client.readContract({
          address: poolAddr, abi: parseAbi(["function getBinStep() view returns (uint16)"]), functionName: "getBinStep",
        }) as number;
        const tx = await lbAdapter.buildAddLiquidity({
          pool: poolAddr,
          tokenX, tokenY, binStep,
          amountX, amountY,
          recipient,
          numBins: opts.numBins !== undefined ? parseInt(opts.numBins, 10) : 5,
        });
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
        return;
      }

      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tx = await adapter.buildAddLiquidity({
        protocol: protocol.name,
        token_a: tokenA,
        token_b: tokenB,
        amount_a: BigInt(opts.amountA),
        amount_b: BigInt(opts.amountB),
        recipient,
        tick_lower: opts.tickLower !== undefined ? parseInt(opts.tickLower) : undefined,
        tick_upper: opts.tickUpper !== undefined ? parseInt(opts.tickUpper) : undefined,
        range_pct: opts.range !== undefined ? parseFloat(opts.range) : undefined,
        pool: poolAddr,
        slippage: opts.slippage !== undefined ? { bps: parseInt(opts.slippage, 10) } : undefined,
        amount_a_min: opts.amountAMin !== undefined ? BigInt(opts.amountAMin) : undefined,
        amount_b_min: opts.amountBMin !== undefined ? BigInt(opts.amountBMin) : undefined,
      });
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    });

  // ─────────────────────────────────────────
  // lp farm  (add liquidity + auto-stake)
  // ─────────────────────────────────────────
  lp.command("farm")
    .description("Add liquidity and auto-stake into gauge/farming for emissions")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-a <token>", "First token symbol or address")
    .requiredOption("--token-b <token>", "Second token symbol or address")
    .requiredOption("--amount-a <amount>", "Amount of token A in wei")
    .requiredOption("--amount-b <amount>", "Amount of token B in wei")
    .option("--pool <name_or_address>", "Pool name (e.g. WHYPE/USDC) or address")
    .option("--gauge <address>", "Gauge address (required for solidly/hybra if not resolved automatically)")
    .option("--recipient <address>", "Recipient / owner address")
    .option("--tick-lower <tick>", "Lower tick for concentrated LP")
    .option("--tick-upper <tick>", "Upper tick for concentrated LP")
    .option("--range <percent>", "±N% concentrated range around current price")
    .option("--slippage <bps>", "Slippage tolerance in basis points (default 50 = 0.5%). Applied to the underlying mint step.")
    .option("--amount-a-min <wei>", "Explicit minimum of token_a accepted on add (overrides --slippage for that side).")
    .option("--amount-b-min <wei>", "Explicit minimum of token_b accepted on add (overrides --slippage for that side).")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const rpcUrl = chain.effectiveRpcUrl();
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const poolAddr = opts.pool ? resolvePoolAddress(registry, opts.protocol, opts.pool) : undefined;

      const tokenA = opts.tokenA.startsWith("0x")
        ? (opts.tokenA as Address)
        : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x")
        ? (opts.tokenB as Address)
        : registry.resolveToken(chainName, opts.tokenB).address as Address;

      // Step 1: Add liquidity
      const dexAdapter = createDex(protocol, rpcUrl);
      const addTx = await dexAdapter.buildAddLiquidity({
        protocol: protocol.name,
        token_a: tokenA,
        token_b: tokenB,
        amount_a: BigInt(opts.amountA),
        amount_b: BigInt(opts.amountB),
        recipient,
        tick_lower: opts.tickLower !== undefined ? parseInt(opts.tickLower) : undefined,
        tick_upper: opts.tickUpper !== undefined ? parseInt(opts.tickUpper) : undefined,
        range_pct: opts.range !== undefined ? parseFloat(opts.range) : undefined,
        pool: poolAddr,
        slippage: opts.slippage !== undefined ? { bps: parseInt(opts.slippage, 10) } : undefined,
        amount_a_min: opts.amountAMin !== undefined ? BigInt(opts.amountAMin) : undefined,
        amount_b_min: opts.amountBMin !== undefined ? BigInt(opts.amountBMin) : undefined,
      });

      process.stderr.write("Step 1/2: Adding liquidity...\n");
      const addResult = await executor.execute(addTx);
      printOutput({ step: "lp_add", ...addResult }, getOpts());

      if (addResult.status !== "confirmed" && addResult.status !== "simulated") {
        process.stderr.write("Step 2/2: Skipped — LP add did not succeed.\n");
        return;
      }

      // Extract minted tokenId from result (broadcast mode populates minted_token_id)
      const mintedTokenId = addResult.details?.minted_token_id
        ? BigInt(addResult.details.minted_token_id as string)
        : undefined;

      // Step 2: Auto-stake based on protocol interface
      const iface = protocol.interface;

      // KittenSwap Algebra eternal farming
      if (iface === "algebra_v3" && protocol.contracts?.["farming_center"]) {
        if (!mintedTokenId) {
          process.stderr.write("Step 2/2: Skipped staking (no tokenId — run in --broadcast mode to get minted NFT)\n");
          return;
        }
        if (!poolAddr) throw new Error("--pool is required for lp farm with KittenSwap (needed for farming center)");
        process.stderr.write("Step 2/2: Staking into KittenSwap eternal farming...\n");
        const farmAdapter = createKittenSwapFarming(protocol, rpcUrl);
        const stakeTx = await farmAdapter.buildEnterFarming(mintedTokenId, poolAddr, recipient);
        const stakeResult = await executor.execute(stakeTx);
        printOutput({ step: "stake_farming", ...stakeResult }, getOpts());
        return;
      }

      // Solidly V2 / CL / Hybra / uniswap_v3-with-voter (Aerodrome Slipstream) gauge staking
      const isGaugeStakeable = ["solidly_v2", "solidly_cl", "hybra"].includes(iface)
        || (iface === "uniswap_v3" && protocol.contracts?.["voter"]);
      if (isGaugeStakeable) {
        if (!mintedTokenId && iface !== "solidly_v2") {
          process.stderr.write("Step 2/2: Skipped staking (no tokenId — run in --broadcast mode to get minted NFT)\n");
          return;
        }

        let gaugeAddr = opts.gauge as Address | undefined;
        // Try to resolve gauge from pool address if not provided
        if (!gaugeAddr && poolAddr) {
          try {
            const gaugeAdapter = createGauge(protocol, rpcUrl);
            if (gaugeAdapter.resolveGauge) {
              gaugeAddr = await gaugeAdapter.resolveGauge(poolAddr);
            }
          } catch {
            // ignore
          }
        }
        if (!gaugeAddr) throw new Error("--gauge <address> is required for staking (could not auto-resolve gauge)");

        process.stderr.write("Step 2/2: Staking into gauge...\n");
        const gaugeAdapter = createGauge(protocol, rpcUrl);
        // Hybra uses tokenId-based deposit; solidly_v2 uses amount.
        // Aerodrome V2 (and most Solidly forks) gauge.deposit reverts on uint256.max — query
        // user's actual LP balance and stake that exact amount.
        const tokenIdArg = mintedTokenId;
        let amountArg = 0n;
        if (iface === "solidly_v2" && poolAddr) {
          const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
          const lpClient = createPublicClient({ transport: http(rpcUrl) });
          amountArg = await lpClient.readContract({
            address: poolAddr, abi: erc20Abi, functionName: "balanceOf", args: [recipient],
          }) as bigint;
          if (amountArg === 0n) {
            process.stderr.write("Step 2/2: Skipped staking — LP balance 0 (Step 1 add returned no LP).\n");
            return;
          }
        }
        // For solidly_v2, the LP token is the pool itself — pass poolAddr so approve is generated
        const lpTokenArg = iface === "solidly_v2" ? poolAddr : undefined;
        const stakeTx = await gaugeAdapter.buildDeposit(gaugeAddr, amountArg, tokenIdArg, lpTokenArg);
        const stakeResult = await executor.execute(stakeTx);
        printOutput({ step: "stake_gauge", ...stakeResult }, getOpts());
        return;
      }

      // Merchant Moe LB: no explicit staking needed (hooks auto-handle rewards)
      if (iface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
        process.stderr.write("Step 2/2: Merchant Moe LB hooks handle rewards automatically — no staking needed.\n");
        return;
      }

      process.stderr.write("Step 2/2: No staking adapter found for this protocol interface — liquidity added only.\n");
    });

  // ─────────────────────────────────────────
  // lp claim
  // ─────────────────────────────────────────
  lp.command("claim")
    .description("Claim rewards from a pool (fee or emission)")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--pool <address>", "Pool address (required for farming/LB)")
    .option("--gauge <address>", "Gauge contract address (required for solidly/hybra)")
    .option("--token-id <id>", "NFT tokenId (for CL gauge or farming positions)")
    .option("--bins <binIds>", "Comma-separated bin IDs (for Merchant Moe LB)")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .option("--redeem-type <n>", "Hybra: 0=instant exit (with penalty), 1=lock into 2-year veHYBR (default)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const protocol = registry.getProtocol(opts.protocol);
      const account = resolveAccount(opts.address, lp.opts<{ wallet?: string }>().wallet);
      const iface = protocol.interface;

      // V3 NPM.collect — used either when the whole protocol is fee-only
      // (e.g. swap-only V3 forks) OR when an auto_stake protocol's specific
      // pool has no gauge (caller passes --token-id without --gauge).
      const isV3Fee =
        protocol.reward_strategy === "lp_fee_only" ||
        (iface === "uniswap_v3" && opts.tokenId && !opts.gauge);
      if (isV3Fee) {
        if (!opts.tokenId) throw new Error("--token-id is required for V3 LP fee collection");
        const adapter = createDex(protocol, rpcUrl);
        if (!("buildCollectFees" in adapter) || typeof (adapter as { buildCollectFees?: unknown }).buildCollectFees !== "function") {
          throw new Error(`[${protocol.name}] adapter does not support buildCollectFees`);
        }
        const tx = await (adapter as { buildCollectFees: (tokenId: bigint, recipient: Address) => Promise<unknown> })
          .buildCollectFees(BigInt(opts.tokenId), account);
        const result = await executor.execute(tx as Parameters<typeof executor.execute>[0]);
        printOutput(result, getOpts());
        return;
      }

      // Off-chain claim (Nest): emissions read from blaze.nest.aegas.it / usenest.xyz.
      // The backend issues a signed claim ticket; we reproduce the byte-level
      // calldata pattern observed in successful onchain claims (template derived
      // from diffing two confirmed claim txs — only the ticket struct slots
      // differ between callers).
      if (protocol.reward_strategy === "off_chain_api") {
        const nest = createNestOffChain(protocol);
        const status = await nest.getClaimStatus(account);
        const ticket = await nest.getClaimTicket(account);
        if (!ticket) {
          printOutput({
            protocol: protocol.slug,
            wallet: account,
            voter: nest.getVoterAddress(),
            reward_symbol: "NEST",
            pending_amount: 0,
            note: "No claim ticket available — backend reports no points to claim.",
          }, getOpts());
          return;
        }
        const tx = await nest.buildClaim(account);

        // Pre-flight simulation gate: verify the voter accepts the calldata under
        // `from: account` before paying gas. Catches expired tickets, signature
        // mismatches, replay rejections, etc. without burning a tx.
        const preflightClient = createPublicClient({ transport: http(rpcUrl) });
        try {
          await preflightClient.call({
            account,
            to: tx.to as Address,
            data: tx.data as Hex,
            value: tx.value,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          printOutput({
            protocol: protocol.slug,
            wallet: account,
            voter: nest.getVoterAddress(),
            reward_symbol: "NEST",
            pending_amount: status.pendingFormatted,
            pending_raw: status.pendingRaw.toString(),
            ticket: {
              amount: ticket.amount.toString(),
              timestamp: ticket.timestamp.toString(),
              day: ticket.day === null ? null : ticket.day.toString(),
              signature: ticket.signature,
            },
            preflight: "revert",
            preflight_error: msg.length > 400 ? msg.slice(0, 400) + "..." : msg,
            broadcast: "skipped",
            note: "Simulation reverted — broadcast aborted to avoid wasted gas. Common causes: ticket expired, caller != ticket signer, ticket already claimed.",
          }, getOpts());
          return;
        }

        // Simulation passed → broadcast (or stay in dry-run if executor is configured that way)
        const result = await executor.execute(tx);
        printOutput({
          protocol: protocol.slug,
          wallet: account,
          voter: nest.getVoterAddress(),
          reward_symbol: "NEST",
          pending_amount: status.pendingFormatted,
          pending_raw: status.pendingRaw.toString(),
          total_claimed_raw: status.totalClaimedRaw.toString(),
          total_available_raw: status.totalAvailableRaw.toString(),
          ticket: {
            amount: ticket.amount.toString(),
            timestamp: ticket.timestamp.toString(),
            day: ticket.day === null ? null : ticket.day.toString(),
            signature: ticket.signature,
          },
          preflight: "passed",
          claim_result: result,
          note: "Calldata derived from byte-level template (verified against two known-successful onchain claim txs). Pre-flight eth_call simulation passed before broadcast.",
        }, getOpts());
        return;
      }

      // KittenSwap farming: collectRewards (collect + claim in one tx)
      if (iface === "algebra_v3" && protocol.contracts?.["farming_center"]) {
        if (!opts.pool) throw new Error("--pool is required for KittenSwap farming claim");
        if (!opts.tokenId) throw new Error("--token-id is required for KittenSwap farming claim");
        const adapter = createKittenSwapFarming(protocol, rpcUrl);
        const tx = await adapter.buildCollectRewards(
          BigInt(opts.tokenId),
          opts.pool as Address,
          account,
        );
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
        return;
      }

      // Merchant Moe LB claim
      if (iface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
        if (!opts.pool) throw new Error(`--pool is required for ${protocol.name} (Liquidity Book — pass --pool <addr>)`);
        const adapter = createMerchantMoeLB(protocol, rpcUrl);
        const binIds = opts.bins
          ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim()))
          : undefined;
        const tx = await adapter.buildClaimRewards(account, opts.pool as Address, binIds);
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
        return;
      }

      // Solidly / Hybra gauge claim (including uniswap_v3 with voter)
      if (["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(iface) ||
          (iface === "uniswap_v3" && protocol.contracts?.["voter"])) {
        if (!opts.gauge) throw new Error("--gauge is required for gauge claim");
        const adapter = createGauge(protocol, rpcUrl);
        type GaugeTx = Awaited<ReturnType<typeof adapter.buildClaimRewards>>;
        let tx: GaugeTx;
        // Ramses CL pattern: x(3,3) auto-stake on uniswap_v3 — claim must go through NPM
        // (gauge.getReward* reverts NOT_AUTHORIZED_CLAIMER for EOAs; only NPM/voter authorized).
        // We call NPM.getPeriodReward(currentEpoch, tokenId, tokens[], receiver).
        if (opts.tokenId &&
            iface === "uniswap_v3" &&
            protocol.reward_strategy === "auto_stake" &&
            "buildClaimRewardsViaNPMPeriodReward" in adapter &&
            typeof (adapter as { buildClaimRewardsViaNPMPeriodReward?: unknown }).buildClaimRewardsViaNPMPeriodReward === "function") {
          const npm = protocol.contracts?.["position_manager"] as Address | undefined;
          if (!npm) throw new Error(`${protocol.name} requires contracts.position_manager for NPM-based claim`);
          tx = await (adapter as {
            buildClaimRewardsViaNPMPeriodReward: (
              npm: Address, tokenId: bigint, receiver: Address,
              opts?: { tokens?: Address[]; gauge?: Address; period?: bigint },
            ) => Promise<GaugeTx>;
          }).buildClaimRewardsViaNPMPeriodReward(
            npm,
            BigInt(opts.tokenId),
            account,
            { gauge: opts.gauge as Address },
          );
        } else if (opts.tokenId) {
          if (!adapter.buildClaimRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT-based claim`);
          const claimOpts = opts.redeemType !== undefined
            ? { redeemType: parseInt(opts.redeemType, 10) }
            : undefined;
          tx = await (adapter as { buildClaimRewardsByTokenId: (gauge: Address, tokenId: bigint, opts?: { redeemType?: number }) => Promise<GaugeTx> })
            .buildClaimRewardsByTokenId(opts.gauge as Address, BigInt(opts.tokenId), claimOpts);
        } else {
          tx = await adapter.buildClaimRewards(opts.gauge as Address, account);
        }
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
        return;
      }

      throw new Error(`No claim method found for protocol interface '${iface}'`);
    });

  // ─────────────────────────────────────────
  // lp pipeline (mint→stake→claim plan with optional inputs)
  // ─────────────────────────────────────────
  lp.command("pipeline")
    .description("Show the mint→stake→claim sequence implied by a protocol's reward_strategy. Pass --token-a/-b/--amount-a/-b etc. to get fully-resolved CLI commands you can copy-paste.")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .option("--pool <pool>", "Pool name or address (e.g. WHYPE/USDC)")
    .option("--token-a <token>", "First token symbol or address")
    .option("--token-b <token>", "Second token symbol or address")
    .option("--amount-a <amount>", "Amount of token A in wei")
    .option("--amount-b <amount>", "Amount of token B in wei")
    .option("--tick-lower <tick>", "Lower tick (V3/CL)")
    .option("--tick-upper <tick>", "Upper tick (V3/CL)")
    .option("--range <percent>", "±N% concentrated range")
    .option("--token-id <id>", "NFT tokenId for already-minted positions (skips mint step)")
    .option("--gauge <addr>", "Gauge address for stake/claim")
    .action((opts) => {
      const registry = Registry.loadEmbedded();
      const protocol = registry.getProtocol(opts.protocol);
      const chainName = parent.opts<{ chain?: string }>().chain;
      const steps = buildPipelineSteps(protocol, {
        chain: chainName,
        pool: opts.pool,
        tokenA: opts.tokenA,
        tokenB: opts.tokenB,
        amountA: opts.amountA,
        amountB: opts.amountB,
        tickLower: opts.tickLower,
        tickUpper: opts.tickUpper,
        range: opts.range,
        tokenId: opts.tokenId,
        gauge: opts.gauge,
      });
      printOutput({
        protocol: protocol.slug,
        chain: protocol.chain,
        interface: protocol.interface,
        is_active: protocol.is_active !== false,
        verified: protocol.verified === true,
        reward_strategy: protocol.reward_strategy ?? "(unset — falls back to interface inference)",
        steps,
        note: "Plan output. Run each cli_command sequentially. After the mint step, broadcast mode prints `details.minted_token_id` — feed that into the next step's --token-id.",
      }, getOpts());
    });

  // ─────────────────────────────────────────
  // lp remove
  // ─────────────────────────────────────────
  lp.command("remove")
    .description("Auto-unstake (if staked) and remove liquidity from a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    // V2 / Curve / LB removes need pair + liquidity; V3 / CL NFT-based removes
    // only need --token-id (position info is on-chain via NPM.positions). Mark
    // these as optional and validate per-protocol below.
    .option("--token-a <token>", "First token symbol or address (required for V2/Curve/LB)")
    .option("--token-b <token>", "Second token symbol or address (required for V2/Curve/LB)")
    .option("--liquidity <amount>", "Liquidity amount to remove in wei (required for V2/Curve/LB)")
    .option("--pool <address>", "Pool address (needed to resolve gauge)")
    .option("--gauge <address>", "Gauge contract address (for solidly/hybra unstake)")
    .option("--token-id <id>", "NFT tokenId (for CL gauge or farming positions)")
    .option("--recipient <address>", "Recipient address")
    .option("--redeem-type <n>", "Hybra: 0=instant exit (with penalty), 1=lock into 2-year veHYBR (default — WARNING: long lock)")
    .option("--bins <binIds>", "Merchant Moe LB: comma-separated bin IDs to withdraw")
    .option("--amount-a-min <wei>", "Explicit minimum of token_a accepted on remove (REQUIRED for V3/Algebra/Thena CL — caller must compute from positions(tokenId) + pool state and apply tolerance).")
    .option("--amount-b-min <wei>", "Explicit minimum of token_b accepted on remove (REQUIRED for V3/Algebra/Thena CL).")
    .option("--amounts <wei>", "Merchant Moe LB: comma-separated bin amounts (parallel to --bins, default: full balance)")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const protocol = registry.getProtocol(opts.protocol);
      const iface = protocol.interface;
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;

      // Merchant Moe LB remove: distinct path — uses LBRouter.removeLiquidity with per-bin amounts + ERC1155 approveForAll
      if (iface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
        if (!opts.pool) throw new Error(`--pool is required for ${protocol.name} (Liquidity Book — pass --pool <addr>)`);
        if (!opts.bins) throw new Error("--bins <id1,id2,...> is required for Merchant Moe LB remove");
        // LB always needs both legs of the pair to derive the (tokenX, tokenY)
        // sort order; the relaxed commander spec lets these be omitted, so
        // validate explicitly with an actionable message instead of crashing
        // on `opts.tokenA.startsWith` two lines down.
        if (!opts.tokenA || !opts.tokenB) {
          throw new Error(`--token-a and --token-b are required for ${protocol.name} (Liquidity Book) remove`);
        }
        const lbAdapter = createMerchantMoeLB(protocol, rpcUrl);
        const tokenA = opts.tokenA.startsWith("0x")
          ? (opts.tokenA as Address)
          : registry.resolveToken(chainName, opts.tokenA).address as Address;
        const tokenB = opts.tokenB.startsWith("0x")
          ? (opts.tokenB as Address)
          : registry.resolveToken(chainName, opts.tokenB).address as Address;
        const [tokenX, tokenY] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
        const binIds = (opts.bins as string).split(",").map((s) => parseInt(s.trim()));
        const client = createPublicClient({ transport: http(rpcUrl) });
        const binStep = await client.readContract({
          address: opts.pool as Address, abi: parseAbi(["function getBinStep() view returns (uint16)"]), functionName: "getBinStep",
        }) as number;
        let amounts: bigint[];
        if (opts.amounts) {
          amounts = (opts.amounts as string).split(",").map((s) => BigInt(s.trim()));
        } else {
          // Default: full balance per bin
          const balanceAbi = parseAbi(["function balanceOf(address account, uint256 id) view returns (uint256)"]);
          amounts = await Promise.all(binIds.map((id) =>
            client.readContract({ address: opts.pool as Address, abi: balanceAbi, functionName: "balanceOf", args: [recipient, BigInt(id)] }) as Promise<bigint>,
          ));
        }
        // Pre-tx: approveForAll(LBRouter, true) on the LBPair (ERC1155)
        const approveForAllAbi = parseAbi(["function approveForAll(address operator, bool approved) external"]);
        const lbRouter = protocol.contracts["lb_router"] as Address;
        const approveTx = {
          description: `[${protocol.name}] approveForAll LBPair → LBRouter`,
          to: opts.pool as Address,
          data: encodeFunctionData({ abi: approveForAllAbi, functionName: "approveForAll", args: [lbRouter, true] }),
          value: 0n,
          gas_estimate: 80_000,
        };
        const tx = await lbAdapter.buildRemoveLiquidity({
          tokenX, tokenY, binStep,
          binIds, amounts,
          recipient,
        });
        tx.pre_txs = [approveTx, ...(tx.pre_txs ?? [])];
        const result = await executor.execute(tx);
        printOutput({ step: "lb_remove", ...result }, getOpts());
        return;
      }

      // V3/CL NFT-based remove uses --token-id and reads position info from
      // NPM.positions on-chain; --token-a/--token-b/--liquidity are then
      // unused. Other protocols still need the pair + liquidity, so validate
      // here once instead of forcing them as commander-level requiredOption.
      // Gate on the protocol interface so a stray --token-id passed to a V2
      // protocol doesn't accidentally bypass --token-a/--token-b/--liquidity
      // validation and fall through to the V3 zero-liquidity error path.
      const NFT_REMOVE_IFACES = new Set(["uniswap_v3", "algebra_v3", "thena_cl", "hybra"]);
      const isNftRemove = !!opts.tokenId && NFT_REMOVE_IFACES.has(iface);
      if (!isNftRemove) {
        const missing: string[] = [];
        if (!opts.tokenA) missing.push("--token-a");
        if (!opts.tokenB) missing.push("--token-b");
        if (!opts.liquidity) missing.push("--liquidity");
        if (missing.length > 0) {
          printOutput({
            error: `${missing.join(", ")} required for ${protocol.name} remove (or pass --token-id for V3/CL NFT-based remove).`,
          }, getOpts());
          return;
        }
      }
      const tokenA: Address | undefined = opts.tokenA
        ? (opts.tokenA.startsWith("0x")
          ? (opts.tokenA as Address)
          : registry.resolveToken(chainName, opts.tokenA).address as Address)
        : undefined;
      const tokenB: Address | undefined = opts.tokenB
        ? (opts.tokenB.startsWith("0x")
          ? (opts.tokenB as Address)
          : registry.resolveToken(chainName, opts.tokenB).address as Address)
        : undefined;

      // Step 1: Unstake if applicable
      const poolAddr = opts.pool ? (opts.pool as Address) : undefined;
      let didUnstake = false;

      // KittenSwap farming exit
      if (iface === "algebra_v3" && protocol.contracts?.["farming_center"] && opts.tokenId && poolAddr) {
        process.stderr.write("Step 1/2: Exiting KittenSwap farming...\n");
        const farmAdapter = createKittenSwapFarming(protocol, rpcUrl);
        const exitTx = await farmAdapter.buildExitFarming(BigInt(opts.tokenId), poolAddr);
        const exitResult = await executor.execute(exitTx);
        printOutput({ step: "unstake_farming", ...exitResult }, getOpts());
        if (exitResult.status !== "confirmed" && exitResult.status !== "simulated") {
          process.stderr.write("Step 2/2: Skipped — unstake did not succeed.\n");
          return;
        }
        didUnstake = true;
      }
      // Solidly / Hybra / uniswap_v3-with-voter (Aerodrome Slipstream) gauge withdraw
      else if (["solidly_v2", "solidly_cl", "hybra"].includes(iface)
        || (iface === "uniswap_v3" && protocol.contracts?.["voter"])) {
        let gaugeAddr = opts.gauge as Address | undefined;
        if (!gaugeAddr && poolAddr) {
          try {
            const gaugeAdapter = createGauge(protocol, rpcUrl);
            if (gaugeAdapter.resolveGauge) {
              gaugeAddr = await gaugeAdapter.resolveGauge(poolAddr);
            }
          } catch {
            // ignore
          }
        }
        if (gaugeAddr) {
          // Skip unstake if gauge balance is already 0 (e.g., user pre-unstaked manually)
          if (iface === "solidly_v2" && !opts.tokenId) {
            const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
            const gClient = createPublicClient({ transport: http(rpcUrl) });
            const gaugeBal = await gClient.readContract({
              address: gaugeAddr, abi: erc20Abi, functionName: "balanceOf", args: [recipient],
            }) as bigint;
            if (gaugeBal === 0n) {
              process.stderr.write("Step 1/2: Skipped unstake — gauge balance 0 (already unstaked).\n");
              didUnstake = true; // mark as success to allow remove
              gaugeAddr = undefined; // skip the unstake block below
            }
          }
        }
        if (gaugeAddr) {
          process.stderr.write("Step 1/2: Withdrawing from gauge...\n");
          const gaugeAdapter = createGauge(protocol, rpcUrl);
          const tokenId = opts.tokenId ? BigInt(opts.tokenId) : undefined;
          const wOpts = opts.redeemType !== undefined ? { redeemType: parseInt(opts.redeemType, 10) } : undefined;
          if (iface === "hybra" && (!wOpts || wOpts.redeemType === 1)) {
            process.stderr.write("WARNING: Hybra default redeemType=1 locks rewards into 2-year veHYBR NFT. Pass --redeem-type 0 for instant exit (with penalty).\n");
          }
          // NFT-mode gauges (V3/CL) read amount from NPM.positions(tokenId);
          // --liquidity is unused on those paths so default to 0n instead of
          // throwing on BigInt(undefined).
          const withdrawTx = await (gaugeAdapter as { buildWithdraw: (g: Address, a: bigint, t?: bigint, o?: { redeemType?: number }) => Promise<unknown> })
            .buildWithdraw(gaugeAddr, opts.liquidity ? BigInt(opts.liquidity) : 0n, tokenId, wOpts) as Awaited<ReturnType<typeof gaugeAdapter.buildWithdraw>>;
          const withdrawResult = await executor.execute(withdrawTx);
          printOutput({ step: "unstake_gauge", ...withdrawResult }, getOpts());
          if (withdrawResult.status !== "confirmed" && withdrawResult.status !== "simulated") {
            process.stderr.write("Step 2/2: Skipped — unstake did not succeed.\n");
            return;
          }
          didUnstake = true;
        }
      }

      if (!didUnstake) {
        process.stderr.write("Step 1/2: No staking detected — skipping unstake.\n");
      }

      // Step 2: Remove liquidity
      process.stderr.write("Step 2/2: Removing liquidity...\n");
      const dexAdapter = createDex(protocol, rpcUrl);
      // V3/CL NFT-based remove: when --liquidity is omitted (typical UX),
      // read the position's liquidity from NPM.positions(tokenId) so the
      // adapter's decreaseLiquidity actually targets the full position
      // instead of being a no-op decrease(0) + collect.
      let removeLiquidity: bigint = opts.liquidity ? BigInt(opts.liquidity) : 0n;
      if (isNftRemove && removeLiquidity === 0n) {
        const npm = protocol.contracts?.["position_manager"] as Address | undefined;
        if (npm) {
          // Use the shared detectV3Liquidity helper so Ramses-CL's
          // non-standard positions layout (no nonce/operator) and the
          // standard Uniswap-V3 layout are both handled — same probe used
          // by `lp positions`.
          const c = createPublicClient({ transport: http(rpcUrl) });
          const pos = await detectV3Liquidity(c, npm, BigInt(opts.tokenId));
          if (pos) {
            removeLiquidity = pos.liquidity;
            process.stderr.write(`  Read live liquidity ${removeLiquidity} from NPM.positions(${opts.tokenId}).\n`);
          }
        }
      }
      if (isNftRemove && removeLiquidity === 0n) {
        // Surface this rather than producing a no-op decreaseLiquidity(0) +
        // collect that wastes gas and gives the user no signal.
        printOutput({
          error: `tokenId ${opts.tokenId} has zero liquidity (already removed?). Pass --liquidity explicitly to override, or pick a different tokenId.`,
        }, getOpts());
        return;
      }
      const ZERO = "0x0000000000000000000000000000000000000000" as Address;
      // Solidly-style adapters need the LP pair address to emit an
      // `approvals[]` entry (the router pulls the LP token via transferFrom
      // and reverts otherwise). --pool accepts both "TOKEN_A/TOKEN_B" symbol
      // pairs from the protocol TOML and raw 0x addresses.
      const removePoolAddr = opts.pool ? resolvePoolAddress(registry, opts.protocol, opts.pool) : undefined;
      const removeTx = await dexAdapter.buildRemoveLiquidity({
        protocol: protocol.name,
        token_a: tokenA ?? ZERO,
        token_b: tokenB ?? ZERO,
        liquidity: removeLiquidity,
        recipient,
        token_id: opts.tokenId ? BigInt(opts.tokenId) : undefined,
        amount_a_min: opts.amountAMin !== undefined ? BigInt(opts.amountAMin) : undefined,
        amount_b_min: opts.amountBMin !== undefined ? BigInt(opts.amountBMin) : undefined,
        pool: removePoolAddr,
      });
      const removeResult = await executor.execute(removeTx);
      printOutput({ step: "lp_remove", ...removeResult }, getOpts());
    });

  // ─────────────────────────────────────────
  // lp compound  (collect fees → increaseLiquidity in one tx)
  // ─────────────────────────────────────────
  lp.command("compound")
    .description("Auto-compound: collect accrued LP fees and immediately re-add them as liquidity (V3 fee-only protocols).")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-id <id>", "NFT tokenId of the position to compound")
    .option("--address <address>", "Wallet/recipient address (defaults to DEFI_WALLET_ADDRESS)")
    .option("--slippage <bps>", "Slippage tolerance in basis points (default 50 = 0.5%). Sets amount0Min/amount1Min on increaseLiquidity to protect against MEV.")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const protocol = registry.getProtocol(opts.protocol);
      const recipient = resolveAccount(opts.address, lp.opts<{ wallet?: string }>().wallet);
      const adapter = createDex(protocol, rpcUrl);
      if (!("buildCompound" in adapter) || typeof (adapter as { buildCompound?: unknown }).buildCompound !== "function") {
        throw new Error(`[${protocol.name}] adapter does not support compound (v1 supports V3 fee-only protocols)`);
      }
      const compoundOpts = opts.slippage !== undefined ? { slippageBps: parseInt(opts.slippage, 10) } : undefined;
      const tx = await (adapter as { buildCompound: (tokenId: bigint, recipient: Address, opts?: { slippageBps?: number }) => Promise<unknown> })
        .buildCompound(BigInt(opts.tokenId), recipient, compoundOpts);
      const result = await executor.execute(tx as Parameters<typeof executor.execute>[0]);
      printOutput(result, getOpts());
    });

  // ─────────────────────────────────────────
  // lp positions
  // ─────────────────────────────────────────
  lp.command("positions")
    .description("Show all LP positions across protocols")
    .option("--protocol <protocol>", "Filter to a single protocol slug")
    .option("--pool <address>", "Filter to a specific pool address")
    .option("--bins <binIds>", "Comma-separated bin IDs (for Merchant Moe LB, auto-detected if omitted)")
    .option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain;
      if (!chainName) { printOutput({ error: "--chain is required (e.g. --chain hyperevm)" }, getOpts()); return; }
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const user = resolveAccount(opts.address, lp.opts<{ wallet?: string }>().wallet);

      const allProtocols = registry.getProtocolsForChain(chainName);
      const protocols = opts.protocol
        ? [registry.getProtocol(opts.protocol)]
        : allProtocols;

      const results: Array<Record<string, unknown>> = [];

      await Promise.allSettled(
        protocols.map(async (protocol) => {
          try {
            // Merchant Moe LB positions: scan all rewarded pools (no --pool) or one specific pool
            if (protocol.interface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
              const adapter = createMerchantMoeLB(protocol, rpcUrl);
              const binIds = opts.bins
                ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim()))
                : undefined;
              const poolsToScan: Address[] = opts.pool
                ? [opts.pool as Address]
                : (await adapter.discoverRewardedPools()).map((p) => p.pool as Address);
              for (const poolAddr of poolsToScan) {
                try {
                  const userBins = binIds ?? await adapter.findUserBinsWithBalance(poolAddr, user);
                  if (userBins.length === 0) continue;
                  const positions = await adapter.getUserPositions(user, poolAddr, userBins);
                  if (positions.length === 0) continue;
                  // Query pending MOE for these bins
                  const pending = await adapter.getPendingRewards(user, poolAddr, userBins).catch(() => []);
                  const totalPending = pending.reduce((s, r) => s + (r.amount ?? 0n), 0n);
                  for (const pos of positions) {
                    results.push({
                      protocol: protocol.slug,
                      type: "lb",
                      pool: poolAddr,
                      ...pos,
                      pending_reward: totalPending.toString(),
                      pending_reward_token: pending[0]?.token,
                    });
                  }
                } catch { /* skip pools the user has no balance in */ }
              }
            }

            // V3/Algebra/Hybra NFT positions via position_manager
            const npm = protocol.contracts?.["position_manager"] as Address | undefined;
            if (npm && ["uniswap_v3", "algebra_v3", "hybra"].includes(protocol.interface)) {
              const npmAbi = parseAbi([
                "function balanceOf(address owner) view returns (uint256)",
                "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
              ]);
              const client = createPublicClient({ transport: http(rpcUrl) });
              let count: bigint;
              try {
                count = await client.readContract({ address: npm, abi: npmAbi, functionName: "balanceOf", args: [user] }) as bigint;
              } catch { return; }
              const max = Math.min(Number(count), 50);
              for (let i = 0; i < max; i++) {
                try {
                  const tokenId = await client.readContract({
                    address: npm, abi: npmAbi, functionName: "tokenOfOwnerByIndex", args: [user, BigInt(i)],
                  }) as bigint;
                  // Try Ramses-CL layout (no nonce/operator) first; fallback to standard.
                  const liq = await detectV3Liquidity(client, npm, tokenId);
                  if (liq && liq.liquidity > 0n) {
                    results.push({
                      protocol: protocol.slug,
                      type: "v3_nft",
                      token_id: tokenId.toString(),
                      token0: liq.token0,
                      token1: liq.token1,
                      liquidity: liq.liquidity.toString(),
                      tickLower: liq.tickLower,
                      tickUpper: liq.tickUpper,
                    });
                  }
                } catch { /* skip malformed */ }
              }
            }
          } catch {
            // Skip protocols that fail
          }
        }),
      );

      printOutput(results, getOpts());
    });

  // ─────────────────────────────────────────
  // lp autopilot
  // ─────────────────────────────────────────
  lp.command("autopilot")
    .description("Auto-allocate budget across whitelisted pools (reads ~/.defi/pools.toml)")
    .requiredOption("--budget <usd>", "Total budget in USD")
    .option("--chain <chain>", "Filter whitelist to a specific chain")
    .option("--dry-run", "Show plan only (default)", true)
    .option("--broadcast", "Execute the plan (lending supply supported; LP types show a warning)")
    .action(async (opts) => {
      const budgetUsd = parseFloat(opts.budget as string);
      if (isNaN(budgetUsd) || budgetUsd <= 0) {
        printOutput({ error: `Invalid budget: ${opts.budget}` }, getOpts());
        process.exit(1);
        return;
      }

      // Step 1: Load whitelist
      let whitelist = loadWhitelist();
      if (whitelist.length === 0) {
        printOutput(
          { error: "No pools whitelisted. Create ~/.defi/pools.toml (see config/pools.example.toml)" },
          getOpts(),
        );
        process.exit(1);
        return;
      }

      // Filter by --chain if specified
      const chainFilter = (opts.chain as string | undefined)?.toLowerCase();
      if (chainFilter) {
        whitelist = whitelist.filter((e) => e.chain.toLowerCase() === chainFilter);
        if (whitelist.length === 0) {
          printOutput(
            { error: `No whitelisted pools found for chain '${chainFilter}'` },
            getOpts(),
          );
          process.exit(1);
          return;
        }
      }

      // Step 2: Scan whitelisted pools — fetch current APY/APR for each entry
      const registry = Registry.loadEmbedded();

      interface ScannedEntry {
        entry: WhitelistEntry;
        apy?: number;
        apr?: number;
        active?: boolean;
        scan_error?: string;
      }

      const scanned: ScannedEntry[] = await Promise.all(
        whitelist.map(async (entry): Promise<ScannedEntry> => {
          try {
            const chainName = entry.chain.toLowerCase();
            let chain;
            try {
              chain = registry.getChain(chainName);
            } catch {
              return { entry, scan_error: `Unknown chain '${chainName}'` };
            }
            const rpcUrl = chain.effectiveRpcUrl();

            // Lending: fetch supply APY via getRates
            if (entry.type === "lending" && entry.asset) {
              const protos = registry
                .getProtocolsForChain(chainName)
                .filter(
                  (p) =>
                    p.category === ProtocolCategory.Lending &&
                    p.slug === entry.protocol,
                );
              if (protos.length === 0) {
                return { entry, scan_error: `Protocol not found: ${entry.protocol}` };
              }
              const proto = protos[0]!;
              const assetAddr = registry.resolveToken(chainName, entry.asset).address as Address;
              const adapter = createLending(proto, rpcUrl);
              const rates = await adapter.getRates(assetAddr);
              return { entry, apy: rates.supply_apy };
            }

            // LB: fetch APR from discoverRewardedPools
            if (entry.type === "lb" && entry.pool) {
              const protos = registry
                .getProtocolsForChain(chainName)
                .filter((p) => p.slug === entry.protocol);
              if (protos.length === 0) {
                return { entry, scan_error: `Protocol not found: ${entry.protocol}` };
              }
              const proto = protos[0]!;
              if (proto.interface === "uniswap_v2" && proto.contracts?.["lb_factory"]) {
                const adapter = createMerchantMoeLB(proto, rpcUrl);
                const pools = await adapter.discoverRewardedPools();
                // Match by pool name (pair) or address
                const match = pools.find(
                  (p) =>
                    p.pool.toLowerCase() === entry.pool!.toLowerCase() ||
                    `${p.symbolX}/${p.symbolY}`.toLowerCase() === entry.pool!.toLowerCase() ||
                    `${p.symbolY}/${p.symbolX}`.toLowerCase() === entry.pool!.toLowerCase(),
                );
                if (match) {
                  return { entry, apr: match.aprPercent, active: !match.stopped };
                }
              }
              return { entry, scan_error: "Pool not found in LB discovery" };
            }

            // Farming: fetch active status from discoverFarmingPools
            if (entry.type === "farming" && entry.pool) {
              const protos = registry
                .getProtocolsForChain(chainName)
                .filter((p) => p.slug === entry.protocol);
              if (protos.length === 0) {
                return { entry, scan_error: `Protocol not found: ${entry.protocol}` };
              }
              const proto = protos[0]!;
              if (proto.interface === "algebra_v3" && proto.contracts?.["farming_center"]) {
                const adapter = createKittenSwapFarming(proto, rpcUrl);
                const pools = await adapter.discoverFarmingPools();
                const match = pools.find(
                  (p) => p.pool.toLowerCase() === entry.pool!.toLowerCase(),
                );
                if (match) {
                  return { entry, active: match.active };
                }
              }
              return { entry, scan_error: "Pool not found in farming discovery" };
            }

            // Gauge: check if gauge exists
            if (entry.type === "gauge" && entry.pool) {
              const protos = registry
                .getProtocolsForChain(chainName)
                .filter((p) => p.slug === entry.protocol);
              if (protos.length === 0) {
                return { entry, scan_error: `Protocol not found: ${entry.protocol}` };
              }
              const proto = protos[0]!;
              if (["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(proto.interface) ||
                  (proto.interface === "uniswap_v3" && proto.contracts?.["voter"])) {
                const chainTokens = registry.tokens.get(chainName)?.map(t => t.address);
                const adapter = createGauge(proto, rpcUrl, chainTokens);
                if (adapter.discoverGaugedPools) {
                  const pools = await adapter.discoverGaugedPools();
                  const poolAddr = entry.pool.startsWith("0x")
                    ? entry.pool.toLowerCase()
                    : undefined;
                  const match = pools.find(
                    (p) =>
                      (poolAddr && p.pool.toLowerCase() === poolAddr) ||
                      `${p.token0}/${p.token1}`.toLowerCase() === entry.pool!.toLowerCase() ||
                      `${p.token1}/${p.token0}`.toLowerCase() === entry.pool!.toLowerCase(),
                  );
                  return { entry, active: !!match };
                }
              }
              return { entry, scan_error: "Gauge discovery not supported for this protocol" };
            }

            return { entry, scan_error: "Unsupported entry type or missing pool/asset field" };
          } catch (err) {
            return { entry, scan_error: String(err) };
          }
        }),
      );

      // Step 3: Generate allocation plan
      // Reserve 20% of budget as safety margin
      const RESERVE_PCT = 0.20;
      const deployableBudget = budgetUsd * (1 - RESERVE_PCT);
      const reserveUsd = budgetUsd * RESERVE_PCT;

      // Sort by yield: lending/lb by APY/APR descending, farming/gauge by active first
      const ranked = [...scanned].sort((a, b) => {
        const scoreA = a.apy ?? a.apr ?? (a.active ? 1 : 0);
        const scoreB = b.apy ?? b.apr ?? (b.active ? 1 : 0);
        return scoreB - scoreA;
      });

      // Allocate respecting max_allocation_pct per entry
      const allocations: Array<Record<string, unknown>> = [];
      let remainingBudget = deployableBudget;

      for (const s of ranked) {
        if (remainingBudget <= 0) break;
        const maxAlloc = budgetUsd * (s.entry.max_allocation_pct / 100);
        const alloc = Math.min(maxAlloc, remainingBudget);
        if (alloc <= 0) continue;

        const item: Record<string, unknown> = {
          protocol: s.entry.protocol,
          chain: s.entry.chain,
          type: s.entry.type,
          amount_usd: Math.round(alloc * 100) / 100,
        };
        if (s.entry.pool) item["pool"] = s.entry.pool;
        if (s.entry.asset) item["asset"] = s.entry.asset;
        if (s.apy !== undefined) item["apy"] = s.apy;
        if (s.apr !== undefined) item["apr"] = s.apr;
        if (s.active !== undefined) item["active"] = s.active;
        if (s.scan_error) item["scan_error"] = s.scan_error;

        allocations.push(item);
        remainingBudget -= alloc;
      }

      // Add reserve entry
      const totalReserved = reserveUsd + remainingBudget;
      allocations.push({
        reserve: true,
        amount_usd: Math.round(totalReserved * 100) / 100,
        note: "20% safety margin (hardcoded) + unallocated remainder",
      });

      // Estimate daily/annual yield
      let estimatedAnnualYieldUsd = 0;
      for (const alloc of allocations) {
        if (alloc["reserve"]) continue;
        const amt = alloc["amount_usd"] as number;
        const rate = (alloc["apy"] as number | undefined) ?? (alloc["apr"] as number | undefined);
        if (rate !== undefined && rate > 0) {
          // APY/APR are stored as decimal fractions (e.g. 0.0888 = 8.88%) or percentages (873 = 873%)
          // Use as-is: yield.ts stores supply_apy as a decimal fraction from the protocol adapter
          estimatedAnnualYieldUsd += amt * rate;
        }
      }
      const estimatedDailyYieldUsd = estimatedAnnualYieldUsd / 365;

      const isBroadcast = !!(opts.broadcast as boolean | undefined);

      const plan = {
        budget_usd: budgetUsd,
        deployable_usd: Math.round(deployableBudget * 100) / 100,
        reserve_pct: RESERVE_PCT * 100,
        allocations,
        estimated_daily_yield_usd: Math.round(estimatedDailyYieldUsd * 100) / 100,
        estimated_annual_yield_usd: Math.round(estimatedAnnualYieldUsd * 100) / 100,
        execution: isBroadcast ? "broadcast" : "dry_run",
      };

      printOutput(plan, getOpts());

      if (!isBroadcast) return;

      // Step 4: Execute the plan
      process.stderr.write("\nExecuting autopilot plan...\n");
      const executor = makeExecutor();
      const execResults: Array<Record<string, unknown>> = [];
      let allocIndex = 0;
      const actionAllocs = allocations.filter((a) => !a["reserve"]);

      for (const alloc of actionAllocs) {
        allocIndex++;
        const chainName = (alloc["chain"] as string).toLowerCase();
        let chain;
        try {
          chain = registry.getChain(chainName);
        } catch {
          process.stderr.write(`\n--- ${allocIndex}/${actionAllocs.length}: ${alloc["protocol"]} — unknown chain '${chainName}', skipping ---\n`);
          execResults.push({ ...alloc, exec_status: "skipped", exec_error: `Unknown chain '${chainName}'` });
          continue;
        }
        const rpc = chain.effectiveRpcUrl();

        process.stderr.write(`\n--- ${allocIndex}/${actionAllocs.length}: ${alloc["protocol"]} (${alloc["type"]}) $${alloc["amount_usd"]} ---\n`);

        if (alloc["type"] === "lending" && alloc["asset"]) {
          try {
            const protocol = registry.getProtocol(alloc["protocol"] as string);
            const adapter = createLending(protocol, rpc);
            const tokenInfo = registry.resolveToken(chainName, alloc["asset"] as string);
            const assetAddr = tokenInfo.address as Address;
            const decimals = tokenInfo.decimals ?? 18;
            const amountWei = BigInt(Math.floor((alloc["amount_usd"] as number) * 10 ** decimals));
            const wallet = resolveAccount(undefined, lp.opts<{ wallet?: string }>().wallet);
            const tx = await adapter.buildSupply({
              protocol: alloc["protocol"] as string,
              asset: assetAddr,
              amount: amountWei,
              on_behalf_of: wallet,
            });
            process.stderr.write(`  Supplying ${amountWei} wei of ${alloc["asset"]} to ${alloc["protocol"]}...\n`);
            const result = await executor.execute(tx);
            process.stderr.write(`  Status: ${result.status}\n`);
            const explorerUrl = result.details?.["explorer_url"];
            if (explorerUrl) process.stderr.write(`  Explorer: ${explorerUrl}\n`);
            execResults.push({ ...alloc, exec_status: result.status, tx_hash: result.tx_hash });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`  Error: ${msg}\n`);
            execResults.push({ ...alloc, exec_status: "error", exec_error: msg });
          }
          continue;
        }

        // LP / LB / farming / gauge: require manual token preparation for now
        const lpMsg = `LP execution for type '${alloc["type"]}' pool '${alloc["pool"] ?? ""}' — requires manual token preparation (swap + addLiquidity not yet automated)`;
        process.stderr.write(`  Warning: ${lpMsg}\n`);
        execResults.push({ ...alloc, exec_status: "skipped", exec_note: lpMsg });
      }

      process.stderr.write("\nAutopilot execution complete.\n");
      printOutput({ execution_results: execResults }, getOpts());
    });
}
