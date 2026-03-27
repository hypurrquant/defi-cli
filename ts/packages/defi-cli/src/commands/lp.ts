import type { Command } from "commander";
import type { OutputMode } from "../output.js";
import type { Executor } from "../executor.js";
import { printOutput } from "../output.js";
import { Registry, ProtocolCategory } from "@hypurrquant/defi-core";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createDex,
  createGauge,
  createKittenSwapFarming,
  createMerchantMoeLB,
  createLending,
} from "@hypurrquant/defi-protocols";
import { loadWhitelist } from "../whitelist.js";
import type { WhitelistEntry } from "../whitelist.js";

/** Resolve the wallet owner address from options or env vars */
function resolveAccount(optOwner?: string): Address {
  if (optOwner) return optOwner as Address;
  const walletAddr = process.env["DEFI_WALLET_ADDRESS"];
  if (walletAddr) return walletAddr as Address;
  const privateKey = process.env["DEFI_PRIVATE_KEY"];
  if (privateKey) return privateKeyToAccount(privateKey as `0x${string}`).address;
  throw new Error("--address, DEFI_WALLET_ADDRESS, or DEFI_PRIVATE_KEY is required");
}

/** Resolve a pool: "TOKEN_A/TOKEN_B" name → address from registry, or raw 0x address */
function resolvePoolAddress(registry: ReturnType<typeof Registry.loadEmbedded>, protocolSlug: string, pool: string): Address {
  if (pool.startsWith("0x")) return pool as Address;
  return registry.resolvePool(protocolSlug, pool).address;
}

export function registerLP(parent: Command, getOpts: () => OutputMode, makeExecutor: () => Executor): void {
  const lp = parent.command("lp").description("Unified LP operations: discover, add, farm, claim, remove, positions");

  // ─────────────────────────────────────────
  // lp discover
  // ─────────────────────────────────────────
  lp.command("discover")
    .description("Scan all protocols for fee + emission pools (gauges, farming, LB rewards)")
    .option("--protocol <protocol>", "Filter to a single protocol slug")
    .option("--emission-only", "Only show emission (gauge/farming) pools, skip fee-only")
    .action(async (opts) => {
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();

      // Determine which protocols to scan
      const allProtocols = registry.getProtocolsForChain(chainName);
      const protocols = opts.protocol
        ? [registry.getProtocol(opts.protocol)]
        : allProtocols;

      type DiscoveredPool = {
        protocol: string;
        pool: string;
        pair?: string;
        type: "FEE" | "EMISSION";
        source: "gauge" | "farming" | "lb_hooks" | "fee";
        apr?: string;
        total_reward?: string;
        bonus_reward?: string;
        active?: boolean;
        stopped?: boolean;
        moePerDay?: number;
        aprPercent?: number;
        rangeTvlUsd?: number;
        isTopPool?: boolean;
      };

      const results: DiscoveredPool[] = [];

      await Promise.allSettled(
        protocols.map(async (protocol) => {
          try {
            // Gauge-based protocols (solidly_v2, solidly_cl, algebra_v3, hybra)
            if (
              ["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(protocol.interface)
            ) {
              const adapter = createGauge(protocol, rpcUrl);
              if (adapter.discoverGaugedPools) {
                const pools = await adapter.discoverGaugedPools();
                for (const p of pools) {
                  results.push({
                    protocol: protocol.slug,
                    pool: p.pool,
                    pair: `${p.token0}/${p.token1}`,
                    type: "EMISSION",
                    source: "gauge",
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

            // Merchant Moe LB hooks
            if (protocol.interface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
              const adapter = createMerchantMoeLB(protocol, rpcUrl);
              const pools = await adapter.discoverRewardedPools();
              for (const p of pools) {
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
                    isTopPool: p.isTopPool,
                  });
                }
              }
            }
          } catch {
            // Skip protocols that fail discovery (no adapter, missing contracts, etc.)
          }
        }),
      );

      if (opts.emissionOnly) {
        printOutput(results.filter((r) => r.type === "EMISSION"), getOpts());
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
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createDex(protocol, chain.effectiveRpcUrl());
      const tokenA = opts.tokenA.startsWith("0x")
        ? (opts.tokenA as Address)
        : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x")
        ? (opts.tokenB as Address)
        : registry.resolveToken(chainName, opts.tokenB).address as Address;
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const poolAddr = opts.pool ? resolvePoolAddress(registry, opts.protocol, opts.pool) : undefined;

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
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
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

      // Solidly V2 / CL / Hybra gauge staking
      if (["solidly_v2", "solidly_cl", "hybra"].includes(iface)) {
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
        // Hybra uses tokenId-based deposit; solidly_v2 uses amount (max uint256 = deposit full balance)
        const tokenIdArg = mintedTokenId;
        const amountArg = iface === "solidly_v2"
          ? BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935") // uint256 max
          : 0n;
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
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const protocol = registry.getProtocol(opts.protocol);
      const account = resolveAccount(opts.address);
      const iface = protocol.interface;

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
        if (!opts.pool) throw new Error("--pool is required for Merchant Moe LB claim");
        const adapter = createMerchantMoeLB(protocol, rpcUrl);
        const binIds = opts.bins
          ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim()))
          : undefined;
        const tx = await adapter.buildClaimRewards(account, opts.pool as Address, binIds);
        const result = await executor.execute(tx);
        printOutput(result, getOpts());
        return;
      }

      // Solidly / Hybra gauge claim
      if (["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(iface)) {
        if (!opts.gauge) throw new Error("--gauge is required for gauge claim");
        const adapter = createGauge(protocol, rpcUrl);
        let tx;
        if (opts.tokenId) {
          if (!adapter.buildClaimRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT-based claim`);
          tx = await adapter.buildClaimRewardsByTokenId(opts.gauge as Address, BigInt(opts.tokenId));
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
  // lp remove
  // ─────────────────────────────────────────
  lp.command("remove")
    .description("Auto-unstake (if staked) and remove liquidity from a pool")
    .requiredOption("--protocol <protocol>", "Protocol slug")
    .requiredOption("--token-a <token>", "First token symbol or address")
    .requiredOption("--token-b <token>", "Second token symbol or address")
    .requiredOption("--liquidity <amount>", "Liquidity amount to remove in wei")
    .option("--pool <address>", "Pool address (needed to resolve gauge)")
    .option("--gauge <address>", "Gauge contract address (for solidly/hybra unstake)")
    .option("--token-id <id>", "NFT tokenId (for CL gauge or farming positions)")
    .option("--recipient <address>", "Recipient address")
    .action(async (opts) => {
      const executor = makeExecutor();
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const protocol = registry.getProtocol(opts.protocol);
      const iface = protocol.interface;
      const recipient = (opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001") as Address;
      const tokenA = opts.tokenA.startsWith("0x")
        ? (opts.tokenA as Address)
        : registry.resolveToken(chainName, opts.tokenA).address as Address;
      const tokenB = opts.tokenB.startsWith("0x")
        ? (opts.tokenB as Address)
        : registry.resolveToken(chainName, opts.tokenB).address as Address;

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
      // Solidly / Hybra gauge withdraw
      else if (["solidly_v2", "solidly_cl", "hybra"].includes(iface)) {
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
          process.stderr.write("Step 1/2: Withdrawing from gauge...\n");
          const gaugeAdapter = createGauge(protocol, rpcUrl);
          const tokenId = opts.tokenId ? BigInt(opts.tokenId) : undefined;
          const withdrawTx = await gaugeAdapter.buildWithdraw(gaugeAddr, BigInt(opts.liquidity), tokenId);
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
      const removeTx = await dexAdapter.buildRemoveLiquidity({
        protocol: protocol.name,
        token_a: tokenA,
        token_b: tokenB,
        liquidity: BigInt(opts.liquidity),
        recipient,
      });
      const removeResult = await executor.execute(removeTx);
      printOutput({ step: "lp_remove", ...removeResult }, getOpts());
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
      const chainName = parent.opts<{ chain?: string }>().chain ?? "hyperevm";
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const rpcUrl = chain.effectiveRpcUrl();
      const user = resolveAccount(opts.address);

      const allProtocols = registry.getProtocolsForChain(chainName);
      const protocols = opts.protocol
        ? [registry.getProtocol(opts.protocol)]
        : allProtocols;

      const results: Array<Record<string, unknown>> = [];

      await Promise.allSettled(
        protocols.map(async (protocol) => {
          try {
            // Merchant Moe LB positions
            if (protocol.interface === "uniswap_v2" && protocol.contracts?.["lb_factory"]) {
              if (!opts.pool) return; // LB positions require a pool
              const adapter = createMerchantMoeLB(protocol, rpcUrl);
              const binIds = opts.bins
                ? (opts.bins as string).split(",").map((s: string) => parseInt(s.trim()))
                : undefined;
              const positions = await adapter.getUserPositions(user, opts.pool as Address, binIds);
              for (const pos of positions) {
                results.push({
                  protocol: protocol.slug,
                  type: "lb",
                  pool: opts.pool,
                  ...pos,
                });
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
    .option("--broadcast", "Execute the plan (TODO: not yet implemented)")
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
              if (["solidly_v2", "solidly_cl", "algebra_v3", "hybra"].includes(proto.interface)) {
                const adapter = createGauge(proto, rpcUrl);
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

      const plan = {
        budget_usd: budgetUsd,
        deployable_usd: Math.round(deployableBudget * 100) / 100,
        reserve_pct: RESERVE_PCT * 100,
        allocations,
        estimated_daily_yield_usd: Math.round(estimatedDailyYieldUsd * 100) / 100,
        estimated_annual_yield_usd: Math.round(estimatedAnnualYieldUsd * 100) / 100,
        execution: "dry_run",
        note: "--broadcast execution is not yet implemented in this version",
      };

      printOutput(plan, getOpts());
    });
}
