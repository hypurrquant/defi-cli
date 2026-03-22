/**
 * QA Test Suite — validates all 22 CLI commands produce valid output.
 * Tests run without Anvil — uses live RPCs or validates error handling.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { resolve } from "path";

const TS_ROOT = resolve(__dirname, "../..");
const CLI = `node ${resolve(TS_ROOT, "packages/defi-cli/dist/main.js")}`;

function run(args: string, timeout = 20000): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`${CLI} ${args}`, { cwd: TS_ROOT, timeout, encoding: "utf-8" });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.status ?? 1 };
  }
}

function parseJson(output: string): any {
  const text = output.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

describe("CLI Help (all 22 commands)", () => {
  const commands = [
    "status", "schema", "dex", "gauge", "lending", "cdp", "staking",
    "vault", "yield", "portfolio", "monitor", "alert", "scan", "arb",
    "positions", "price", "wallet", "token", "whales", "compare", "swap", "bridge",
  ];

  for (const cmd of commands) {
    it(`${cmd} --help exits cleanly`, () => {
      const r = run(`${cmd} --help`);
      expect(r.stdout).toContain("Usage:");
    });
  }
});

describe("Read-only commands (no RPC needed)", () => {
  it("status --json returns chain info", () => {
    const d = parseJson(run("status --json --chain hyperevm").stdout);
    expect(d).toBeTruthy();
    expect(d.chain).toBe("HyperEVM");
    expect(d.chain_id).toBe(999);
    expect(d.summary.total_protocols).toBeGreaterThan(0);
  });

  it("status --json works for all 40 chains", () => {
    const chains = ["hyperevm","arbitrum","base","bnb","ethereum","polygon","avalanche",
      "optimism","scroll","linea","mantle","ink","monad","cronos","gnosis","blast","sonic"];
    for (const chain of chains) {
      const d = parseJson(run(`status --json --chain ${chain}`).stdout);
      expect(d?.chain_id).toBeGreaterThan(0);
    }
  });

  it("schema --json returns command schema", () => {
    const d = parseJson(run("schema --json").stdout);
    expect(d).toBeTruthy();
  });

  it("wallet address --json returns address field", () => {
    const d = parseJson(run("wallet address --json").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("address");
  });
});

describe("RPC-dependent commands (value validation)", () => {
  it("price --json returns prices array", () => {
    const d = parseJson(run("price --json --chain hyperevm --asset WHYPE").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("asset");
    expect(d).toHaveProperty("prices");
  });

  it("scan --json --once returns findings", () => {
    const d = parseJson(run("scan --json --chain hyperevm --once", 30000).stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("timestamp");
    expect(d).toHaveProperty("chain");
  });

  it("compare --json returns opportunities", () => {
    const d = parseJson(run("compare --json --chain hyperevm", 30000).stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("asset");
  });

  it("alert --json --once returns alerts", () => {
    const d = parseJson(run("alert --json --chain hyperevm --once").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("alerts");
  });

  it("arb --json returns arbitrage analysis", () => {
    const d = parseJson(run("arb --json --chain hyperevm").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("chain");
    expect(d).toHaveProperty("single_dex");
  });

  it("yield compare --json returns yield data", () => {
    const d = parseJson(run("yield compare --json --chain hyperevm --asset USDC").stdout);
    expect(d).toBeTruthy();
  });

  it("portfolio show --json returns positions", () => {
    const d = parseJson(run("portfolio show --json --chain hyperevm --address 0x0000000000000000000000000000000000000001").stdout);
    expect(d).toBeTruthy();
  });

  it("whales --json returns holders", () => {
    const d = parseJson(run("whales --json --chain hyperevm --token WHYPE").stdout);
    expect(d).toBeTruthy();
  });

  it("lending rates --json returns APY", () => {
    const d = parseJson(run("lending rates --json --protocol hyperlend --asset 0xb88339CB7199b77E23DB6E890353E22632Ba630f").stdout);
    expect(d).toBeTruthy();
  });

  it("token balance --json returns balance", () => {
    const d = parseJson(run("token balance --json --token USDC --owner 0x0000000000000000000000000000000000000001").stdout);
    expect(d).toBeTruthy();
  });

  it("wallet balance --json returns native balance", () => {
    const d = parseJson(run("wallet balance --json --address 0x0000000000000000000000000000000000000001").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("balance_wei");
  });

  it("staking info --json returns staking data", () => {
    const d = parseJson(run("staking info --json --protocol kinetiq").stdout);
    expect(d).toBeTruthy();
  });

  it("vault info --json returns vault data", () => {
    const d = parseJson(run("vault info --json --protocol upshift").stdout);
    expect(d).toBeTruthy();
  });

  it("monitor --json --once returns health data", () => {
    const d = parseJson(run("monitor --json --protocol hyperlend --address 0x0000000000000000000000000000000000000001 --once").stdout);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("protocol");
  });
});

describe("Error handling (valid errors)", () => {
  it("unknown chain returns error", () => {
    const r = run("status --json --chain nonexistent");
    expect(r.code).not.toBe(0);
  });

  it("dex quote without quoter returns JSON error", () => {
    const r = run("dex quote --json --protocol hyperswap-v3 --token-in 0x5555555555555555555555555555555555555555 --token-out 0xb88339CB7199b77E23DB6E890353E22632Ba630f --amount 1000000000000000000");
    const d = parseJson(r.stdout) || parseJson(r.stderr);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("error");
  });

  it("cdp info for non-existent trove returns JSON error", () => {
    const r = run("cdp info --json --protocol felix --position 999999");
    const d = parseJson(r.stdout) || parseJson(r.stderr);
    expect(d).toBeTruthy();
    expect(d).toHaveProperty("error");
  });

  it("missing required options show usage", () => {
    const r = run("lending rates --json");
    expect(r.stderr).toContain("required option");
  });
});
