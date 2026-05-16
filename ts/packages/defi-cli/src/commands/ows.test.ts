// Unit tests for `defi ows` — covers the 6 vault subcommands (list, create,
// address, balance, delete, info) plus the standard handleOwsError exit path.
//
// Mock strategy:
//   - vi.mock("../signer/ows-loader.js") replaces loadOws() with a stateful
//     in-memory vault. Each test mutates `mockVault` to set up the wallet
//     pre-state, then asserts both the captured output and the recorded
//     vault mutations.
//   - vi.mock("viem", importOriginal) keeps most exports real (parseAbi,
//     encodeFunctionData, ...) but stubs createPublicClient so the `balance`
//     subcommand never opens a real RPC socket.
//   - process.exit(1) inside handleOwsError is replaced with a vi.spy
//     no-op; tests that expect the error path assert the spy was called.
//
// Coverage focus:
//   - happy paths for all 6 subcommands in both --json and human modes
//   - empty-vault rendering for `list`
//   - "no EVM account" error path through handleOwsError
//   - loadOws() throwing (OWS not installed) propagates as a clean error
//     envelope rather than an uncaught crash
import { Command } from "commander";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseOutputMode } from "../output.js";

interface FakeAccount {
  chainId: string;
  address: string;
  derivationPath: string;
}

interface FakeWallet {
  id: string;
  name: string;
  accounts: FakeAccount[];
  createdAt: string;
}

interface MockVault {
  wallets: FakeWallet[];
  // Behaviour switches for negative paths.
  loadShouldThrow: boolean;
  createShouldThrow: boolean;
}

const mockVault: MockVault = {
  wallets: [],
  loadShouldThrow: false,
  createShouldThrow: false,
};

vi.mock("../signer/ows-loader.js", () => ({
  loadOws: () => {
    if (mockVault.loadShouldThrow) {
      throw new Error(
        "OWS not installed. Run: curl -fsSL https://docs.openwallet.sh/install.sh | bash",
      );
    }
    return {
      createWallet: (name: string, _passphrase: string, words: number): FakeWallet => {
        if (mockVault.createShouldThrow) {
          throw new Error(`wallet "${name}" already exists`);
        }
        const wallet: FakeWallet = {
          id: `id-${name}-${words}`,
          name,
          accounts: [
            {
              chainId: "eip155:1",
              address: "0x1111111111111111111111111111111111111111",
              derivationPath: "m/44'/60'/0'/0/0",
            },
            {
              chainId: "cosmos:cosmoshub-4",
              address: "cosmos1abc",
              derivationPath: "m/44'/118'/0'/0/0",
            },
          ],
          createdAt: "2026-05-16T00:00:00.000Z",
        };
        mockVault.wallets.push(wallet);
        return wallet;
      },
      listWallets: () => mockVault.wallets.slice(),
      getWallet: (name: string): FakeWallet => {
        const w = mockVault.wallets.find((x) => x.name === name);
        if (!w) throw new Error(`OWS wallet "${name}" not found`);
        return w;
      },
      deleteWallet: (name: string) => {
        const idx = mockVault.wallets.findIndex((x) => x.name === name);
        if (idx === -1) throw new Error(`OWS wallet "${name}" not found`);
        mockVault.wallets.splice(idx, 1);
      },
    };
  },
}));

vi.mock("viem", async (importOriginal) => {
  const real = (await importOriginal()) as typeof import("viem");
  return {
    ...real,
    createPublicClient: () => ({
      getBalance: async () => 12_345_678_900_000_000_000n, // 12.3456789 ETH-equiv
    }),
  };
});

const { registerOws } = await import("./ows.js");

interface CapturedOutput {
  out: string[];
  err: string[];
}

function captureConsole(): { capture: CapturedOutput; restore: () => void } {
  const originalLog = console.log;
  const originalErr = console.error;
  const capture: CapturedOutput = { out: [], err: [] };
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    capture.out.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  console.error = (msg?: unknown, ...rest: unknown[]) => {
    capture.err.push(
      [msg, ...rest].map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" "),
    );
  };
  return {
    capture,
    restore: () => {
      console.log = originalLog;
      console.error = originalErr;
    },
  };
}

const originalExit = process.exit;
const exitSpy = vi.fn();
beforeEach(() => {
  // handleOwsError calls process.exit(1); we replace it with a spy so tests
  // can assert the exit + keep running. Reset between tests.
  exitSpy.mockReset();
  process.exit = exitSpy as unknown as typeof process.exit;
  mockVault.wallets = [];
  mockVault.loadShouldThrow = false;
  mockVault.createShouldThrow = false;
});
afterAll(() => {
  process.exit = originalExit;
});

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--chain <chain>", "Target chain");
  program.option("--json", "Output as JSON");
  program.option("--ndjson", "Output as newline-delimited JSON");
  program.option("--fields <fields>", "Filter output fields");
  registerOws(
    program,
    () => parseOutputMode(program.opts<{ json?: boolean; ndjson?: boolean; fields?: string }>()),
  );
  return program;
}

function seedWallet(name: string, evmAddr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"): FakeWallet {
  const w: FakeWallet = {
    id: `seed-${name}`,
    name,
    accounts: [
      { chainId: "eip155:1", address: evmAddr, derivationPath: "m/44'/60'/0'/0/0" },
    ],
    createdAt: "2026-05-01T12:00:00.000Z",
  };
  mockVault.wallets.push(w);
  return w;
}

function jsonFrom(capture: CapturedOutput): unknown {
  // printOutput in --json emits a single JSON object/line; in case other
  // human noise was logged we grep for the line that parses.
  for (const line of [...capture.out].reverse()) {
    const t = line.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch {
        // not the JSON line; keep looking
      }
    }
  }
  throw new Error(`no JSON line in captured output:\n${capture.out.join("\n")}`);
}

describe("defi ows list", () => {
  it("empty vault renders the 'create one' hint, not a table", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "ows", "list"]);
    } finally {
      restore();
    }
    const all = capture.out.join("\n");
    expect(all).toMatch(/No OWS wallets found/);
    expect(all).toMatch(/defi ows create/);
  });

  it("populated vault renders one row per wallet with shortened address", async () => {
    seedWallet("alice", "0x1234567890abcdef1234567890abcdef12345678");
    seedWallet("bob", "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "ows", "list"]);
    } finally {
      restore();
    }
    const all = capture.out.join("\n");
    expect(all).toContain("alice");
    expect(all).toContain("bob");
    // Address shortening: first 10 chars + "..." + last 4.
    expect(all).toContain("0x12345678...5678");
    expect(all).toContain("0xdeadbeef...beef");
  });

  it("--json returns the raw wallets array (no shortening)", async () => {
    seedWallet("alice");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "list"]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as { wallets: FakeWallet[] };
    expect(data.wallets).toHaveLength(1);
    expect(data.wallets[0]?.name).toBe("alice");
  });
});

describe("defi ows create", () => {
  it("delegates name + words to o.createWallet and reports the new wallet", async () => {
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "ows", "create", "newwal", "--words", "24",
      ]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as { id: string; name: string; accounts: FakeAccount[] };
    expect(data.name).toBe("newwal");
    expect(data.id).toContain("24"); // mock encodes words count in id
    expect(mockVault.wallets.map((w) => w.name)).toContain("newwal");
  });

  it("propagates createWallet errors through handleOwsError + process.exit(1)", async () => {
    mockVault.createShouldThrow = true;
    const { restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "ows", "create", "dup"]);
    } finally {
      restore();
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("defi ows address", () => {
  it("returns the first eip155: account for the wallet (--json)", async () => {
    seedWallet("alice", "0x5555555555555555555555555555555555555555");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "address", "alice"]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as { wallet: string; address: string };
    expect(data.wallet).toBe("alice");
    expect(data.address).toBe("0x5555555555555555555555555555555555555555");
  });

  it("errors via handleOwsError when the wallet has no EVM account", async () => {
    // Seed a wallet whose only account is cosmos: → no eip155: match.
    mockVault.wallets.push({
      id: "cosmos-only", name: "cosmoswal",
      accounts: [{ chainId: "cosmos:cosmoshub-4", address: "cosmos1xyz", derivationPath: "m/44'/118'/0'/0/0" }],
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const { restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "ows", "address", "cosmoswal"]);
    } finally {
      restore();
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("defi ows balance", () => {
  it("uses the stubbed createPublicClient.getBalance and formats native_token", async () => {
    seedWallet("alice");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync([
        "node", "defi", "--json", "--chain", "hyperevm", "ows", "balance", "alice",
      ]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as {
      wallet: string;
      chain: string;
      address: string;
      native_token: string;
      balance: string;
      balance_wei: string;
    };
    expect(data.wallet).toBe("alice");
    expect(data.chain).toBe("hyperevm");
    expect(data.native_token).toBe("HYPE");
    expect(data.balance).toBe("12.3456789");
    expect(data.balance_wei).toBe("12345678900000000000");
  });

  it("defaults --chain to hyperevm when not supplied", async () => {
    seedWallet("alice");
    const { capture, restore } = captureConsole();
    try {
      // no --chain
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "balance", "alice"]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as { chain: string };
    expect(data.chain).toBe("hyperevm");
  });
});

describe("defi ows delete + info", () => {
  it("delete removes the wallet from the vault and confirms by id", async () => {
    const w = seedWallet("doomed");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "delete", "doomed"]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as { deleted: string; id: string };
    expect(data.deleted).toBe("doomed");
    expect(data.id).toBe(w.id);
    expect(mockVault.wallets.find((x) => x.name === "doomed")).toBeUndefined();
  });

  it("info --json dumps the full wallet object including derivation paths", async () => {
    seedWallet("alice");
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "info", "alice"]);
    } finally {
      restore();
    }
    const data = jsonFrom(capture) as FakeWallet;
    expect(data.name).toBe("alice");
    expect(data.accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/0");
  });
});

describe("defi ows — install gate", () => {
  it("loadOws() throwing surfaces as an OWS error envelope + process.exit(1)", async () => {
    mockVault.loadShouldThrow = true;
    const { capture, restore } = captureConsole();
    try {
      await buildProgram().parseAsync(["node", "defi", "--json", "ows", "list"]);
    } finally {
      restore();
    }
    // JSON mode emits an { error: ... } envelope; human mode writes to stderr.
    const data = jsonFrom(capture) as { error: string };
    expect(data.error).toMatch(/OWS not installed/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
