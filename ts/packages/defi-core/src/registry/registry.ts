import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { parse } from "smol-toml";
import { ChainConfig } from "./chain.js";
import type { TokenEntry } from "./token.js";
import { type ProtocolEntry, type PoolInfo, ProtocolCategory } from "./protocol.js";

import { existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Resolve config dir: works from src/ (vitest), dist/ (built), and npm bundle (npx)
function findConfigDir(): string {
  const candidates = [
    resolve(__dirname, "../../../config"),   // from dist/registry/ (monorepo build)
    resolve(__dirname, "../../../../config"), // from src/registry/ (vitest)
    resolve(__dirname, "../config"),          // from dist/ (npm bundle — config at package root)
    resolve(__dirname, "../../config"),       // from dist/subdir (npm bundle variant)
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "chains.toml"))) return dir;
  }
  throw new Error(`Config directory not found. Searched: ${candidates.join(", ")}`);
}

const CONFIG_DIR = findConfigDir();

function readToml(relPath: string): string {
  return readFileSync(resolve(CONFIG_DIR, relPath), "utf-8");
}

interface ChainConfigWrapper {
  chain: Record<string, ChainConfig>;
}

interface TokensWrapper {
  token: TokenEntry[];
}

interface ProtocolWrapper {
  protocol: ProtocolEntry;
}

export class Registry {
  chains: Map<string, ChainConfig>;
  tokens: Map<string, TokenEntry[]>;
  protocols: ProtocolEntry[];

  private constructor(
    chains: Map<string, ChainConfig>,
    tokens: Map<string, TokenEntry[]>,
    protocols: ProtocolEntry[],
  ) {
    this.chains = chains;
    this.tokens = tokens;
    this.protocols = protocols;
  }

  static loadEmbedded(): Registry {
    const chains = Registry.loadChains();
    const tokens = Registry.loadTokens();
    const protocols = Registry.loadProtocols();
    return new Registry(chains, tokens, protocols);
  }

  private static loadChains(): Map<string, ChainConfig> {
    const raw = parse(readToml("chains.toml")) as unknown as ChainConfigWrapper;
    const map = new Map<string, ChainConfig>();
    for (const [key, data] of Object.entries(raw.chain)) {
      const cfg = Object.assign(new ChainConfig(), data);
      map.set(key, cfg);
    }
    return map;
  }

  private static loadTokens(): Map<string, TokenEntry[]> {
    // Dynamically discover all token files in config/tokens/
    const map = new Map<string, TokenEntry[]>();
    const tokensDir = resolve(CONFIG_DIR, "tokens");
    try {
      const files = readdirSync(tokensDir).filter(f => f.endsWith(".toml"));
      for (const file of files) {
        const chain = file.replace(".toml", "");
        try {
          const raw = parse(readToml(`tokens/${file}`)) as unknown as TokensWrapper;
          map.set(chain, raw.token);
        } catch { /* skip invalid token files */ }
      }
    } catch { /* tokens dir may not exist */ }
    return map;
  }

  private static loadProtocols(): ProtocolEntry[] {
    // Dynamically discover all protocol TOML files across all categories
    const protocols: ProtocolEntry[] = [];
    const protocolsDir = resolve(CONFIG_DIR, "protocols");
    const categories = ["dex", "lending", "cdp", "vault", "liquid_staking", "yield_aggregator", "yield_source", "derivatives", "options", "nft", "bridge"];

    for (const category of categories) {
      const catDir = resolve(protocolsDir, category);
      try {
        if (!existsSync(catDir)) continue;
        const files = readdirSync(catDir).filter(f => f.endsWith(".toml"));
        for (const file of files) {
          try {
            const raw = parse(readToml(`protocols/${category}/${file}`)) as unknown as ProtocolWrapper;
            protocols.push(raw.protocol);
          } catch { /* skip invalid protocol files */ }
        }
      } catch { /* category dir may not exist */ }
    }
    return protocols;
  }

  getChain(name: string): ChainConfig {
    const chain = this.chains.get(name);
    if (!chain) throw new Error(`Chain not found: ${name}`);
    return chain;
  }

  getProtocol(name: string): ProtocolEntry {
    const protocol = this.protocols.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.slug.toLowerCase() === name.toLowerCase(),
    );
    if (!protocol) throw new Error(`Protocol not found: ${name}`);
    return protocol;
  }

  getProtocolsByCategory(category: ProtocolCategory): ProtocolEntry[] {
    return this.protocols.filter((p) => p.category === category);
  }

  getProtocolsForChain(chain: string, includeUnverified = false): ProtocolEntry[] {
    return this.protocols.filter(
      (p) =>
        p.chain.toLowerCase() === chain.toLowerCase() &&
        (includeUnverified || p.verified !== false),
    );
  }

  resolveToken(chain: string, symbol: string): TokenEntry {
    const tokens = this.tokens.get(chain);
    if (!tokens) throw new Error(`Chain not found: ${chain}`);
    const token = tokens.find(
      (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
    );
    if (!token) throw new Error(`Token not found: ${symbol}`);
    return token;
  }

  /**
   * Resolve a pool by name (e.g. "WHYPE/USDC") from a protocol's pool list.
   * Returns the pool info or throws if not found.
   */
  resolvePool(protocolSlug: string, poolName: string): PoolInfo {
    const protocol = this.getProtocol(protocolSlug);
    if (!protocol.pools || protocol.pools.length === 0) {
      throw new Error(`Protocol ${protocol.name} has no pools configured`);
    }
    const pool = protocol.pools.find(
      (p) => p.name.toLowerCase() === poolName.toLowerCase(),
    );
    if (!pool) {
      const available = protocol.pools.map(p => p.name).join(", ");
      throw new Error(`Pool '${poolName}' not found in ${protocol.name}. Available: ${available}`);
    }
    return pool;
  }
}
