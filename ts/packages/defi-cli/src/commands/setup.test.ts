// Unit tests for `defi setup` — the interactive wizard that writes
// ~/.defi/.env.
//
// Two pieces of hostile state make this handler tricky:
//
//   1. DEFI_DIR is a module-level const computed from homedir() at import
//      time. We override $HOME to a temp dir BEFORE the SUT is imported so
//      the test can never touch the user's real ~/.defi.
//   2. The wizard drives readline. We mock the "readline" module with a
//      queue-based question stub so each test can script the user's answers
//      in order. askSecret() falls back to the plain readline.question path
//      when stdin.isTTY is false (always the case under vitest), so the
//      hidden-input branch is shared with the regular prompt branch.
//
// Coverage focus:
//   - empty-config happy path (PK valid, PK invalid fallback, manual address)
//   - invalid address / invalid RPC URL warn + skip behaviour
//   - existing-config gate: "n" returns early without rewriting, "y"
//     overwrites with new values merged on top of the existing keys
//   - PK auto-prefix (typing a 0x-less hex still ends up as 0x...)
//   - masking of private keys and RPC URLs in the "Current configuration"
//     display
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { Command } from "commander";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// IMPORTANT: redirect HOME before importing setup.ts. DEFI_DIR is captured
// at module load. We use a single test-wide tmpdir and clear `.defi/` between
// tests for isolation.
const TEST_HOME = mkdtempSync(resolve(tmpdir(), "defi-cli-setup-test-"));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TEST_HOME;
const ENV_FILE = resolve(TEST_HOME, ".defi", ".env");

afterAll(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  else delete process.env.HOME;
});

// Per-test scripted answers + recorded prompts.
let answerQueue: string[] = [];
let askedPrompts: string[] = [];

vi.mock("readline", () => ({
  createInterface: () => ({
    question: (prompt: string, cb: (answer: string) => void) => {
      askedPrompts.push(prompt);
      const answer = answerQueue.length > 0 ? answerQueue.shift()! : "";
      // setImmediate keeps the contract (real readline is async) so any
      // microtask between question→callback in the SUT isn't accidentally
      // collapsed.
      setImmediate(() => cb(answer));
    },
    close: () => {},
    output: { write: () => {} },
  }),
}));

// Hoisted: stub registered before SUT import.
const { registerSetup } = await import("./setup.js");

interface CapturedOutput {
  out: string[];
  err: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const originalErr = process.stderr.write.bind(process.stderr);
  const capture: CapturedOutput = { out: [], err: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  process.stderr.write = ((chunk: string | Uint8Array) => {
    capture.err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    capture,
    restore: () => {
      console.log = originalLog;
      process.stderr.write = originalErr;
    },
  };
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSetup(program);
  return program;
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const env: Record<string, string> = {};
  for (const raw of readFileSync(ENV_FILE, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return env;
}

function preWriteEnv(env: Record<string, string>): void {
  const dir = resolve(TEST_HOME, ".defi");
  mkdirSync(dir, { recursive: true });
  const lines = ["# defi-cli configuration", ""];
  for (const [k, v] of Object.entries(env)) lines.push(`${k}=${v}`);
  lines.push("");
  writeFileSync(ENV_FILE, lines.join("\n"));
}

async function runSetup(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(["node", "defi", "setup"]);
}

beforeEach(() => {
  // Each test starts from a clean ~/.defi/ unless it pre-writes one.
  rmSync(resolve(TEST_HOME, ".defi"), { recursive: true, force: true });
  answerQueue = [];
  askedPrompts = [];
});

// Anvil's well-known account #0 — public test key, no security risk.
const ANVIL_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266";
const FAKE_ADDR = "0x000000000000000000000000000000000000dEaD";

describe("defi setup — wallet input", () => {
  it("valid private key writes both DEFI_PRIVATE_KEY and the derived address", async () => {
    // Prompt order with no existing config:
    //   PK, [no address prompt because PK derived], HyperEVM, Mantle, Base, BNB, Monad
    answerQueue = [ANVIL_PK, "", "", "", "", ""];
    const { restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.DEFI_PRIVATE_KEY).toBe(ANVIL_PK);
    expect(env.DEFI_WALLET_ADDRESS?.toLowerCase()).toBe(ANVIL_ADDR.toLowerCase());
  });

  it("empty PK + manual address writes DEFI_WALLET_ADDRESS only (no key)", async () => {
    answerQueue = ["", FAKE_ADDR, "", "", "", "", ""];
    const { restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.DEFI_WALLET_ADDRESS).toBe(FAKE_ADDR);
    expect(env.DEFI_PRIVATE_KEY).toBeUndefined();
  });

  it("invalid PK is rejected with warning, then the address prompt fires", async () => {
    answerQueue = ["0xnothex", FAKE_ADDR, "", "", "", "", ""];
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.DEFI_PRIVATE_KEY).toBeUndefined();
    expect(env.DEFI_WALLET_ADDRESS).toBe(FAKE_ADDR);
    const allOut = capture.out.join("\n");
    expect(allOut).toMatch(/Invalid private key/);
  });

  it("invalid address is rejected with warning, env stays empty of address keys", async () => {
    answerQueue = ["", "not-an-address", "", "", "", "", ""];
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.DEFI_WALLET_ADDRESS).toBeUndefined();
    expect(env.DEFI_PRIVATE_KEY).toBeUndefined();
    expect(capture.out.join("\n")).toMatch(/Invalid address/);
  });

  it("private key without 0x prefix gets auto-prefixed before validation/storage", async () => {
    const noPrefix = ANVIL_PK.slice(2); // strip 0x
    answerQueue = [noPrefix, "", "", "", "", ""];
    const { restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.DEFI_PRIVATE_KEY).toBe(ANVIL_PK); // re-prefixed with 0x
  });
});

describe("defi setup — RPC URLs", () => {
  it("valid https RPC URL is stored under the per-chain key", async () => {
    // Prompts: PK, address, HyperEVM, Mantle, Base, BNB, Monad
    answerQueue = ["", FAKE_ADDR, "https://hyperevm.example.com", "", "", "", ""];
    const { restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.HYPEREVM_RPC_URL).toBe("https://hyperevm.example.com");
    expect(env.MANTLE_RPC_URL).toBeUndefined();
  });

  it("ws:// RPC URL is rejected (transport mismatch with viem http())", async () => {
    answerQueue = ["", FAKE_ADDR, "ws://hyperevm.example.com", "", "", "", ""];
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.HYPEREVM_RPC_URL).toBeUndefined();
    expect(capture.out.join("\n")).toMatch(/Invalid URL/);
  });

  it("garbage RPC URL (not even a valid URL) is rejected", async () => {
    answerQueue = ["", FAKE_ADDR, "this is not a url", "", "", "", ""];
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }
    const env = readEnv();
    expect(env.HYPEREVM_RPC_URL).toBeUndefined();
    expect(capture.out.join("\n")).toMatch(/Invalid URL/);
  });
});

describe("defi setup — existing-config gate", () => {
  it('answering "n" returns early without rewriting the file', async () => {
    preWriteEnv({ DEFI_WALLET_ADDRESS: FAKE_ADDR, KEEP_ME: "yes" });
    const before = readFileSync(ENV_FILE, "utf-8");

    answerQueue = ["n"]; // only the overwrite question; SUT returns immediately
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }

    const after = readFileSync(ENV_FILE, "utf-8");
    expect(after).toBe(before);
    expect(capture.out.join("\n")).toMatch(/Keeping existing configuration/);
  });

  it('answering "y" then supplying new values overwrites + merges', async () => {
    preWriteEnv({ DEFI_WALLET_ADDRESS: "0xOLDOLDOLDOLDOLDOLDOLDOLDOLDOLDOLDOLDOLD0", LEGACY: "kept" });

    // Overwrite, no PK, new address, no RPC URLs.
    answerQueue = ["y", "", FAKE_ADDR, "", "", "", "", ""];
    const { restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }

    const env = readEnv();
    expect(env.DEFI_WALLET_ADDRESS).toBe(FAKE_ADDR);
    // LEGACY key wasn't re-prompted — but the merge in setup.ts is
    // `{ ...existing, ...newEnv }`, so any key the wizard doesn't touch
    // must survive. Pin that contract.
    expect(env.LEGACY).toBe("kept");
  });

  it("displays existing private key masked in the current-config summary", async () => {
    const FULL_KEY = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    preWriteEnv({ DEFI_PRIVATE_KEY: FULL_KEY });

    answerQueue = ["n"]; // decline overwrite; we only want the summary render
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }

    const allOut = capture.out.join("\n");
    // Mask format is `<first6>...<last4>` — for the fixture that's "0xabcd...6789".
    expect(allOut).toMatch(/0xabcd\.\.\.6789/);
    // The full key must NEVER appear in any console output, even in passing.
    expect(allOut).not.toContain(FULL_KEY);
  });

  it("displays existing RPC URL with the path component masked (provider keys live there)", async () => {
    // Realistic provider URL with embedded API key in the path.
    const URL_WITH_KEY = "https://eth.example.com/v3/SECRETKEY123";
    preWriteEnv({ HYPEREVM_RPC_URL: URL_WITH_KEY });

    answerQueue = ["n"];
    const { capture, restore } = captureConsole();
    try {
      await runSetup();
    } finally {
      restore();
    }

    const allOut = capture.out.join("\n");
    expect(allOut).toContain("https://eth.example.com/***");
    expect(allOut).not.toContain("SECRETKEY123");
  });
});
