import type { Command } from "commander";
import pc from "picocolors";
import type { OutputMode } from "../output.js";
import { printOutput } from "../output.js";
import { loadOws } from "../signer/ows-loader.js";
import { createPublicClient, http, formatEther } from "viem";
import { Registry } from "@hypurrquant/defi-core";
import { errMsg } from "../utils.js";

// ── Balance helper (EVM only for defi-cli) ──

async function getEvmBalance(
  address: string,
  chainName: string,
): Promise<{ native_token: string; balance: string; balance_wei: string }> {
  const registry = Registry.loadEmbedded();
  const chain = registry.getChain(chainName);
  const client = createPublicClient({ transport: http(chain.effectiveRpcUrl()) });
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return {
    native_token: chain.native_token,
    balance: formatEther(balance),
    balance_wei: balance.toString(),
  };
}

// ── Table helper (inline, no external dep) ──

function makeTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? "").length)),
  );
  const sep = widths.map((w) => "-".repeat(w + 2)).join("+");
  const fmtRow = (cells: string[]) =>
    cells.map((c, i) => ` ${padEnd(c, widths[i])} `).join("|");
  return [fmtRow(headers.map((h) => pc.bold(h))), sep, ...rows.map(fmtRow)].join("\n");
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[\d+m/g, "");
}

function padEnd(s: string, len: number): string {
  const visible = stripAnsi(s).length;
  return visible >= len ? s : s + " ".repeat(len - visible);
}

// ── Register OWS commands ──

export function registerOws(parent: Command, getOpts: () => OutputMode): void {
  const ows = parent
    .command("ows")
    .description("Open Wallet Standard — encrypted vault wallet management");

  // ── create ──

  ows
    .command("create <name>")
    .description("Create a new OWS wallet (multi-chain)")
    .option("--words <count>", "Mnemonic word count (12 or 24)", "12")
    .action(async (name: string, opts: { words: string }) => {
      try {
        const o = loadOws();
        const w = o.createWallet(name, "", parseInt(opts.words));
        const mode = getOpts();
        if (mode.json) {
          return printOutput(
            { id: w.id, name: w.name, accounts: w.accounts, createdAt: w.createdAt },
            mode,
          );
        }
        console.log(pc.cyan(pc.bold("\n  OWS Wallet Created\n")));
        console.log(`  Name: ${pc.bold(w.name)}`);
        console.log(`  ID:   ${pc.gray(w.id)}`);
        console.log();
        for (const acct of w.accounts) {
          const chain = acct.chainId.split(":")[0];
          console.log(`  ${pc.cyan(chain.padEnd(10))} ${pc.green(acct.address)}`);
        }
        console.log(pc.gray(`\n  Vault: ~/.ows/`));
        console.log(pc.cyan(`\n  Usage: defi --wallet ${name} lp deposit ...\n`));
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });

  // ── list ──

  ows
    .command("list")
    .description("List all OWS wallets in the vault")
    .action(async () => {
      try {
        const o = loadOws();
        const wallets = o.listWallets();
        const mode = getOpts();
        if (mode.json) return printOutput({ wallets }, mode);
        if (wallets.length === 0) {
          console.log(pc.gray("\n  No OWS wallets found."));
          console.log(pc.gray(`  Create one: ${pc.cyan("defi ows create <name>")}\n`));
          return;
        }
        console.log(pc.cyan(pc.bold("\n  OWS Vault Wallets\n")));
        const rows = wallets.map(
          (w: {
            name: string;
            id: string;
            accounts: Array<{ chainId: string; address: string }>;
            createdAt: string;
          }) => {
            const evmAddr =
              w.accounts.find((a: { chainId: string }) => a.chainId.startsWith("eip155:"))
                ?.address ?? "-";
            const short =
              evmAddr.length > 14
                ? evmAddr.slice(0, 10) + "..." + evmAddr.slice(-4)
                : evmAddr;
            return [
              pc.bold(w.name),
              pc.green(short),
              pc.gray(w.createdAt.split("T")[0]),
            ];
          },
        );
        console.log(makeTable(["Name", "EVM Address", "Created"], rows));
        console.log(pc.gray(`\n  Usage: defi --wallet <name> lp deposit ...\n`));
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });

  // ── address ──

  ows
    .command("address <name>")
    .description("Show EVM address for an OWS wallet")
    .action(async (name: string) => {
      try {
        const o = loadOws();
        const w = o.getWallet(name);
        const evmAccount = w.accounts.find(
          (a: { chainId: string }) => a.chainId.startsWith("eip155:"),
        );
        if (!evmAccount) throw new Error(`OWS wallet "${name}" has no EVM account`);
        const mode = getOpts();
        if (mode.json) return printOutput({ wallet: name, address: evmAccount.address }, mode);
        console.log(pc.cyan(pc.bold(`\n  OWS Wallet: ${name}\n`)));
        console.log(`  EVM Address: ${pc.green(evmAccount.address)}\n`);
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });

  // ── balance ──

  ows
    .command("balance <name>")
    .description("Show on-chain balance for an OWS wallet")
    .action(async (name: string) => {
      try {
        const o = loadOws();
        const w = o.getWallet(name);
        const evmAccount = w.accounts.find(
          (a: { chainId: string }) => a.chainId.startsWith("eip155:"),
        );
        if (!evmAccount) throw new Error(`OWS wallet "${name}" has no EVM account`);

        const chainOpt = parent.opts<{ chain?: string }>().chain;
        const chainName = chainOpt ?? "hyperevm";
        const bal = await getEvmBalance(evmAccount.address, chainName);
        const mode = getOpts();
        if (mode.json) {
          return printOutput(
            { wallet: name, chain: chainName, address: evmAccount.address, ...bal },
            mode,
          );
        }
        console.log(pc.cyan(pc.bold(`\n  ${name} — ${chainName}\n`)));
        console.log(`  Address: ${pc.green(evmAccount.address)}`);
        console.log(`  ${pc.bold(bal.native_token)}: ${bal.balance}\n`);
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });

  // ── delete ──

  ows
    .command("delete <name>")
    .description("Delete an OWS wallet from the vault")
    .action(async (name: string) => {
      try {
        const o = loadOws();
        const w = o.getWallet(name);
        o.deleteWallet(name);
        const mode = getOpts();
        if (mode.json) return printOutput({ deleted: name, id: w.id }, mode);
        console.log(pc.yellow(`\n  OWS wallet "${name}" deleted from vault.\n`));
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });

  // ── info ──

  ows
    .command("info <name>")
    .description("Show detailed OWS wallet info (all chains & derivation paths)")
    .action(async (name: string) => {
      try {
        const o = loadOws();
        const w = o.getWallet(name);
        const mode = getOpts();
        if (mode.json) return printOutput(w, mode);
        console.log(pc.cyan(pc.bold(`\n  OWS Wallet: ${w.name}\n`)));
        console.log(`  ID:      ${pc.gray(w.id)}`);
        console.log(`  Created: ${pc.gray(w.createdAt)}`);
        console.log();
        for (const acct of w.accounts) {
          console.log(`  ${pc.cyan(acct.chainId.padEnd(40))} ${pc.green(acct.address)}`);
          console.log(`  ${pc.gray(" ".repeat(40) + acct.derivationPath)}`);
        }
        console.log();
      } catch (e) {
        handleOwsError(e, getOpts);
      }
    });
}

// ── Error handler ──

function handleOwsError(e: unknown, getOpts: () => OutputMode): void {
  const msg = errMsg(e);
  const mode = getOpts();
  if (mode.json) {
    printOutput({ error: msg }, mode);
  } else {
    console.error(pc.red(`\n  OWS error: ${msg}\n`));
  }
  process.exit(1);
}
