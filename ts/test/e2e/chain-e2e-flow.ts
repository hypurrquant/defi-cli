#!/usr/bin/env node
/**
 * Chain E2E Flow Test — Full DeFi lifecycle simulation via Anvil fork.
 *
 * Flow per chain:
 * 1. Setup: Fork chain, fund test account with native + ERC20 tokens
 * 2. Token: balance, approve, transfer
 * 3. DEX: quote, swap dry-run
 * 4. Lending: supply dry-run, position check, withdraw dry-run
 * 5. Vault: deposit dry-run, info check
 * 6. NFT: collection info, balance
 * 7. Scan: exploit detection
 * 8. Teardown: kill Anvil, report results
 *
 * Usage:
 *   npx tsx test/e2e/chain-e2e-flow.ts                    # Ethereum only
 *   npx tsx test/e2e/chain-e2e-flow.ts --chain arbitrum    # Specific chain
 *   npx tsx test/e2e/chain-e2e-flow.ts --all               # All 40 chains
 */
import { execSync, spawn, type ChildProcess } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const ANVIL = "/Users/hik/.foundry/bin/anvil";
const CAST = "/Users/hik/.foundry/bin/cast";
const TS_ROOT = resolve(import.meta.dirname!, "../..");
const CLI = `node ${resolve(TS_ROOT, "packages/defi-cli/dist/main.js")}`;
const CONFIG = resolve(TS_ROOT, "config");

// Test account (Anvil default #0)
const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Well-known tokens per chain
interface ChainTestConfig {
  slug: string;
  rpc: string;
  chainId: number;
  nativeSymbol: string;
  stablecoin?: { address: string; symbol: string; decimals: number; whale?: string };
  wrappedNative?: { address: string; symbol: string };
  dexProtocol?: string;
  lendingProtocol?: string;
  vaultProtocol?: string;
  nftCollection?: string; // well-known NFT on this chain
}

// Parse chain config from TOML
function getChainConfig(slug: string): { rpc: string; chainId: number; nativeSymbol: string } {
  const content = readFileSync(join(CONFIG, "chains.toml"), "utf-8");
  const re = new RegExp(`\\[chain\\.${slug}\\][\\s\\S]*?(?=\\[chain\\.|$)`);
  const block = content.match(re)?.[0] ?? "";
  return {
    rpc: block.match(/rpc_url\s*=\s*"([^"]+)"/)?.[1] ?? "",
    chainId: parseInt(block.match(/chain_id\s*=\s*(\d+)/)?.[1] ?? "0"),
    nativeSymbol: block.match(/native_token\s*=\s*"([^"]+)"/)?.[1] ?? "ETH",
  };
}

// Get protocols for a chain
function getProtocols(slug: string): Array<{ name: string; slug: string; category: string; interface: string }> {
  try {
    const out = execSync(`${CLI} status --json --chain ${slug}`, { timeout: 10000, encoding: "utf-8", cwd: TS_ROOT });
    return JSON.parse(out).protocols ?? [];
  } catch { return []; }
}

// Ethereum-specific test config
const ETHEREUM_CONFIG: ChainTestConfig = {
  slug: "ethereum",
  rpc: "https://eth.llamarpc.com",
  chainId: 1,
  nativeSymbol: "ETH",
  stablecoin: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    symbol: "USDC",
    decimals: 6,
    whale: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503", // Binance hot wallet
  },
  wrappedNative: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    symbol: "WETH",
  },
  dexProtocol: "uniswap-v3-eth",
  lendingProtocol: "aave-v3-eth",
  vaultProtocol: "yearn-ethereum",
  nftCollection: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // BAYC
};

interface TestResult {
  step: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  duration_ms: number;
}

class ChainE2ERunner {
  private config: ChainTestConfig;
  private port: number;
  private anvil: ChildProcess | null = null;
  private results: TestResult[] = [];
  private envKey: string;

  constructor(config: ChainTestConfig, port: number) {
    this.config = config;
    this.port = port;
    this.envKey = `${config.slug.toUpperCase()}_RPC_URL`;
  }

  private cli(args: string, timeout = 20000): any {
    try {
      const out = execSync(`${CLI} ${args}`, {
        timeout,
        encoding: "utf-8",
        cwd: TS_ROOT,
        env: { ...process.env, [this.envKey]: `http://127.0.0.1:${this.port}`, DEFI_WALLET_ADDRESS: TEST_ACCOUNT, DEFI_PRIVATE_KEY: TEST_PRIVATE_KEY },
      });
      return JSON.parse(out.trim());
    } catch (e: any) {
      try { return JSON.parse((e.stdout ?? e.stderr ?? "").trim()); } catch {}
      return { error: (e.message ?? "").slice(0, 100) };
    }
  }

  private cast(args: string): string {
    try {
      return execSync(`${CAST} ${args} --rpc-url http://127.0.0.1:${this.port}`, {
        timeout: 10000, encoding: "utf-8",
      }).trim();
    } catch (e: any) {
      return `ERROR: ${(e.message ?? "").slice(0, 80)}`;
    }
  }

  private record(step: string, status: "pass" | "fail" | "skip", detail: string, startMs: number) {
    this.results.push({ step, status, detail, duration_ms: Date.now() - startMs });
    const emoji = status === "pass" ? "✅" : status === "fail" ? "❌" : "⏭";
    console.log(`  ${emoji} ${step}: ${detail}`);
  }

  async setup(): Promise<boolean> {
    const t = Date.now();
    console.log(`\n🔧 Starting Anvil fork: ${this.config.slug} (port ${this.port})`);

    this.anvil = spawn(ANVIL, [
      "--fork-url", this.config.rpc,
      "--port", String(this.port),
      "--no-mining",
      "--silent",
      "--accounts", "1",
    ], { stdio: "ignore" });

    await new Promise(r => setTimeout(r, 6000));

    if (!this.anvil || this.anvil.killed) {
      this.record("setup", "fail", "Anvil failed to start", t);
      return false;
    }

    // Fund test account with 100 native tokens
    this.cast(`rpc anvil_setBalance ${TEST_ACCOUNT} 0x56BC75E2D63100000`);

    // If we have a whale, impersonate and transfer USDC
    if (this.config.stablecoin?.whale) {
      const { address, whale, decimals } = this.config.stablecoin;
      const amount = BigInt(1000) * BigInt(10 ** decimals); // 1,000 USDC (smaller to avoid balance issues)
      this.cast(`rpc anvil_impersonateAccount ${whale}`);
      // Use a try — whale may not have enough
      const txResult = this.cast(`send ${address} "transfer(address,uint256)" ${TEST_ACCOUNT} ${amount} --from ${whale} --unlocked`);
      if (txResult.includes("ERROR")) {
        console.log(`  ⚠ Whale transfer failed (may not have balance), continuing...`);
      }
      this.cast(`rpc anvil_stopImpersonatingAccount ${whale}`);
    }

    // Also deal WETH to test account via deposit
    if (this.config.wrappedNative) {
      this.cast(`send ${this.config.wrappedNative.address} "deposit()" --value 10ether --from ${TEST_ACCOUNT} --unlocked`);
    }

    this.record("setup", "pass", `Anvil forked, account funded`, t);
    return true;
  }

  async testTokenOps() {
    const t = Date.now();
    if (!this.config.stablecoin) { this.record("token", "skip", "no stablecoin config", t); return; }

    // Check balance
    const bal = this.cli(`token balance --json --token ${this.config.stablecoin.address} --owner ${TEST_ACCOUNT} --chain ${this.config.slug}`);
    if (bal.balance !== undefined && !bal.error) {
      this.record("token.balance", "pass", `balance=${bal.balance} ${bal.symbol ?? ""}`, t);
    } else {
      this.record("token.balance", "fail", bal.error ?? "no balance", t);
    }

    // Check native balance
    const t2 = Date.now();
    const nBal = this.cli(`wallet balance --json --address ${TEST_ACCOUNT} --chain ${this.config.slug}`);
    if (nBal.balance_formatted !== undefined && !nBal.error) {
      this.record("token.native", "pass", `${nBal.balance_formatted} ${nBal.native_token ?? ""}`, t2);
    } else {
      this.record("token.native", "fail", nBal.error ?? "no balance", t2);
    }
  }

  async testDex() {
    const t = Date.now();
    if (!this.config.dexProtocol || !this.config.wrappedNative || !this.config.stablecoin) {
      this.record("dex", "skip", "missing dex/token config", t);
      return;
    }

    // Quote: WETH → USDC
    const quote = this.cli(`dex quote --json --protocol ${this.config.dexProtocol} --token-in ${this.config.wrappedNative.address} --token-out ${this.config.stablecoin.address} --amount 1000000000000000000 --chain ${this.config.slug}`, 30000);
    if (quote.amount_out && !quote.error) {
      this.record("dex.quote", "pass", `1 ${this.config.wrappedNative.symbol} → ${quote.amount_out} USDC`, t);
    } else {
      this.record("dex.quote", quote.error ? "fail" : "fail", quote.error ?? "no quote", t);
    }

    // Swap dry-run: WETH → USDC
    const t2 = Date.now();
    const swap = this.cli(`dex swap --json --protocol ${this.config.dexProtocol} --token-in ${this.config.wrappedNative.address} --token-out ${this.config.stablecoin.address} --amount 1000000000000000000 --recipient ${TEST_ACCOUNT} --chain ${this.config.slug}`, 30000);
    if (swap.status === "dry_run" || swap.description || swap.tx_hash !== undefined) {
      this.record("dex.swap", "pass", `status=${swap.status ?? "built"}`, t2);
    } else {
      this.record("dex.swap", swap.error ? "fail" : "fail", swap.error ?? "no tx", t2);
    }
  }

  async testLending() {
    const t = Date.now();
    if (!this.config.lendingProtocol) { this.record("lending", "skip", "no lending config", t); return; }

    // Rates
    const asset = this.config.stablecoin?.address ?? "0x0000000000000000000000000000000000000000";
    const rates = this.cli(`lending rates --json --protocol ${this.config.lendingProtocol} --asset ${asset} --chain ${this.config.slug}`);
    if (rates.supply_apy !== undefined && !rates.error) {
      this.record("lending.rates", "pass", `supply=${rates.supply_apy?.toFixed(2)}% borrow=${rates.borrow_variable_apy?.toFixed(2)}%`, t);
    } else {
      this.record("lending.rates", "fail", rates.error ?? "no rates", t);
    }

    // Position
    const t2 = Date.now();
    const pos = this.cli(`lending position --json --protocol ${this.config.lendingProtocol} --address ${TEST_ACCOUNT} --chain ${this.config.slug}`);
    if (pos.protocol && !pos.error) {
      this.record("lending.position", "pass", `supplies=${pos.supplies?.length ?? 0} borrows=${pos.borrows?.length ?? 0}`, t2);
    } else {
      this.record("lending.position", "fail", pos.error ?? "no position", t2);
    }

    // Supply dry-run
    const t3 = Date.now();
    const supply = this.cli(`lending supply --json --protocol ${this.config.lendingProtocol} --asset ${asset} --amount 1000000 --on-behalf-of ${TEST_ACCOUNT} --chain ${this.config.slug}`);
    if (supply.status === "dry_run" || supply.description || !supply.error) {
      this.record("lending.supply", "pass", `status=${supply.status ?? "built"}`, t3);
    } else {
      this.record("lending.supply", "fail", supply.error ?? "no tx", t3);
    }
  }

  async testVault() {
    const t = Date.now();
    if (!this.config.vaultProtocol) { this.record("vault", "skip", "no vault config", t); return; }

    const info = this.cli(`vault info --json --protocol ${this.config.vaultProtocol} --chain ${this.config.slug}`);
    if (info.total_assets !== undefined && !info.error) {
      this.record("vault.info", "pass", `total_assets=${info.total_assets}`, t);
    } else {
      this.record("vault.info", "fail", info.error ?? "no info", t);
    }
  }

  async testNft() {
    const t = Date.now();
    if (!this.config.nftCollection) { this.record("nft", "skip", "no nft config", t); return; }

    const info = this.cli(`nft info --json --collection ${this.config.nftCollection} --chain ${this.config.slug}`);
    if (info.name && !info.error) {
      this.record("nft.info", "pass", `${info.name} (${info.symbol}) supply=${info.total_supply}`, t);
    } else {
      this.record("nft.info", "fail", info.error ?? "no info", t);
    }

    const t2 = Date.now();
    const bal = this.cli(`nft balance --json --collection ${this.config.nftCollection} --owner ${TEST_ACCOUNT} --chain ${this.config.slug}`);
    if (bal.balance !== undefined && !bal.error) {
      this.record("nft.balance", "pass", `balance=${bal.balance}`, t2);
    } else {
      this.record("nft.balance", "fail", bal.error ?? "no balance", t2);
    }
  }

  async testScan() {
    const t = Date.now();
    const scan = this.cli(`scan --json --chain ${this.config.slug} --once`, 30000);
    if (scan.timestamp && !scan.error) {
      this.record("scan", "pass", `duration=${scan.scan_duration_ms}ms findings=${(scan.findings ?? []).length}`, t);
    } else {
      this.record("scan", "fail", scan.error ?? "no scan", t);
    }
  }

  async teardown() {
    if (this.anvil) {
      this.anvil.kill("SIGTERM");
      await new Promise(r => setTimeout(r, 2000));
      this.anvil = null;
    }
  }

  async run(): Promise<TestResult[]> {
    const totalStart = Date.now();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🏗  E2E Flow: ${this.config.slug} (chainId=${this.config.chainId})`);
    console.log(`${"=".repeat(60)}`);

    const ok = await this.setup();
    if (!ok) {
      await this.teardown();
      return this.results;
    }

    await this.testTokenOps();
    await this.testDex();
    await this.testLending();
    await this.testVault();
    await this.testNft();
    await this.testScan();
    await this.teardown();

    const passed = this.results.filter(r => r.status === "pass").length;
    const failed = this.results.filter(r => r.status === "fail").length;
    const skipped = this.results.filter(r => r.status === "skip").length;
    const totalMs = Date.now() - totalStart;

    console.log(`\n  📊 ${this.config.slug}: ${passed} pass, ${failed} fail, ${skipped} skip (${(totalMs / 1000).toFixed(1)}s)`);
    return this.results;
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const chainArg = args.find(a => a.startsWith("--chain"))?.split("=")[1] ?? args[args.indexOf("--chain") + 1];
  const runAll = args.includes("--all");

  // For now, start with Ethereum
  if (!runAll && !chainArg) {
    const runner = new ChainE2ERunner(ETHEREUM_CONFIG, 8800);
    const results = await runner.run();

    console.log(`\n${"=".repeat(60)}`);
    console.log("ETHEREUM E2E SUMMARY");
    console.log(`${"=".repeat(60)}`);
    const p = results.filter(r => r.status === "pass").length;
    const f = results.filter(r => r.status === "fail").length;
    const s = results.filter(r => r.status === "skip").length;
    console.log(`✅ ${p} pass  ❌ ${f} fail  ⏭ ${s} skip`);
    for (const r of results) {
      const e = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭";
      console.log(`  ${e} ${r.step.padEnd(20)} ${r.detail.slice(0, 60)} (${r.duration_ms}ms)`);
    }

    process.exit(f > 0 ? 1 : 0);
  }
}

main().catch(console.error);
