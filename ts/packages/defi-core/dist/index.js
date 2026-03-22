// src/types.ts
var TxStatus = /* @__PURE__ */ ((TxStatus2) => {
  TxStatus2["DryRun"] = "dry_run";
  TxStatus2["Simulated"] = "simulated";
  TxStatus2["SimulationFailed"] = "simulation_failed";
  TxStatus2["Pending"] = "pending";
  TxStatus2["Confirmed"] = "confirmed";
  TxStatus2["Failed"] = "failed";
  return TxStatus2;
})(TxStatus || {});
function formatHuman(t) {
  const divisor = 10n ** BigInt(t.decimals);
  const whole = t.amount / divisor;
  const frac = t.amount % divisor;
  return `${whole}.${frac.toString().padStart(t.decimals, "0")} ${t.symbol}`;
}
function newSlippage(bps) {
  return { bps };
}
function defaultSwapSlippage() {
  return { bps: 50 };
}
function applyMinSlippage(slippage, amount) {
  return amount * BigInt(1e4 - slippage.bps) / 10000n;
}
var InterestRateMode = /* @__PURE__ */ ((InterestRateMode2) => {
  InterestRateMode2["Variable"] = "variable";
  InterestRateMode2["Stable"] = "stable";
  return InterestRateMode2;
})(InterestRateMode || {});

// src/error.ts
var DefiError = class _DefiError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DefiError";
    this.code = code;
  }
  static protocolNotFound(name) {
    return new _DefiError("PROTOCOL_NOT_FOUND", `Protocol not found: ${name}`);
  }
  static tokenNotFound(name) {
    return new _DefiError("TOKEN_NOT_FOUND", `Token not found: ${name}`);
  }
  static chainNotFound(name) {
    return new _DefiError("CHAIN_NOT_FOUND", `Chain not found: ${name}`);
  }
  static insufficientBalance(needed, available) {
    return new _DefiError(
      "INSUFFICIENT_BALANCE",
      `Insufficient balance: need ${needed}, have ${available}`
    );
  }
  static insufficientAllowance(spender) {
    return new _DefiError(
      "INSUFFICIENT_ALLOWANCE",
      `Insufficient allowance for spender ${spender}`
    );
  }
  static slippageExceeded(expected, actual) {
    return new _DefiError(
      "SLIPPAGE_EXCEEDED",
      `Slippage exceeded: expected ${expected}, got ${actual}`
    );
  }
  static simulationFailed(reason) {
    return new _DefiError(
      "SIMULATION_FAILED",
      `Transaction simulation failed: ${reason}`
    );
  }
  static abiError(reason) {
    return new _DefiError("ABI_ERROR", `ABI encoding error: ${reason}`);
  }
  static registryError(reason) {
    return new _DefiError("REGISTRY_ERROR", `Registry error: ${reason}`);
  }
  static rpcError(reason) {
    return new _DefiError("RPC_ERROR", `RPC error: ${reason}`);
  }
  static providerError(reason) {
    return new _DefiError("PROVIDER_ERROR", `Provider error: ${reason}`);
  }
  static contractError(reason) {
    return new _DefiError("CONTRACT_ERROR", `Contract error: ${reason}`);
  }
  static invalidParam(reason) {
    return new _DefiError("INVALID_PARAM", `Invalid parameter: ${reason}`);
  }
  static unsupported(operation) {
    return new _DefiError(
      "UNSUPPORTED",
      `Unsupported operation: ${operation}`
    );
  }
  static internal(reason) {
    return new _DefiError("INTERNAL", `Internal error: ${reason}`);
  }
  toJSON() {
    return { error: this.message };
  }
};

// src/json.ts
function jsonReplacer(_key, value) {
  if (typeof value === "bigint") {
    return "0x" + value.toString(16);
  }
  return value;
}
function jsonReplacerDecimal(_key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
function jsonStringify(data, pretty = true) {
  return pretty ? JSON.stringify(data, jsonReplacerDecimal, 2) : JSON.stringify(data, jsonReplacerDecimal);
}
function parseBigInt(value) {
  if (value.startsWith("0x") || value.startsWith("0X")) {
    return BigInt(value);
  }
  return BigInt(value);
}

// src/erc20.ts
import { encodeFunctionData, parseAbi } from "viem";
var erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)"
]);
function buildApprove(token, spender, amount) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount]
  });
  return {
    description: `Approve ${spender} to spend ${amount} of token ${token}`,
    to: token,
    data,
    value: 0n,
    gas_estimate: 6e4
  };
}
function buildTransfer(token, to, amount) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount]
  });
  return {
    description: `Transfer ${amount} of token ${token} to ${to}`,
    to: token,
    data,
    value: 0n,
    gas_estimate: 65e3
  };
}

// src/provider.ts
import { createPublicClient, http } from "viem";
var providerCache = /* @__PURE__ */ new Map();
function getProvider(rpcUrl) {
  const cached = providerCache.get(rpcUrl);
  if (cached) return cached;
  const client = createPublicClient({ transport: http(rpcUrl) });
  providerCache.set(rpcUrl, client);
  return client;
}
function clearProviderCache() {
  providerCache.clear();
}

// src/multicall.ts
import { encodeFunctionData as encodeFunctionData2, decodeFunctionResult, parseAbi as parseAbi2 } from "viem";
var MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
var multicall3Abi = parseAbi2([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) returns (Result[] returnData)"
]);
function buildMulticall(calls) {
  const mcCalls = calls.map(([target, callData]) => ({
    target,
    allowFailure: true,
    callData
  }));
  const data = encodeFunctionData2({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [mcCalls]
  });
  return {
    description: `Multicall3 batch (${calls.length} calls)`,
    to: MULTICALL3_ADDRESS,
    data,
    value: 0n
  };
}
async function multicallRead(rpcUrl, calls) {
  const client = getProvider(rpcUrl);
  const mcCalls = calls.map(([target, callData]) => ({
    target,
    allowFailure: true,
    callData
  }));
  const result = await client.call({
    to: MULTICALL3_ADDRESS,
    data: encodeFunctionData2({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [mcCalls]
    })
  });
  if (!result.data) return calls.map(() => null);
  const decoded = decodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: result.data
  });
  return decoded.map((r) => r.success ? r.returnData : null);
}
function decodeU256(data) {
  if (!data || data.length < 66) return 0n;
  return BigInt(data.slice(0, 66));
}
function decodeU128(data) {
  if (!data || data.length < 66) return 0n;
  const val = BigInt(data.slice(0, 66));
  return val & (1n << 128n) - 1n;
}

// src/registry/chain.ts
var ChainConfig = class {
  name;
  chain_id;
  rpc_url;
  explorer_url;
  native_token;
  wrapped_native;
  multicall3;
  effectiveRpcUrl() {
    const chainEnv = this.name.toUpperCase().replace(/ /g, "_") + "_RPC_URL";
    return process.env[chainEnv] ?? process.env["HYPEREVM_RPC_URL"] ?? this.rpc_url;
  }
};

// src/registry/protocol.ts
var ProtocolCategory = /* @__PURE__ */ ((ProtocolCategory2) => {
  ProtocolCategory2["Dex"] = "dex";
  ProtocolCategory2["Lending"] = "lending";
  ProtocolCategory2["Cdp"] = "cdp";
  ProtocolCategory2["Bridge"] = "bridge";
  ProtocolCategory2["LiquidStaking"] = "liquid_staking";
  ProtocolCategory2["YieldSource"] = "yield_source";
  ProtocolCategory2["YieldAggregator"] = "yield_aggregator";
  ProtocolCategory2["Vault"] = "vault";
  ProtocolCategory2["Derivatives"] = "derivatives";
  ProtocolCategory2["Options"] = "options";
  ProtocolCategory2["LiquidityManager"] = "liquidity_manager";
  ProtocolCategory2["Nft"] = "nft";
  ProtocolCategory2["Other"] = "other";
  return ProtocolCategory2;
})(ProtocolCategory || {});
function protocolCategoryLabel(category) {
  switch (category) {
    case "dex" /* Dex */:
      return "DEX";
    case "lending" /* Lending */:
      return "Lending";
    case "cdp" /* Cdp */:
      return "CDP";
    case "bridge" /* Bridge */:
      return "Bridge";
    case "liquid_staking" /* LiquidStaking */:
      return "Liquid Staking";
    case "yield_source" /* YieldSource */:
      return "Yield Source";
    case "yield_aggregator" /* YieldAggregator */:
      return "Yield Aggregator";
    case "vault" /* Vault */:
      return "Vault";
    case "derivatives" /* Derivatives */:
      return "Derivatives";
    case "options" /* Options */:
      return "Options";
    case "liquidity_manager" /* LiquidityManager */:
      return "Liquidity Manager";
    case "nft" /* Nft */:
      return "NFT";
    case "other" /* Other */:
      return "Other";
  }
}

// src/registry/registry.ts
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { parse } from "smol-toml";
import { existsSync } from "fs";
var __dirname = fileURLToPath(new URL(".", import.meta.url));
function findConfigDir() {
  const candidates = [
    resolve(__dirname, "../../../config"),
    // from dist/registry/
    resolve(__dirname, "../../../../config")
    // from src/registry/
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "chains.toml"))) return dir;
  }
  throw new Error(`Config directory not found. Searched: ${candidates.join(", ")}`);
}
var CONFIG_DIR = findConfigDir();
function readToml(relPath) {
  return readFileSync(resolve(CONFIG_DIR, relPath), "utf-8");
}
var Registry = class _Registry {
  chains;
  tokens;
  protocols;
  constructor(chains, tokens, protocols) {
    this.chains = chains;
    this.tokens = tokens;
    this.protocols = protocols;
  }
  static loadEmbedded() {
    const chains = _Registry.loadChains();
    const tokens = _Registry.loadTokens();
    const protocols = _Registry.loadProtocols();
    return new _Registry(chains, tokens, protocols);
  }
  static loadChains() {
    const raw = parse(readToml("chains.toml"));
    const map = /* @__PURE__ */ new Map();
    for (const [key, data] of Object.entries(raw.chain)) {
      const cfg = Object.assign(new ChainConfig(), data);
      map.set(key, cfg);
    }
    return map;
  }
  static loadTokens() {
    const map = /* @__PURE__ */ new Map();
    const tokensDir = resolve(CONFIG_DIR, "tokens");
    try {
      const files = readdirSync(tokensDir).filter((f) => f.endsWith(".toml"));
      for (const file of files) {
        const chain = file.replace(".toml", "");
        try {
          const raw = parse(readToml(`tokens/${file}`));
          map.set(chain, raw.token);
        } catch {
        }
      }
    } catch {
    }
    return map;
  }
  static loadProtocols() {
    const protocols = [];
    const protocolsDir = resolve(CONFIG_DIR, "protocols");
    const categories = ["dex", "lending", "cdp", "vault", "liquid_staking", "yield_aggregator", "yield_source", "derivatives", "options", "nft", "bridge"];
    for (const category of categories) {
      const catDir = resolve(protocolsDir, category);
      try {
        if (!existsSync(catDir)) continue;
        const files = readdirSync(catDir).filter((f) => f.endsWith(".toml"));
        for (const file of files) {
          try {
            const raw = parse(readToml(`protocols/${category}/${file}`));
            protocols.push(raw.protocol);
          } catch {
          }
        }
      } catch {
      }
    }
    return protocols;
  }
  getChain(name) {
    const chain = this.chains.get(name);
    if (!chain) throw new Error(`Chain not found: ${name}`);
    return chain;
  }
  getProtocol(name) {
    const protocol = this.protocols.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() || p.slug.toLowerCase() === name.toLowerCase()
    );
    if (!protocol) throw new Error(`Protocol not found: ${name}`);
    return protocol;
  }
  getProtocolsByCategory(category) {
    return this.protocols.filter((p) => p.category === category);
  }
  getProtocolsForChain(chain) {
    return this.protocols.filter(
      (p) => p.chain.toLowerCase() === chain.toLowerCase()
    );
  }
  resolveToken(chain, symbol) {
    const tokens = this.tokens.get(chain);
    if (!tokens) throw new Error(`Chain not found: ${chain}`);
    const token = tokens.find(
      (t) => t.symbol.toLowerCase() === symbol.toLowerCase()
    );
    if (!token) throw new Error(`Token not found: ${symbol}`);
    return token;
  }
};
export {
  ChainConfig,
  DefiError,
  InterestRateMode,
  MULTICALL3_ADDRESS,
  ProtocolCategory,
  Registry,
  TxStatus,
  applyMinSlippage,
  buildApprove,
  buildMulticall,
  buildTransfer,
  clearProviderCache,
  decodeU128,
  decodeU256,
  defaultSwapSlippage,
  erc20Abi,
  formatHuman,
  getProvider,
  jsonReplacer,
  jsonReplacerDecimal,
  jsonStringify,
  multicallRead,
  newSlippage,
  parseBigInt,
  protocolCategoryLabel
};
//# sourceMappingURL=index.js.map