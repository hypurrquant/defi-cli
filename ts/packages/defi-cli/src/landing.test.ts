// Unit tests for landing.ts — the `defi` top-level dashboard (rendered when
// the user runs the CLI with no subcommand). Tests cover both render modes
// (human / JSON) and the no-wallet vs wallet-configured branches without
// touching real RPC.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

let multicallShouldThrow = false;

vi.mock("@hypurrquant/defi-core", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("@hypurrquant/defi-core");
  return {
    ...real,
    multicallRead: async (_rpc: string, calls: Array<[Address, Hex]>) => {
      if (multicallShouldThrow) throw new Error("simulated multicall failure");
      // Default: every balance = 1.5e18 wei (which formats to "1.50" for
      // 18-decimal tokens, "1,500,000,000,000.00" for 6-decimal USDC, etc.).
      // We just need a non-zero, deterministic value so the renderer paints
      // each row instead of dimming it.
      const u256 = (n: bigint): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;
      return calls.map(() => u256(1_500_000_000_000_000_000n));
    },
  };
});

const { showLandingPage } = await import("./landing.js");

interface CapturedOutput {
  out: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const capture: CapturedOutput = { out: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  return {
    capture,
    restore: () => {
      console.log = originalLog;
    },
  };
}

function joined(c: CapturedOutput): string {
  return c.out.join("\n");
}

const TEST_WALLET = "0x000000000000000000000000000000000000dEaD";
const ENV_KEY = "DEFI_WALLET_ADDRESS";
let envSnapshot: string | undefined;

beforeEach(() => {
  envSnapshot = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  multicallShouldThrow = false;
});
afterEach(() => {
  if (envSnapshot === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = envSnapshot;
});

describe("showLandingPage — JSON mode", () => {
  it("with no wallet, emits { error: 'DEFI_WALLET_ADDRESS not set' }", async () => {
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(true);
    } finally {
      restore();
    }
    // JSON.stringify with 2-space indent → multiline; join then parse.
    const data = JSON.parse(joined(capture)) as { error: string };
    expect(data.error).toMatch(/DEFI_WALLET_ADDRESS/);
  });

  it("with wallet, emits { wallet, chains: { <slug>: { name, balances[] } } } for all 5 dashboard chains", async () => {
    process.env[ENV_KEY] = TEST_WALLET;
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(true);
    } finally {
      restore();
    }
    const data = JSON.parse(joined(capture)) as {
      wallet: string;
      chains: Record<string, { name: string; balances: Array<{ symbol: string; balance: string; decimals: number }> }>;
    };
    expect(data.wallet.toLowerCase()).toBe(TEST_WALLET.toLowerCase());
    // DASHBOARD_CHAINS in landing.ts: hyperevm, mantle, base, bnb, monad.
    expect(Object.keys(data.chains).sort()).toEqual(["base", "bnb", "hyperevm", "mantle", "monad"]);
    // Each chain has at least one balance row from its token list.
    for (const slug of Object.keys(data.chains)) {
      expect(data.chains[slug].balances.length).toBeGreaterThan(0);
    }
  });
});

describe("showLandingPage — human mode", () => {
  it("with no wallet, shows 'Wallet not configured' hint + the command cheat sheet", async () => {
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(false);
    } finally {
      restore();
    }
    const all = joined(capture);
    expect(all).toContain("Wallet not configured");
    expect(all).toContain("DEFI_WALLET_ADDRESS=0x...");
    expect(all).toContain("defi status");
    expect(all).toContain("defi portfolio");
    expect(all).toContain("defi --help");
    // Version line: "DeFi CLI v<semver>".
    expect(all).toMatch(/DeFi CLI v\d+\.\d+\.\d+/);
  });

  it("with wallet, renders the chain dashboard with shortened wallet + chain name byline", async () => {
    process.env[ENV_KEY] = TEST_WALLET;
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(false);
    } finally {
      restore();
    }
    const all = joined(capture);
    // Wallet display uses shortenAddress: "<0x6 + ... + 4last>".
    expect(all).toContain("Wallet: ");
    expect(all).toContain("0x0000");
    expect(all).toContain("dEaD");
    // Chain headers — at least one per dashboard chain (real names).
    expect(all).toMatch(/HyperEVM/i);
    expect(all).toMatch(/Mantle/i);
    expect(all).toMatch(/Base/i);
    expect(all).toMatch(/BNB/i);
    expect(all).toMatch(/Monad/i);
    // Trailing cheat-sheet block.
    expect(all).toContain("Commands:");
    expect(all).toContain("defi status");
  });

  it("multicall failure is swallowed (best-effort, no crash) — every row shows 0.00", async () => {
    process.env[ENV_KEY] = TEST_WALLET;
    multicallShouldThrow = true;
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(false);
    } finally {
      restore();
    }
    const all = joined(capture);
    // fetchBalances catches multicallRead errors internally and returns
    // null results, which decodeU256 → 0n → "0.00". The outer "?" fallback
    // (resolveChainBalances .catch) only fires when fetchBalances itself
    // throws, which can't happen with the current code path. Pin the
    // observed contract: dashboard still renders, every balance is "0.00".
    expect(all).toContain("HyperEVM");
    expect(all).toContain("0.00");
    // No crash → no error in stdout.
    expect(all).not.toMatch(/Error|undefined/);
  });

  it("renders DASHBOARD_CHAINS tokens for every chain (e.g. HYPE on hyperevm, MNT on mantle)", async () => {
    process.env[ENV_KEY] = TEST_WALLET;
    const { capture, restore } = captureConsole();
    try {
      await showLandingPage(false);
    } finally {
      restore();
    }
    const all = joined(capture);
    expect(all).toContain("HYPE");
    expect(all).toContain("MNT");
    expect(all).toContain("ETH");
    expect(all).toContain("BNB");
    expect(all).toContain("MON");
  });
});
