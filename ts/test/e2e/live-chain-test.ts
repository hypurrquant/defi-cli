#!/usr/bin/env node
/**
 * Live Chain Test — Tests all 40 chains against REAL RPCs (no Anvil fork).
 * Read-only operations only (no broadcast, no private key needed).
 *
 * Rate limit strategy:
 * - 3 second delay between chains
 * - 1 second delay between commands within a chain
 * - Retry once on timeout/rate limit errors
 * - Total expected time: ~15-20 minutes for 40 chains
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

const TS_ROOT = resolve(import.meta.dirname!, "../..");
const CLI = `node ${resolve(TS_ROOT, "packages/defi-cli/dist/main.js")}`;
const FIXTURES_DIR = resolve(TS_ROOT, "test/fixtures");

const DELAY_BETWEEN_CHAINS = 3000;  // 3s between chains
const DELAY_BETWEEN_CMDS = 1000;    // 1s between commands
const CMD_TIMEOUT = 30000;          // 30s per command
const RETRY_DELAY = 5000;           // 5s before retry

interface CmdResult {
  command: string;
  status: "pass" | "fail" | "skip" | "timeout" | "rate_limited";
  detail: string;
  duration_ms: number;
  data?: any;
}

interface ChainResult {
  chain: string;
  chain_id: number;
  protocol_count: number;
  tests: CmdResult[];
  pass: number;
  fail: number;
  skip: number;
  duration_ms: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function runCli(args: string, timeout = CMD_TIMEOUT): { data: any; raw: string } {
  try {
    const raw = execSync(`${CLI} ${args}`, {
      timeout,
      encoding: "utf-8",
      cwd: TS_ROOT,
    }).trim();
    return { data: JSON.parse(raw), raw };
  } catch (e: any) {
    const out = (e.stdout ?? e.stderr ?? "").trim();
    try { return { data: JSON.parse(out), raw: out }; } catch {}

    // Detect specific error types
    if (e.killed || (e.message ?? "").includes("ETIMEDOUT")) {
      throw new Error("TIMEOUT");
    }
    if (out.includes("rate limit") || out.includes("429") || out.includes("Too many")) {
      throw new Error("RATE_LIMITED");
    }
    throw new Error(out.slice(0, 150) || e.message?.slice(0, 150) || "unknown error");
  }
}

function runWithRetry(args: string, timeout = CMD_TIMEOUT): { data: any; raw: string } {
  try {
    return runCli(args, timeout);
  } catch (e: any) {
    if (e.message === "TIMEOUT" || e.message === "RATE_LIMITED") {
      // Retry once after delay
      const waitMs = e.message === "RATE_LIMITED" ? RETRY_DELAY * 2 : RETRY_DELAY;
      execSync(`sleep ${waitMs / 1000}`);
      return runCli(args, timeout);
    }
    throw e;
  }
}

function testCommand(name: string, args: string, validate: (data: any) => string): CmdResult {
  const start = Date.now();
  try {
    const { data } = runWithRetry(args);
    if (data.error) {
      return { command: name, status: "fail", detail: data.error.slice(0, 80), duration_ms: Date.now() - start, data };
    }
    const detail = validate(data);
    return { command: name, status: "pass", detail, duration_ms: Date.now() - start, data };
  } catch (e: any) {
    const msg = e.message ?? "";
    if (msg === "TIMEOUT") {
      return { command: name, status: "timeout", detail: "30s timeout", duration_ms: Date.now() - start };
    }
    if (msg === "RATE_LIMITED") {
      return { command: name, status: "rate_limited", detail: "rate limited after retry", duration_ms: Date.now() - start };
    }
    return { command: name, status: "fail", detail: msg.slice(0, 80), duration_ms: Date.now() - start };
  }
}

async function testChain(chain: string): Promise<ChainResult> {
  const start = Date.now();
  const tests: CmdResult[] = [];

  // 1. Status
  const status = testCommand("status", `status --json --chain ${chain}`,
    (d) => `${d.summary?.total_protocols ?? 0} protocols, chain_id=${d.chain_id}`);
  tests.push(status);

  const protocols = status.data?.protocols ?? [];
  const protocolCount = protocols.length;
  const categories = new Set(protocols.map((p: any) => p.category));

  await sleep(DELAY_BETWEEN_CMDS);

  // 2. Price (if chain has any protocols)
  if (protocolCount > 0) {
    tests.push(testCommand("price", `price --json --chain ${chain} --asset USDC`,
      (d) => `${d.prices?.length ?? 0} price sources`));
    await sleep(DELAY_BETWEEN_CMDS);
  }

  // 3. Lending rates (if lending protocols exist)
  if (categories.has("lending")) {
    const lendingProto = protocols.find((p: any) => p.category === "lending");
    if (lendingProto) {
      // Get slug from protocol name
      const slug = lendingProto.name.toLowerCase().replace(/ /g, "-");
      tests.push(testCommand("lending.rates",
        `lending rates --json --protocol ${slug} --asset 0x0000000000000000000000000000000000000000 --chain ${chain}`,
        (d) => d.supply_apy !== undefined ? `supply=${d.supply_apy?.toFixed?.(2) ?? d.supply_apy}%` : `response received`));
      await sleep(DELAY_BETWEEN_CMDS);
    }
  }

  // 4. Vault info (if vault protocols exist)
  if (categories.has("vault") || categories.has("yield_aggregator")) {
    const vaultProto = protocols.find((p: any) => p.category === "vault" || p.category === "yield_aggregator");
    if (vaultProto) {
      const slug = vaultProto.name.toLowerCase().replace(/ /g, "-");
      tests.push(testCommand("vault.info",
        `vault info --json --protocol ${slug} --chain ${chain}`,
        (d) => `total_assets=${d.total_assets ?? "?"}`));
      await sleep(DELAY_BETWEEN_CMDS);
    }
  }

  // 5. Staking info (if liquid_staking exists)
  if (categories.has("liquid_staking")) {
    const stakingProto = protocols.find((p: any) => p.category === "liquid_staking");
    if (stakingProto) {
      const slug = stakingProto.name.toLowerCase().replace(/ /g, "-");
      tests.push(testCommand("staking.info",
        `staking info --json --protocol ${slug} --chain ${chain}`,
        (d) => `exchange_rate=${d.exchange_rate ?? "?"}`));
      await sleep(DELAY_BETWEEN_CMDS);
    }
  }

  // 6. Scan (if protocols exist)
  if (protocolCount > 0) {
    tests.push(testCommand("scan", `scan --json --chain ${chain} --once`,
      (d) => `${d.scan_duration_ms ?? "?"}ms, ${(d.findings ?? []).length} findings`));
    await sleep(DELAY_BETWEEN_CMDS);
  }

  // 7. NFT info (if nft collection with erc721 interface exists)
  const nftProto = protocols.find((p: any) => p.category === "nft" && p.interface === "erc721");
  if (nftProto) {
    const collection = nftProto.contracts?.[0]?.address ?? Object.values(nftProto.contracts ?? {})[0];
    if (collection && collection !== "0x0000000000000000000000000000000000000000") {
      tests.push(testCommand("nft.info",
        `nft info --json --collection ${collection} --chain ${chain}`,
        (d) => `${d.name ?? "?"} (${d.symbol ?? "?"})`));
      await sleep(DELAY_BETWEEN_CMDS);
    }
  }

  const pass = tests.filter(t => t.status === "pass").length;
  const fail = tests.filter(t => t.status === "fail" || t.status === "timeout" || t.status === "rate_limited").length;
  const skip = tests.filter(t => t.status === "skip").length;

  return {
    chain,
    chain_id: status.data?.chain_id ?? 0,
    protocol_count: protocolCount,
    tests,
    pass, fail, skip,
    duration_ms: Date.now() - start,
  };
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  LIVE CHAIN TEST — All 40 Chains, Real RPCs             ║");
  console.log("║  Rate limit: 3s between chains, 1s between commands      ║");
  console.log("║  Retry: 1x on timeout/rate limit with 5-10s backoff     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Get all chains from fixtures
  const chains = readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith(".yaml"))
    .map(f => f.replace(".yaml", ""))
    .sort();

  console.log(`Testing ${chains.length} chains...\n`);

  const results: ChainResult[] = [];
  const startTotal = Date.now();

  // Run chains in parallel batches of 8
  const BATCH_SIZE = 8;
  for (let b = 0; b < chains.length; b += BATCH_SIZE) {
    const batch = chains.slice(b, b + BATCH_SIZE);
    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chains.length / BATCH_SIZE);
    console.log(`\n── Batch ${batchNum}/${totalBatches}: ${batch.join(", ")} ──`);

    const batchResults = await Promise.all(
      batch.map(async (chain, idx) => {
        // Stagger start within batch to avoid simultaneous RPC hits
        await sleep(idx * 500);
        const result = await testChain(chain);
        const emoji = result.fail === 0 ? "✅" : "⚠️";
        console.log(`  ${emoji} ${chain.padEnd(15)} ${result.pass}/${result.tests.length} pass | ${result.protocol_count} protos | ${(result.duration_ms / 1000).toFixed(1)}s`);
        return result;
      })
    );
    results.push(...batchResults);

    // Delay between batches to respect rate limits
    if (b + BATCH_SIZE < chains.length) {
      console.log(`  ⏳ Rate limit cooldown (${DELAY_BETWEEN_CHAINS / 1000}s)...`);
      await sleep(DELAY_BETWEEN_CHAINS);
    }
  }

  const totalMs = Date.now() - startTotal;

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("SUMMARY");
  console.log(`${"═".repeat(60)}`);

  const totalPass = results.reduce((s, r) => s + r.pass, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const totalTests = results.reduce((s, r) => s + r.tests.length, 0);
  const chainsOk = results.filter(r => r.fail === 0).length;

  console.log(`Chains: ${chainsOk}/${results.length} clean (no failures)`);
  console.log(`Tests:  ${totalPass}/${totalTests} pass, ${totalFail} fail`);
  console.log(`Time:   ${(totalMs / 1000 / 60).toFixed(1)} minutes\n`);

  // Failed tests detail
  const failures = results.flatMap(r => r.tests.filter(t => t.status !== "pass").map(t => ({ chain: r.chain, ...t })));
  if (failures.length > 0) {
    console.log("FAILURES:");
    for (const f of failures) {
      console.log(`  ${f.chain.padEnd(15)} ${f.command.padEnd(20)} ${f.status.padEnd(12)} ${f.detail.slice(0, 60)}`);
    }
  }

  // Per-chain results table
  console.log(`\nPER-CHAIN RESULTS:`);
  for (const r of results) {
    const emoji = r.fail === 0 ? "✅" : "⚠️";
    const tests = r.tests.map(t => `${t.command}:${t.status === "pass" ? "✓" : "✗"}`).join(" ");
    console.log(`${emoji} ${r.chain.padEnd(15)} ${String(r.protocol_count).padStart(3)} protos | ${tests}`);
  }

  // Save results
  const reportPath = resolve(TS_ROOT, "test/e2e/live-chain-results.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${reportPath}`);

  // Lesson learned: collect unique error patterns
  const errorPatterns = new Map<string, string[]>();
  for (const f of failures) {
    const pattern = f.detail.slice(0, 40);
    const chains = errorPatterns.get(pattern) ?? [];
    chains.push(f.chain);
    errorPatterns.set(pattern, chains);
  }

  if (errorPatterns.size > 0) {
    console.log(`\nERROR PATTERNS:`);
    for (const [pattern, chains] of errorPatterns) {
      console.log(`  "${pattern}" — ${chains.length} chains: ${chains.join(", ")}`);
    }
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(console.error);
