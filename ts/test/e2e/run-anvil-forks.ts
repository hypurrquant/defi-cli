#!/usr/bin/env node
/**
 * Anvil Fork Test Runner — forks each chain, runs CLI commands, reports results.
 * Usage: npx tsx test/e2e/run-anvil-forks.ts
 */
import { execSync, spawn, type ChildProcess } from "child_process";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const ANVIL = "/Users/hik/.foundry/bin/anvil";
const TS_ROOT = resolve(import.meta.dirname!, "../..");
const CLI = `node ${resolve(TS_ROOT, "packages/defi-cli/dist/main.js")}`;
const CONFIG = resolve(TS_ROOT, "config");

// Parse chains.toml for RPC URLs
function getChainRpcs(): Array<{ slug: string; name: string; rpc: string; chainId: number }> {
  const content = readFileSync(join(CONFIG, "chains.toml"), "utf-8");
  const chains: Array<{ slug: string; name: string; rpc: string; chainId: number }> = [];
  const blocks = content.split(/\[chain\./);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const slugMatch = block.match(/^(\w+)\]/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    const name = block.match(/name\s*=\s*"([^"]+)"/)?.[1] ?? slug;
    const rpc = block.match(/rpc_url\s*=\s*"([^"]+)"/)?.[1];
    const chainId = parseInt(block.match(/chain_id\s*=\s*(\d+)/)?.[1] ?? "0");
    if (rpc) chains.push({ slug, name, rpc, chainId });
  }
  return chains;
}

// Count protocols for a chain
function getProtocolCount(slug: string): number {
  try {
    const out = execSync(`${CLI} status --json --chain ${slug}`, { timeout: 10000, encoding: "utf-8" });
    const d = JSON.parse(out);
    return d.summary?.total_protocols ?? 0;
  } catch { return 0; }
}

// Start Anvil fork
async function startAnvil(rpc: string, port: number): Promise<ChildProcess | null> {
  return new Promise((resolve) => {
    const proc = spawn(ANVIL, ["--fork-url", rpc, "--port", String(port), "--no-mining", "--silent"], {
      stdio: "ignore",
    });
    proc.on("error", () => resolve(null));
    setTimeout(() => {
      if (proc.killed) resolve(null);
      else resolve(proc);
    }, 6000);
  });
}

// Run CLI command with custom RPC
function runCli(args: string, envKey: string, port: number): any {
  try {
    const out = execSync(`${CLI} ${args}`, {
      timeout: 20000,
      encoding: "utf-8",
      env: { ...process.env, [envKey]: `http://127.0.0.1:${port}` },
      cwd: TS_ROOT,
    });
    return JSON.parse(out.trim());
  } catch (e: any) {
    try { return JSON.parse((e.stdout ?? "").trim()); } catch {}
    try { return JSON.parse((e.stderr ?? "").trim()); } catch {}
    return { error: (e.message ?? "").slice(0, 100) };
  }
}

interface TestResult {
  chain: string;
  chainId: number;
  protocols: number;
  anvil: "ok" | "failed" | "skipped";
  status: "pass" | "fail" | "skip";
  tests: Array<{ cmd: string; result: "pass" | "fail" | "error"; detail: string }>;
}

async function main() {
  const chains = getChainRpcs();
  const results: TestResult[] = [];
  const BASE_PORT = 8700;

  console.log(`\n🔧 Anvil Fork Test Runner — ${chains.length} chains\n`);

  for (let i = 0; i < chains.length; i++) {
    const { slug, name, rpc, chainId } = chains[i];
    const port = BASE_PORT + i;
    const protocols = getProtocolCount(slug);
    const envKey = `${slug.toUpperCase()}_RPC_URL`;

    const result: TestResult = { chain: slug, chainId, protocols, anvil: "skipped", status: "skip", tests: [] };

    if (protocols === 0) {
      console.log(`⏭  ${name} (${slug}) — 0 protocols, skipping`);
      results.push(result);
      continue;
    }

    process.stdout.write(`🔄 ${name} (${slug}) port=${port} — `);

    // Start Anvil
    const anvil = await startAnvil(rpc, port);
    if (!anvil) {
      console.log("❌ Anvil fork failed");
      result.anvil = "failed";
      result.status = "fail";
      results.push(result);
      continue;
    }
    result.anvil = "ok";

    // Test 1: status
    const statusData = runCli(`status --json --chain ${slug}`, envKey, port);
    if (statusData.chain_id === chainId) {
      result.tests.push({ cmd: "status", result: "pass", detail: `${statusData.summary?.total_protocols} protocols` });
    } else {
      result.tests.push({ cmd: "status", result: "fail", detail: JSON.stringify(statusData).slice(0, 80) });
    }

    // Test 2: lending rates (if lending protocols exist)
    const hasLending = statusData.protocols?.some((p: any) => p.category === "lending");
    if (hasLending) {
      const lendingProto = statusData.protocols.find((p: any) => p.category === "lending");
      const lendingSlug = lendingProto?.name?.toLowerCase().replace(/ /g, "-");
      // Try to get rates - may need actual asset address
      const ratesData = runCli(`lending rates --json --protocol ${lendingSlug} --asset 0x0000000000000000000000000000000000000000`, envKey, port);
      if (ratesData.supply_apy !== undefined) {
        result.tests.push({ cmd: "lending rates", result: "pass", detail: `apy=${ratesData.supply_apy}` });
      } else if (ratesData.error) {
        result.tests.push({ cmd: "lending rates", result: "error", detail: ratesData.error.slice(0, 60) });
      } else {
        result.tests.push({ cmd: "lending rates", result: "fail", detail: "no apy" });
      }
    }

    // Test 3: scan
    const scanData = runCli(`scan --json --chain ${slug} --once`, envKey, port);
    if (scanData.timestamp || scanData.chain) {
      result.tests.push({ cmd: "scan", result: "pass", detail: `findings=${(scanData.findings ?? []).length}` });
    } else if (scanData.error) {
      result.tests.push({ cmd: "scan", result: "error", detail: scanData.error.slice(0, 60) });
    }

    // Determine overall status
    const passed = result.tests.filter(t => t.result === "pass").length;
    result.status = passed > 0 ? "pass" : "fail";

    // Kill Anvil
    anvil.kill("SIGTERM");

    const emoji = result.status === "pass" ? "✅" : "❌";
    console.log(`${emoji} ${passed}/${result.tests.length} tests passed`);

    results.push(result);

    // Small delay between chains to avoid RPC rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const skipped = results.filter(r => r.status === "skip").length;
  console.log(`✅ Pass: ${passed}  ❌ Fail: ${failed}  ⏭ Skip: ${skipped}  Total: ${results.length}`);
  console.log("");

  // Detail table
  for (const r of results) {
    const emoji = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭";
    const tests = r.tests.map(t => `${t.cmd}:${t.result}`).join(", ") || "no tests";
    console.log(`${emoji} ${r.chain.padEnd(15)} ${String(r.protocols).padStart(3)} protos | anvil=${r.anvil.padEnd(7)} | ${tests}`);
  }

  // Save results
  const reportPath = join(TS_ROOT, "test/e2e/anvil-results.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
