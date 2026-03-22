#!/usr/bin/env node
/**
 * Auto-generates YAML test fixture files for all chains by extracting
 * data from TOML configs in config/chains.toml, config/tokens/, and
 * config/protocols/
 *
 * Usage: npx tsx test/fixtures/generate-fixtures.ts
 */

import { parse } from "smol-toml";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Script lives at ts/test/fixtures/generate-fixtures.ts
// Config lives at ts/config/
const TS_ROOT = join(__dirname, "..", "..");
const CONFIG_DIR = join(TS_ROOT, "config");
const CHAINS_TOML = join(CONFIG_DIR, "chains.toml");
const TOKENS_DIR = join(CONFIG_DIR, "tokens");
const PROTOCOLS_DIR = join(CONFIG_DIR, "protocols");
const FIXTURES_DIR = join(TS_ROOT, "test", "fixtures");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainConfig {
  name: string;
  chain_id: number;
  rpc_url: string;
  native_token: string;
  wrapped_native: string;
}

interface TokenConfig {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  tags?: string[];
  is_native_wrapper?: boolean;
}

interface ProtocolConfig {
  name: string;
  slug: string;
  category: string;
  interface: string;
  chain: string;
  contracts: Record<string, string>;
}

// ---------------------------------------------------------------------------
// TOML helpers
// ---------------------------------------------------------------------------

function readToml(path: string): Record<string, unknown> {
  try {
    return parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Load chains
// ---------------------------------------------------------------------------

function loadChains(): Record<string, ChainConfig> {
  const raw = readToml(CHAINS_TOML) as Record<string, Record<string, unknown>>;
  const chains: Record<string, ChainConfig> = {};
  const chainMap = raw.chain as Record<string, Record<string, unknown>> | undefined;
  if (!chainMap) return chains;
  for (const [slug, data] of Object.entries(chainMap)) {
    chains[slug] = {
      name: data.name as string,
      chain_id: data.chain_id as number,
      rpc_url: data.rpc_url as string,
      native_token: data.native_token as string,
      wrapped_native: data.wrapped_native as string,
    };
  }
  return chains;
}

// ---------------------------------------------------------------------------
// Load tokens for a chain
// ---------------------------------------------------------------------------

function loadTokens(chainSlug: string): TokenConfig[] {
  const tomlPath = join(TOKENS_DIR, `${chainSlug}.toml`);
  const raw = readToml(tomlPath) as { token?: TokenConfig[] };
  return raw.token ?? [];
}

// ---------------------------------------------------------------------------
// Load all protocol files for a category
// ---------------------------------------------------------------------------

function loadProtocolsForCategory(category: string): ProtocolConfig[] {
  const categoryDir = join(PROTOCOLS_DIR, category);
  if (!existsSync(categoryDir)) return [];

  const files = readdirSync(categoryDir).filter((f) => f.endsWith(".toml"));
  const protocols: ProtocolConfig[] = [];

  for (const file of files) {
    const raw = readToml(join(categoryDir, file)) as { protocol?: Record<string, unknown> };
    const p = raw.protocol;
    if (!p) continue;
    protocols.push({
      name: p.name as string,
      slug: p.slug as string,
      category: p.category as string,
      interface: (p.interface as string) ?? "",
      chain: p.chain as string,
      contracts: (p.contracts as Record<string, string>) ?? {},
    });
  }

  return protocols;
}

// ---------------------------------------------------------------------------
// Build a map: category -> chain -> protocols[]
// ---------------------------------------------------------------------------

const PROTOCOL_CATEGORIES = [
  "dex",
  "lending",
  "vault",
  "nft",
  "bridge",
  "cdp",
  "liquid_staking",
  "yield_aggregator",
];

type ProtocolMap = Map<string, Map<string, ProtocolConfig[]>>;

function buildProtocolMap(): ProtocolMap {
  const map: ProtocolMap = new Map();
  for (const cat of PROTOCOL_CATEGORIES) {
    const byCat: Map<string, ProtocolConfig[]> = new Map();
    for (const p of loadProtocolsForCategory(cat)) {
      const list = byCat.get(p.chain) ?? [];
      list.push(p);
      byCat.set(p.chain, list);
    }
    map.set(cat, byCat);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Stablecoin balance slot heuristics
// ---------------------------------------------------------------------------

function stablecoinBalanceSlot(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper === "USDC" || upper === "USDC.E") return 9;
  if (upper === "USDT") return 2;
  if (upper === "DAI") return 2;
  return 0;
}

// ---------------------------------------------------------------------------
// YAML rendering helpers (no dependency on js-yaml)
// ---------------------------------------------------------------------------

function indent(str: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return str
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

function renderContracts(contracts: Record<string, string>, spaces: number): string {
  if (Object.keys(contracts).length === 0) return indent("contracts: {}", spaces);
  const lines = ["contracts:"];
  for (const [k, v] of Object.entries(contracts)) {
    lines.push(`  ${k}: "${v}"`);
  }
  return indent(lines.join("\n"), spaces);
}

// ---------------------------------------------------------------------------
// Per-interface test parameter defaults
// ---------------------------------------------------------------------------

interface DexTestParams {
  swap_pair: string[];
  swap_amount: string;
  fee: number | null;
}

function dexTestParams(iface: string): DexTestParams {
  if (iface.includes("v3") || iface === "uniswap_v3" || iface === "algebra") {
    return { swap_pair: ["wrapped", "stablecoin"], swap_amount: "1000000000000000000", fee: 3000 };
  }
  return { swap_pair: ["wrapped", "stablecoin"], swap_amount: "1000000000000000000", fee: null };
}

// ---------------------------------------------------------------------------
// Render protocol entry
// ---------------------------------------------------------------------------

function renderDexEntry(p: ProtocolConfig): string {
  const params = dexTestParams(p.interface);
  const feeStr = params.fee !== null ? `${params.fee}` : "null";
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
    `  test:`,
    `    swap_pair: ${JSON.stringify(params.swap_pair)}`,
    `    swap_amount: "${params.swap_amount}"  # 1 token`,
    `    fee: ${feeStr}  # ${params.fee ? "0.3% for V3" : "null for V2"}`,
  ];
  return lines.join("\n");
}

function renderLendingEntry(p: ProtocolConfig): string {
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
    `  test:`,
    `    supply_asset: "stablecoin"`,
    `    supply_amount: "1000000000"  # 1000 USDC (6 decimals)`,
    `    borrow_asset: "stablecoin"`,
  ];
  return lines.join("\n");
}

function renderVaultEntry(p: ProtocolConfig): string {
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
    `  test:`,
    `    deposit_amount: "1000000000"  # 1000 USDC`,
  ];
  return lines.join("\n");
}

function renderNftEntry(p: ProtocolConfig): string {
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
  ];
  return lines.join("\n");
}

function renderBridgeEntry(p: ProtocolConfig): string {
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
  ];
  return lines.join("\n");
}

function renderGenericEntry(p: ProtocolConfig): string {
  const lines = [
    `- name: "${p.name}"`,
    `  slug: "${p.slug}"`,
    `  interface: "${p.interface}"`,
    renderContracts(p.contracts, 2),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build YAML for one chain
// ---------------------------------------------------------------------------

function buildYaml(
  chainSlug: string,
  chain: ChainConfig,
  tokens: TokenConfig[],
  protocolMap: ProtocolMap
): string {
  // --- tokens ---
  const wrappedToken = tokens.find(
    (t) =>
      t.tags?.includes("wrapped") ||
      t.is_native_wrapper === true ||
      t.symbol.toUpperCase() === `W${chain.native_token.toUpperCase()}`
  );

  // Prefer USDC, else first stablecoin
  const stablecoins = tokens.filter((t) => t.tags?.includes("stablecoin"));
  const stablecoin =
    stablecoins.find((t) => t.symbol.toUpperCase() === "USDC") ??
    stablecoins.find((t) => t.symbol.toUpperCase().startsWith("USDC")) ??
    stablecoins[0];

  const wrappedSymbol = wrappedToken?.symbol ?? `W${chain.native_token}`;
  const wrappedAddress = wrappedToken?.address ?? chain.wrapped_native;
  const wrappedDecimals = wrappedToken?.decimals ?? 18;

  const stableSymbol = stablecoin?.symbol ?? "USDC";
  const stableAddress = stablecoin?.address ?? "0x0000000000000000000000000000000000000000";
  const stableDecimals = stablecoin?.decimals ?? 6;
  const stableSlot = stablecoinBalanceSlot(stableSymbol);

  // --- protocols ---
  const sections: string[] = [];

  for (const cat of PROTOCOL_CATEGORIES) {
    const byCat = protocolMap.get(cat);
    const list = byCat?.get(chainSlug) ?? [];
    if (list.length === 0) continue;

    const entries: string[] = [];
    for (const p of list) {
      switch (cat) {
        case "dex":
          entries.push(renderDexEntry(p));
          break;
        case "lending":
          entries.push(renderLendingEntry(p));
          break;
        case "vault":
          entries.push(renderVaultEntry(p));
          break;
        case "nft":
          entries.push(renderNftEntry(p));
          break;
        case "bridge":
          entries.push(renderBridgeEntry(p));
          break;
        default:
          entries.push(renderGenericEntry(p));
      }
    }

    sections.push(`  ${cat}:\n${entries.map((e) => indent(e, 4)).join("\n")}`);
  }

  const protocolsBlock =
    sections.length > 0
      ? `protocols:\n${sections.join("\n")}`
      : `protocols: {}`;

  return `# Auto-generated test fixture for ${chainSlug}
chain:
  name: "${chain.name}"
  slug: "${chainSlug}"
  chain_id: ${chain.chain_id}
  rpc_url: "${chain.rpc_url}"
  native_token: "${chain.native_token}"

tokens:
  native:
    symbol: "${chain.native_token}"
    address: "0x0000000000000000000000000000000000000000"
    decimals: 18
  wrapped:
    symbol: "${wrappedSymbol}"
    address: "${wrappedAddress}"
    decimals: ${wrappedDecimals}
    # ERC20 storage slot for balanceOf mapping (for deal)
    balance_slot: 0  # Default slot 0, may need adjustment per token
  stablecoin:
    symbol: "${stableSymbol}"
    address: "${stableAddress}"
    decimals: ${stableDecimals}
    balance_slot: ${stableSlot}  # ${stableSymbol} typical slot

funding:
  native_amount: "0x56BC75E2D63100000"  # 100 tokens
  wrapped_amount: "10000000000000000000"  # 10 tokens
  stablecoin_amount: "10000000000"  # 10000 ${stableSymbol} (${stableDecimals} decimals)

${protocolsBlock}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Loading chains...");
  const chains = loadChains();
  const chainSlugs = Object.keys(chains);
  console.log(`Found ${chainSlugs.length} chains.`);

  console.log("Building protocol map...");
  const protocolMap = buildProtocolMap();

  mkdirSync(FIXTURES_DIR, { recursive: true });

  let generated = 0;
  for (const slug of chainSlugs) {
    const chain = chains[slug];
    const tokens = loadTokens(slug);
    const yaml = buildYaml(slug, chain, tokens, protocolMap);
    const outPath = join(FIXTURES_DIR, `${slug}.yaml`);
    writeFileSync(outPath, yaml, "utf-8");
    console.log(`  [${++generated}/${chainSlugs.length}] ${outPath}`);
  }

  console.log(`\nDone. Generated ${generated} fixture files in ${FIXTURES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
