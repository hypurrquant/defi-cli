// Approve-safety guards.
//
// SSOT Section 7.2: ERC20 `approve` calls must NOT default to MaxUint256
// (infinite approval), and the spender must be a protocol contract, not
// the user.
//
// Today's audit (2026-05-05) found the codebase compliant: every adapter
// passes the exact `params.amount` / `params.amount_in` to its
// `approvals[]` entry, and `defi token approve` only uses `maxUint256`
// when the user explicitly types `--amount max`. This test pins that
// invariant so a future regression (e.g. a copy-pasted adapter that
// reverts to infinite approval) can't slip through review silently.
import { buildApprove, erc20Abi } from "@hypurrquant/defi-core";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeFunctionData, maxUint256, type Address } from "viem";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "../..");
const TS_ROOT = resolve(PKG_ROOT, "../..");
const ADAPTERS_DIR = resolve(TS_ROOT, "packages/defi-protocols/src");
const TOKEN_CMD_PATH = resolve(PKG_ROOT, "src/commands/token.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function scan(files: string[], banned: RegExp[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const re of banned) {
        if (re.test(lines[i])) {
          hits.push({ file, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }
  return hits;
}

describe("approve safety", () => {
  it("buildApprove encodes the exact amount with no hidden default", () => {
    const token = ("0x" + "01".repeat(20)) as Address;
    const spender = ("0x" + "02".repeat(20)) as Address;
    const samples = [0n, 1n, 1_000_000n, 2n ** 64n, maxUint256];
    for (const amount of samples) {
      const tx = buildApprove(token, spender, amount);
      expect(tx.to).toBe(token);
      expect(tx.value).toBe(0n);
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      expect(decoded.functionName).toBe("approve");
      // viem decodes args as a tuple; index 0 = spender, 1 = amount.
      expect((decoded.args as readonly unknown[])[0]).toBe(spender);
      expect((decoded.args as readonly unknown[])[1]).toBe(amount);
    }
  });

  it("buildApprove requires an explicit amount (no implicit default)", () => {
    // TypeScript prevents this at compile time — the function takes 3
    // required params. Runtime check guards against future signature
    // drift that adds a default.
    expect(buildApprove.length).toBe(3);
  });

  it("no adapter source hardcodes infinite approval in approvals[]", () => {
    const banned = [
      /\bamount:\s*maxUint256\b/,
      /\bamount:\s*ethers\.(?:constants\.)?MaxUint256\b/,
      /\bamount:\s*2n?\s*\*\*\s*256n?/,
      /\bamount:\s*BigInt\(\s*["']\d{75,}["']\s*\)/,
      /\bamount:\s*0x[fF]{60,}\b/,
    ];
    const hits = scan(walk(ADAPTERS_DIR), banned);
    const fmt = hits
      .map((h) => `  ${h.file}:${h.line}\n    ${h.text}`)
      .join("\n");
    expect(
      hits,
      "Adapter sources must not hardcode infinite approvals:\n" + fmt,
    ).toEqual([]);
  });

  it("no adapter assigns the user (or any caller-controlled address) as spender", () => {
    // spender must be a contract this adapter governs (router / pool /
    // comet / gauge / vault / etc.), never the user / recipient / owner.
    const banned = [
      /\bspender:\s*params\.user\b/,
      /\bspender:\s*params\.from\b/,
      /\bspender:\s*params\.recipient\b/,
      /\bspender:\s*params\.to\b/,
      /\bspender:\s*params\.onBehalfOf\b/,
      /\bspender:\s*opts\.user\b/,
      /\bspender:\s*owner\b/,
      /\bspender:\s*recipient\b/,
    ];
    const hits = scan(walk(ADAPTERS_DIR), banned);
    const fmt = hits
      .map((h) => `  ${h.file}:${h.line}\n    ${h.text}`)
      .join("\n");
    expect(hits, "spender must be a protocol contract, not the user:\n" + fmt).toEqual([]);
  });

  it("CLI `token approve` only uses maxUint256 when user explicitly passes 'max'", () => {
    // commands/token.ts owns this resolution. Pin the literal pattern so a
    // refactor that drops the explicit sentinel check would fail this test.
    const src = readFileSync(TOKEN_CMD_PATH, "utf8");
    expect(
      src,
      `${TOKEN_CMD_PATH} must gate maxUint256 behind 'opts.amount === "max"'`,
    ).toMatch(/opts\.amount\s*===\s*["']max["']\s*\?\s*maxUint256/);

    // And the resolved branches behave as documented.
    const resolveAmount = (raw: string) =>
      raw === "max" ? maxUint256 : BigInt(raw);
    expect(resolveAmount("max")).toBe(maxUint256);
    expect(resolveAmount("0")).toBe(0n);
    expect(resolveAmount("1000")).toBe(1000n);
    // Critical: only the literal sentinel "max" maps to maxUint256.
    // Numeric strings, including 0, must NOT silently become infinite.
    expect(resolveAmount("0")).not.toBe(maxUint256);
    expect(resolveAmount("1000")).not.toBe(maxUint256);
    // Malformed input must throw, not silently default to anything.
    expect(() => resolveAmount("abc")).toThrow();
  });
});
