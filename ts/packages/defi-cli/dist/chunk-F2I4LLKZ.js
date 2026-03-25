#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

// src/executor.ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DefiError } from "@hypurrquant/defi-core";
var GAS_BUFFER_BPS = 12000n;
var DEFAULT_PRIORITY_FEE_WEI = 100000000n;
var Executor = class _Executor {
  dryRun;
  rpcUrl;
  constructor(broadcast, rpcUrl) {
    this.dryRun = !broadcast;
    this.rpcUrl = rpcUrl;
  }
  /** Apply 20% buffer to a gas estimate */
  static applyGasBuffer(gas) {
    return gas * GAS_BUFFER_BPS / 10000n;
  }
  /** Fetch EIP-1559 fee params from the network. Returns [maxFeePerGas, maxPriorityFeePerGas]. */
  async fetchEip1559Fees(rpcUrl) {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const gasPrice = await client.getGasPrice();
      let priorityFee = DEFAULT_PRIORITY_FEE_WEI;
      try {
        priorityFee = await client.estimateMaxPriorityFeePerGas();
      } catch {
      }
      const maxFee = gasPrice * 2n + priorityFee;
      return [maxFee, priorityFee];
    } catch {
      return [0n, 0n];
    }
  }
  /** Estimate gas dynamically with buffer, falling back to a hardcoded estimate */
  async estimateGasWithBuffer(rpcUrl, tx, from) {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const estimated = await client.estimateGas({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        account: from
      });
      if (estimated > 0n) return _Executor.applyGasBuffer(estimated);
    } catch {
    }
    return tx.gas_estimate ? BigInt(tx.gas_estimate) : 0n;
  }
  /** Simulate a transaction via eth_call + eth_estimateGas */
  async simulate(tx) {
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL \u2014 cannot simulate. Set HYPEREVM_RPC_URL.");
    }
    const client = createPublicClient({ transport: http(rpcUrl) });
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    const from = privateKey ? privateKeyToAccount(privateKey).address : "0x0000000000000000000000000000000000000001";
    try {
      await client.call({ to: tx.to, data: tx.data, value: tx.value, account: from });
      const gasEstimate = await this.estimateGasWithBuffer(rpcUrl, tx, from);
      const [maxFee, priorityFee] = await this.fetchEip1559Fees(rpcUrl);
      return {
        tx_hash: void 0,
        status: "simulated",
        gas_used: gasEstimate > 0n ? Number(gasEstimate) : void 0,
        description: tx.description,
        details: {
          to: tx.to,
          from,
          data: tx.data,
          value: tx.value.toString(),
          gas_estimate: gasEstimate.toString(),
          max_fee_per_gas_gwei: (Number(maxFee) / 1e9).toFixed(4),
          max_priority_fee_gwei: (Number(priorityFee) / 1e9).toFixed(4),
          mode: "simulated",
          result: "success"
        }
      };
    } catch (e) {
      const errMsg = String(e);
      const revertReason = extractRevertReason(errMsg);
      return {
        tx_hash: void 0,
        status: "simulation_failed",
        gas_used: tx.gas_estimate,
        description: tx.description,
        details: {
          to: tx.to,
          from,
          data: tx.data,
          value: tx.value.toString(),
          mode: "simulated",
          result: "revert",
          revert_reason: revertReason
        }
      };
    }
  }
  async execute(tx) {
    if (this.dryRun) {
      if (this.rpcUrl) {
        return this.simulate(tx);
      }
      return {
        tx_hash: void 0,
        status: "dry_run",
        gas_used: tx.gas_estimate,
        description: tx.description,
        details: {
          to: tx.to,
          data: tx.data,
          value: tx.value.toString(),
          mode: "dry_run"
        }
      };
    }
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    if (!privateKey) {
      throw DefiError.invalidParam(
        "DEFI_PRIVATE_KEY environment variable not set. Required for --broadcast."
      );
    }
    const account = privateKeyToAccount(privateKey);
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured for broadcasting");
    }
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
    const gasLimit = await this.estimateGasWithBuffer(rpcUrl, tx, account.address);
    const [maxFeePerGas, maxPriorityFeePerGas] = await this.fetchEip1559Fees(rpcUrl);
    process.stderr.write(`Broadcasting transaction to ${rpcUrl}...
`);
    if (gasLimit > 0n) {
      process.stderr.write(`  Gas limit: ${gasLimit} (with 20% buffer)
`);
    }
    const txHash = await walletClient.sendTransaction({
      chain: null,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gas: gasLimit > 0n ? gasLimit : void 0,
      maxFeePerGas: maxFeePerGas > 0n ? maxFeePerGas : void 0,
      maxPriorityFeePerGas: maxPriorityFeePerGas > 0n ? maxPriorityFeePerGas : void 0
    });
    process.stderr.write(`Transaction sent: ${txHash}
`);
    process.stderr.write("Waiting for confirmation...\n");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const status = receipt.status === "success" ? "confirmed" : "failed";
    return {
      tx_hash: txHash,
      status,
      gas_used: receipt.gasUsed ? Number(receipt.gasUsed) : void 0,
      description: tx.description,
      details: {
        to: tx.to,
        from: account.address,
        block_number: receipt.blockNumber?.toString(),
        gas_limit: gasLimit.toString(),
        gas_used: receipt.gasUsed?.toString(),
        mode: "broadcast"
      }
    };
  }
};
function extractRevertReason(err) {
  for (const marker of ["execution reverted:", "revert:", "Error("]) {
    const pos = err.indexOf(marker);
    if (pos !== -1) return err.slice(pos);
  }
  return err.length > 200 ? err.slice(0, 200) + "..." : err;
}

// src/output.ts
import { jsonStringify, jsonReplacerDecimal } from "@hypurrquant/defi-core";

// src/table.ts
import pc from "picocolors";
function renderTable(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value;
  if ("alerts" in v && "scan_duration_ms" in v) return renderScan(v);
  if ("holders" in v) return renderWhales(v);
  if ("opportunities" in v && "total_opportunities" in v) return renderCompare(v);
  if ("arb_opportunities" in v && "rates" in v) return renderYieldScan(v);
  if ("rates" in v && "asset" in v) return renderYield(v);
  if ("chains" in v && "total_alerts" in v) return renderScanAll(v);
  if ("chains" in v && "chains_scanned" in v) return renderPositions(v);
  if ("bridge" in v && "amount_out" in v) return renderBridge(v);
  if ("aggregator" in v && "amount_out" in v) return renderSwap(v);
  if ("protocols" in v && "summary" in v) return renderStatus(v);
  if ("token_balances" in v && "lending_positions" in v) return renderPortfolio(v);
  return null;
}
function makeTable(headers, rows) {
  const colWidths = headers.map(
    (h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").replace(/\x1b\[[0-9;]*m/g, "").length))
  );
  const sep = "\u253C" + colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u253C") + "\u253C";
  const topBorder = "\u250C" + colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u252C") + "\u2510";
  const midBorder = "\u251C" + colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u253C") + "\u2524";
  const botBorder = "\u2514" + colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u2534") + "\u2518";
  function padCell(text, width) {
    const visLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
    return text + " ".repeat(Math.max(0, width - visLen));
  }
  const headerRow = "\u2502 " + headers.map((h, i) => padCell(pc.bold(h), colWidths[i])).join(" \u2502 ") + " \u2502";
  const dataRows = rows.map(
    (row) => "\u2502 " + row.map((cell, i) => padCell(cell ?? "", colWidths[i])).join(" \u2502 ") + " \u2502"
  );
  return [topBorder, headerRow, midBorder, ...dataRows, botBorder].join("\n");
}
function asStr(v) {
  if (v === void 0 || v === null) return "?";
  return String(v);
}
function asF64(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}
function asU64(v) {
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}
function asArr(v) {
  if (Array.isArray(v)) return v;
  return [];
}
function asObj(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return {};
}
function formatPrice(v) {
  const p = asF64(v);
  if (p === 0) return "?";
  return p > 1e3 ? `$${p.toFixed(0)}` : `$${p.toFixed(4)}`;
}
function renderScan(v) {
  const chain = asStr(v["chain"]);
  const ms = asU64(v["scan_duration_ms"]);
  const count = asU64(v["alert_count"]);
  let out = `  Scan: ${chain} (${ms} ms)
`;
  if (count > 0) {
    const rows = asArr(v["alerts"]).map((a) => {
      const ao = asObj(a);
      const sev = asStr(ao["severity"]);
      const color = sev === "critical" ? pc.red : sev === "high" ? pc.yellow : pc.cyan;
      return [
        color(sev.toUpperCase()),
        asStr(ao["pattern"]),
        asStr(ao["asset"]),
        formatPrice(ao["oracle_price"]),
        formatPrice(ao["dex_price"]),
        `${asF64(ao["deviation_pct"]).toFixed(1)}%`
      ];
    });
    out += makeTable(["Severity", "Pattern", "Asset", "Oracle", "DEX", "Gap"], rows);
  } else {
    out += `  ${count} alerts
`;
  }
  const data = asObj(v["data"]);
  const o = Object.keys(asObj(data["oracle_prices"])).length;
  const d = Object.keys(asObj(data["dex_prices"])).length;
  const s = Object.keys(asObj(data["stablecoin_pegs"])).length;
  out += `
  Data: ${o} oracle, ${d} dex, ${s} stablecoin prices`;
  return out;
}
function renderScanAll(v) {
  const total = asU64(v["total_alerts"]);
  const scanned = asU64(v["chains_scanned"]);
  const ms = asU64(v["scan_duration_ms"]);
  const rows = asArr(v["chains"]).map((c) => {
    const co = asObj(c);
    const alerts = asU64(co["alert_count"]);
    const cms = asU64(co["scan_duration_ms"]);
    const details = asArr(co["alerts"]).map((a) => asStr(asObj(a)["asset"])).join(", ") || "clean";
    const alertStr = alerts > 0 ? pc.yellow(String(alerts)) : pc.green(String(alerts));
    return [asStr(co["chain"]), alertStr, `${cms}ms`, details];
  });
  return `  All-chain scan: ${scanned} chains, ${total} alerts, ${ms}ms

` + makeTable(["Chain", "Alerts", "Time", "Details"], rows);
}
function renderWhales(v) {
  const chain = asStr(v["chain"]);
  const token = asStr(v["token"]);
  const rows = asArr(v["holders"]).map((h) => {
    const ho = asObj(h);
    const addr = asStr(ho["address"]);
    const short = addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr;
    return [String(asU64(ho["rank"])), short, asF64(ho["balance"]).toFixed(2)];
  });
  return `  ${chain} ${token} Top Holders

` + makeTable(["#", "Address", `${token} Balance`], rows);
}
function renderYield(v) {
  const chain = asStr(v["chain"]);
  const asset = asStr(v["asset"]);
  const rows = asArr(v["rates"]).map((r) => {
    const ro = asObj(r);
    const supply = asF64(ro["supply_apy"]);
    const borrow = asF64(ro["borrow_variable_apy"]);
    const color = supply > 3 ? pc.green : supply > 1 ? pc.cyan : (s) => s;
    return [asStr(ro["protocol"]), color(`${supply.toFixed(2)}%`), `${borrow.toFixed(2)}%`];
  });
  const best = asStr(v["best_supply"]);
  return `  ${chain} ${asset} Yield Comparison (best: ${best})

` + makeTable(["Protocol", "Supply APY", "Borrow APY"], rows);
}
function renderPositions(v) {
  const addr = asStr(v["address"]);
  const summary = asObj(v["summary"]);
  const total = asF64(v["total_value_usd"] ?? summary["total_value_usd"]);
  const ms = asU64(v["scan_duration_ms"]);
  const scanned = asU64(v["chains_scanned"]);
  let out = `  Positions for ${addr.slice(0, 8)}...${addr.slice(-4)} (${ms}ms, ${scanned} chains)
  Total: $${total.toFixed(2)}

`;
  for (const c of asArr(v["chains"])) {
    const co = asObj(c);
    const chain = asStr(co["chain"]);
    const ctotal = asF64(co["chain_total_usd"]);
    out += `  ${chain} ($${ctotal.toFixed(2)})
`;
    const rows = [];
    for (const b of asArr(co["token_balances"])) {
      const bo = asObj(b);
      rows.push(["wallet", asStr(bo["symbol"]), pc.green(`$${asF64(bo["value_usd"]).toFixed(2)}`)]);
    }
    for (const l of asArr(co["lending_positions"])) {
      const lo = asObj(l);
      const coll = asF64(lo["collateral_usd"]);
      const debt = asF64(lo["debt_usd"]);
      rows.push(["lending", asStr(lo["protocol"]), pc.cyan(`coll $${coll.toFixed(0)} debt $${debt.toFixed(0)}`)]);
    }
    out += makeTable(["Type", "Asset/Protocol", "Value"], rows) + "\n";
  }
  return out;
}
function renderSwap(v) {
  const from = asStr(v["from"]);
  const to = asStr(v["to"]);
  const amtIn = asF64(v["amount_in"]);
  const amtOut = asF64(v["amount_out"]);
  const impact = typeof v["price_impact_pct"] === "number" ? `${asF64(v["price_impact_pct"]).toFixed(4)}%` : "n/a";
  const agg = asStr(v["aggregator"]);
  const chain = asStr(v["chain"]);
  return `  Swap on ${chain} via ${agg}

  ${amtIn} ${from} -> ${amtOut.toFixed(6)} ${to}
  Price impact: ${impact}
`;
}
function renderBridge(v) {
  const from = asStr(v["from_chain"]);
  const to = asStr(v["to_chain"]);
  const token = asStr(v["token"]);
  const amtIn = asF64(v["amount_in"]);
  const amtOut = asF64(v["amount_out"]);
  const cost = asF64(v["total_cost_usd"]);
  const time = asU64(v["estimated_time_sec"]);
  const bridge = asStr(v["bridge"]);
  return `  Bridge ${from} -> ${to} via ${bridge}

  ${amtIn} ${token} -> ${amtOut.toFixed(6)} ${token}
  Cost: $${cost.toFixed(2)} | Time: ${time}s
`;
}
function renderStatus(v) {
  const chain = asStr(v["chain"]);
  const summary = asObj(v["summary"]);
  const totalP = asU64(summary["total_protocols"]);
  const totalT = asU64(summary["total_tokens"]);
  const rows = asArr(v["protocols"]).map((p) => {
    const po = asObj(p);
    return [asStr(po["name"]), asStr(po["category"]), asStr(po["interface"])];
  });
  const tokens = asArr(v["tokens"]).map((t) => String(t)).filter(Boolean);
  let out = `  ${chain} \u2014 ${totalP} protocols`;
  if (tokens.length > 0) {
    out += `, ${totalT} tokens
  Tokens: ${tokens.join(", ")}`;
  }
  return `${out}

` + makeTable(["Protocol", "Category", "Interface"], rows);
}
function renderCompare(v) {
  const asset = asStr(v["asset"]);
  const ms = asU64(v["scan_duration_ms"]);
  const total = asU64(v["total_opportunities"]);
  const rows = asArr(v["opportunities"]).map((opp) => {
    const oo = asObj(opp);
    const typ = asStr(oo["type"]);
    const apy = asF64(oo["apy"]);
    const detail = asStr(oo["detail"]);
    const risk = asStr(oo["risk"]);
    const oppAsset = asStr(oo["asset"]);
    const typeLabel = typ === "perp_funding" ? "Perp Arb" : typ === "perp_rate" ? "Perp Rate" : typ === "lending_supply" ? "Lending" : typ;
    const apyColor = Math.abs(apy) > 20 ? pc.green : Math.abs(apy) > 5 ? pc.cyan : (s) => s;
    const riskColor = risk === "high" ? pc.red : risk === "medium" ? pc.yellow : pc.green;
    return [typeLabel, oppAsset, apyColor(`${apy.toFixed(1)}%`), detail, riskColor(risk)];
  });
  return `  Yield Compare: ${asset} (${total} opportunities, ${ms}ms)

` + makeTable(["Type", "Asset", "APY", "Where", "Risk"], rows);
}
function renderYieldScan(v) {
  const asset = asStr(v["asset"]);
  const ms = asU64(v["scan_duration_ms"]);
  const best = asStr(v["best_supply"]);
  const rows = asArr(v["rates"]).map((r) => {
    const ro = asObj(r);
    const supply = asF64(ro["supply_apy"]);
    const borrow = asF64(ro["borrow_variable_apy"]);
    const color = supply > 3 ? pc.green : supply > 1 ? pc.cyan : (s) => s;
    return [asStr(ro["chain"]), asStr(ro["protocol"]), color(`${supply.toFixed(2)}%`), `${borrow.toFixed(2)}%`];
  });
  let out = `  ${asset} Yield Scan (${ms}ms) \u2014 Best: ${best}

` + makeTable(["Chain", "Protocol", "Supply APY", "Borrow APY"], rows);
  const arbs = asArr(v["arb_opportunities"]);
  if (arbs.length > 0) {
    const arbRows = arbs.map((a) => {
      const ao = asObj(a);
      const spread = asF64(ao["spread_pct"]);
      const color = spread > 1 ? pc.green : pc.cyan;
      return [
        color(`+${spread.toFixed(2)}%`),
        `${asStr(ao["supply_protocol"])} (${asStr(ao["supply_chain"])})`,
        `${asStr(ao["borrow_protocol"])} (${asStr(ao["borrow_chain"])})`,
        asStr(ao["strategy"])
      ];
    });
    out += "\n  Arb Opportunities\n\n" + makeTable(["Spread", "Supply @", "Borrow @", "Type"], arbRows);
  }
  return out;
}
function renderPortfolio(v) {
  return renderPositions(v);
}

// src/output.ts
function parseOutputMode(opts) {
  return {
    json: !!(opts.json || opts.ndjson),
    ndjson: !!opts.ndjson,
    fields: opts.fields ? opts.fields.split(",").map((f) => f.trim()) : void 0
  };
}
function formatOutput(value, mode) {
  if (mode.ndjson) {
    return JSON.stringify(value, jsonReplacerDecimal);
  }
  if (mode.json) {
    let jsonVal2 = JSON.parse(jsonStringify(value));
    if (mode.fields && typeof jsonVal2 === "object" && jsonVal2 !== null && !Array.isArray(jsonVal2)) {
      const filtered = {};
      for (const key of mode.fields) {
        if (key in jsonVal2) filtered[key] = jsonVal2[key];
      }
      jsonVal2 = filtered;
    }
    return JSON.stringify(jsonVal2, null, 2);
  }
  const jsonVal = JSON.parse(jsonStringify(value));
  const table = renderTable(jsonVal);
  if (table !== null) return table;
  return JSON.stringify(jsonVal, null, 2);
}
function printOutput(value, mode) {
  console.log(formatOutput(value, mode));
}

// src/cli.ts
import { Registry as Registry25 } from "@hypurrquant/defi-core";

// src/commands/status.ts
import { Registry } from "@hypurrquant/defi-core";
import { createPublicClient as createPublicClient2, http as http2 } from "viem";
function isPlaceholder(addr) {
  if (!addr.startsWith("0x") || addr.length !== 42) return false;
  const hex = addr.slice(2).toLowerCase();
  return hex.slice(0, 36).split("").every((c) => c === "0") && parseInt(hex.slice(36), 16) <= 16;
}
function registerStatus(parent, getOpts) {
  parent.command("status").description("Show chain and protocol status").option("--verify", "Verify contract addresses on-chain").action(async (opts) => {
    const globalOpts = parent.opts();
    const chainName = globalOpts.chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chainConfig = registry.getChain(chainName);
    const chainProtocols = registry.getProtocolsForChain(chainName);
    let blockNumber;
    let codeMap;
    let placeholderCount = 0;
    for (const p of chainProtocols) {
      for (const addr of Object.values(p.contracts ?? {})) {
        if (isPlaceholder(addr)) placeholderCount++;
      }
    }
    if (opts.verify) {
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const client = createPublicClient2({ transport: http2(rpcUrl) });
      try {
        const bn = await client.getBlockNumber();
        blockNumber = Number(bn);
        process.stderr.write(
          `Connected to ${rpcUrl} (block #${blockNumber}). Verifying contracts...
`
        );
      } catch (e) {
        process.stderr.write(`Warning: could not get block number
`);
      }
      codeMap = /* @__PURE__ */ new Map();
      const allAddrs = [];
      for (const p of chainProtocols) {
        for (const [name, addr] of Object.entries(p.contracts ?? {})) {
          if (!isPlaceholder(addr)) {
            allAddrs.push({ key: `${p.name}:${name}`, addr });
          }
        }
      }
      for (let i = 0; i < allAddrs.length; i += 20) {
        const chunk = allAddrs.slice(i, i + 20);
        const results = await Promise.all(
          chunk.map(async ({ key, addr }) => {
            try {
              const code = await client.getCode({ address: addr });
              return { key, hasCode: !!code && code !== "0x" };
            } catch {
              return { key, hasCode: false };
            }
          })
        );
        for (const r of results) {
          codeMap.set(r.key, r.hasCode);
        }
      }
    }
    let verifiedCount = 0;
    let invalidCount = 0;
    const protocols = chainProtocols.map((p) => {
      const contracts = Object.entries(p.contracts ?? {}).map(
        ([name, addr]) => {
          if (isPlaceholder(addr)) {
            return { name, address: addr, status: "placeholder" };
          }
          if (codeMap) {
            const hasCode = codeMap.get(`${p.name}:${name}`) ?? false;
            if (hasCode) verifiedCount++;
            else invalidCount++;
            return {
              name,
              address: addr,
              has_code: hasCode,
              status: hasCode ? "verified" : "NO_CODE"
            };
          }
          return { name, address: addr };
        }
      );
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        interface: p.interface,
        contracts
      };
    });
    const output = {
      chain: chainConfig.name,
      chain_id: chainConfig.chain_id,
      rpc_url: chainConfig.effectiveRpcUrl(),
      ...blockNumber !== void 0 ? { block_number: blockNumber } : {},
      protocols,
      summary: {
        total_protocols: protocols.length,
        ...opts.verify ? {
          verified_contracts: verifiedCount,
          invalid_contracts: invalidCount,
          placeholder_contracts: placeholderCount
        } : {}
      }
    };
    printOutput(output, getOpts());
  });
}

// src/agent.ts
import { DefiError as DefiError2 } from "@hypurrquant/defi-core";
function handleSchema(params) {
  const action = typeof params["action"] === "string" ? params["action"] : "all";
  switch (action) {
    case "dex.swap":
      return {
        action: "dex.swap",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug (e.g. hyperswap-v3)" },
          token_in: { type: "string", required: true, description: "Input token symbol or address" },
          token_out: { type: "string", required: true, description: "Output token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable, e.g. '1.5')" },
          slippage_bps: { type: "number", required: false, default: 50, description: "Slippage in basis points" },
          recipient: { type: "string", required: false, description: "Recipient address" }
        }
      };
    case "dex.quote":
      return {
        action: "dex.quote",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          token_in: { type: "string", required: true, description: "Input token symbol or address" },
          token_out: { type: "string", required: true, description: "Output token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" }
        }
      };
    case "lending.supply":
    case "lending.borrow":
    case "lending.repay":
    case "lending.withdraw":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          asset: { type: "string", required: true, description: "Token symbol or address" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" }
        }
      };
    case "staking.stake":
    case "staking.unstake":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" }
        }
      };
    case "vault.deposit":
    case "vault.withdraw":
      return {
        action,
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          amount: { type: "string", required: true, description: "Amount (human-readable)" }
        }
      };
    case "cdp.open":
      return {
        action: "cdp.open",
        params: {
          protocol: { type: "string", required: true, description: "Protocol slug" },
          collateral: { type: "string", required: true, description: "Collateral token symbol or address" },
          collateral_amount: { type: "string", required: true, description: "Collateral amount (human-readable)" },
          debt_amount: { type: "string", required: true, description: "Debt amount (human-readable)" }
        }
      };
    case "status":
      return { action: "status", params: {} };
    case "list_protocols":
      return {
        action: "list_protocols",
        params: {
          category: { type: "string", required: false, description: "Filter by category (e.g. dex, lending, vault)" }
        }
      };
    default:
      return {
        actions: [
          "status",
          "list_protocols",
          "schema",
          "dex.swap",
          "dex.quote",
          "lending.supply",
          "lending.borrow",
          "lending.repay",
          "lending.withdraw",
          "staking.stake",
          "staking.unstake",
          "vault.deposit",
          "vault.withdraw",
          "cdp.open"
        ]
      };
  }
}

// src/commands/schema.ts
function registerSchema(parent, getOpts) {
  parent.command("schema [command]").description("Output JSON schema for a command (agent-friendly)").option("--all", "Show all schemas").action(async (command, opts) => {
    const mode = getOpts();
    const action = opts.all ? "all" : command ?? "all";
    const params = { action };
    const schema = handleSchema(params);
    printOutput(schema, mode);
  });
}

// src/commands/dex.ts
import { Registry as Registry2 } from "@hypurrquant/defi-core";
import { createDex } from "@hypurrquant/defi-protocols";
function registerDex(parent, getOpts, makeExecutor2) {
  const dex = parent.command("dex").description("DEX operations: swap, quote, compare");
  dex.command("quote").description("Get a swap quote without executing").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-in <token>", "Input token symbol or address").requiredOption("--token-out <token>", "Output token symbol or address").requiredOption("--amount <amount>", "Amount of input token in wei").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry2.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createDex(protocol, chain.effectiveRpcUrl());
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const result = await adapter.quote({ protocol: protocol.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(opts.amount) });
    printOutput(result, getOpts());
  });
  dex.command("swap").description("Execute a token swap").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-in <token>", "Input token").requiredOption("--token-out <token>", "Output token").requiredOption("--amount <amount>", "Amount in wei").option("--slippage <bps>", "Slippage tolerance in bps", "50").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry2.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createDex(protocol, chain.effectiveRpcUrl());
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildSwap({
      protocol: protocol.name,
      token_in: tokenIn,
      token_out: tokenOut,
      amount_in: BigInt(opts.amount),
      slippage: { bps: parseInt(opts.slippage) },
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  dex.command("lp-add").description("Add liquidity to a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-a <token>", "First token symbol or address").requiredOption("--token-b <token>", "Second token symbol or address").requiredOption("--amount-a <amount>", "Amount of token A in wei").requiredOption("--amount-b <amount>", "Amount of token B in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry2.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createDex(protocol, chain.effectiveRpcUrl());
    const tokenA = opts.tokenA.startsWith("0x") ? opts.tokenA : registry.resolveToken(chainName, opts.tokenA).address;
    const tokenB = opts.tokenB.startsWith("0x") ? opts.tokenB : registry.resolveToken(chainName, opts.tokenB).address;
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildAddLiquidity({
      protocol: protocol.name,
      token_a: tokenA,
      token_b: tokenB,
      amount_a: BigInt(opts.amountA),
      amount_b: BigInt(opts.amountB),
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  dex.command("lp-remove").description("Remove liquidity from a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-a <token>", "First token symbol or address").requiredOption("--token-b <token>", "Second token symbol or address").requiredOption("--liquidity <amount>", "Liquidity amount to remove in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry2.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createDex(protocol, chain.effectiveRpcUrl());
    const tokenA = opts.tokenA.startsWith("0x") ? opts.tokenA : registry.resolveToken(chainName, opts.tokenA).address;
    const tokenB = opts.tokenB.startsWith("0x") ? opts.tokenB : registry.resolveToken(chainName, opts.tokenB).address;
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildRemoveLiquidity({
      protocol: protocol.name,
      token_a: tokenA,
      token_b: tokenB,
      liquidity: BigInt(opts.liquidity),
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  dex.command("compare").description("Compare quotes across DEXes").requiredOption("--token-in <token>", "Input token").requiredOption("--token-out <token>", "Output token").requiredOption("--amount <amount>", "Amount in wei").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry2.loadEmbedded();
    const chain = registry.getChain(chainName);
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const dexProtocols = registry.getProtocolsByCategory("dex").filter((p) => p.chain === chainName);
    const results = [];
    await Promise.all(dexProtocols.map(async (p) => {
      try {
        const adapter = createDex(p, chain.effectiveRpcUrl());
        const q = await adapter.quote({ protocol: p.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(opts.amount) });
        results.push({ protocol: p.name, amount_out: q.amount_out });
      } catch (e) {
        results.push({ protocol: p.name, amount_out: 0n, error: e instanceof Error ? e.message : String(e) });
      }
    }));
    results.sort((a, b) => b.amount_out > a.amount_out ? 1 : -1);
    printOutput({ chain: chainName, quotes: results }, getOpts());
  });
}

// src/commands/gauge.ts
import { Registry as Registry3 } from "@hypurrquant/defi-core";
import { privateKeyToAccount as privateKeyToAccount2 } from "viem/accounts";
import { createGauge } from "@hypurrquant/defi-protocols";
function registerGauge(parent, getOpts, makeExecutor2) {
  const gauge = parent.command("gauge").description("Gauge operations: deposit, withdraw, claim, lock, vote (ve(3,3))");
  gauge.command("deposit").description("Deposit LP tokens into a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").requiredOption("--amount <amount>", "LP token amount in wei").option("--ve-nft <tokenId>", "veNFT token ID for boosted rewards").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry3.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol);
    const tokenId = opts.veNft ? BigInt(opts.veNft) : void 0;
    const tx = await adapter.buildDeposit(opts.gauge, BigInt(opts.amount), tokenId);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("withdraw").description("Withdraw LP tokens from a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").requiredOption("--amount <amount>", "LP token amount in wei").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry3.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol);
    const tx = await adapter.buildWithdraw(opts.gauge, BigInt(opts.amount));
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("claim").description("Claim earned rewards from a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry3.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, executor.rpcUrl);
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    const account = privateKey ? privateKeyToAccount2(privateKey).address : void 0;
    const tx = await adapter.buildClaimRewards(opts.gauge, account);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("lock").description("Create a veNFT lock").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount to lock in wei").option("--days <days>", "Lock duration in days", "365").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry3.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol);
    const tx = await adapter.buildCreateLock(BigInt(opts.amount), parseInt(opts.days) * 86400);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("vote").description("Vote on gauge emissions with veNFT").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--ve-nft <tokenId>", "veNFT token ID").requiredOption("--pools <pools>", "Pool addresses (comma-separated)").requiredOption("--weights <weights>", "Vote weights (comma-separated)").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry3.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol);
    const pools = opts.pools.split(",");
    const weights = opts.weights.split(",").map((w) => BigInt(w));
    const tx = await adapter.buildVote(BigInt(opts.veNft), pools, weights);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/lending.ts
import { Registry as Registry4, InterestRateMode } from "@hypurrquant/defi-core";
import { createLending } from "@hypurrquant/defi-protocols";
function registerLending(parent, getOpts, makeExecutor2) {
  const lending = parent.command("lending").description("Lending operations: supply, borrow, repay, withdraw, rates, position");
  lending.command("rates").description("Show current lending rates").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const rates = await adapter.getRates(asset);
    printOutput(rates, getOpts());
  });
  lending.command("position").description("Show current lending position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const position = await adapter.getUserPosition(opts.address);
    printOutput(position, getOpts());
  });
  lending.command("supply").description("Supply an asset to a lending protocol").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount to supply in wei").option("--on-behalf-of <address>", "On behalf of address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const onBehalfOf = opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildSupply({ protocol: protocol.name, asset, amount: BigInt(opts.amount), on_behalf_of: onBehalfOf });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lending.command("borrow").description("Borrow an asset").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount in wei").option("--rate-mode <mode>", "variable or stable", "variable").option("--on-behalf-of <address>", "On behalf of address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const onBehalfOf = opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildBorrow({
      protocol: protocol.name,
      asset,
      amount: BigInt(opts.amount),
      interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
      on_behalf_of: onBehalfOf
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lending.command("repay").description("Repay a borrowed asset").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount in wei").option("--rate-mode <mode>", "variable or stable", "variable").option("--on-behalf-of <address>", "On behalf of address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const onBehalfOf = opts.onBehalfOf ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildRepay({
      protocol: protocol.name,
      asset,
      amount: BigInt(opts.amount),
      interest_rate_mode: opts.rateMode === "stable" ? InterestRateMode.Stable : InterestRateMode.Variable,
      on_behalf_of: onBehalfOf
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lending.command("withdraw").description("Withdraw a supplied asset").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount in wei").option("--to <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry4.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const to = opts.to ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildWithdraw({ protocol: protocol.name, asset, amount: BigInt(opts.amount), to });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/cdp.ts
import { Registry as Registry5 } from "@hypurrquant/defi-core";
import { createCdp } from "@hypurrquant/defi-protocols";
function registerCdp(parent, getOpts, makeExecutor2) {
  const cdp = parent.command("cdp").description("CDP operations: open, adjust, close, info");
  cdp.command("open").description("Open a new CDP position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--collateral <token>", "Collateral token address").requiredOption("--amount <amount>", "Collateral amount in wei").requiredOption("--mint <amount>", "Stablecoin to mint in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry5.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createCdp(protocol, chain.effectiveRpcUrl());
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildOpen({
      protocol: protocol.name,
      collateral: opts.collateral,
      collateral_amount: BigInt(opts.amount),
      debt_amount: BigInt(opts.mint),
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  cdp.command("info").description("Show CDP position info, or protocol overview if --position is omitted").requiredOption("--protocol <protocol>", "Protocol slug").option("--position <id>", "CDP/trove ID (omit for protocol overview)").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry5.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    if (opts.position === void 0) {
      printOutput({
        name: protocol.name,
        slug: protocol.slug,
        chain: chainName,
        contracts: protocol.contracts ?? {}
      }, getOpts());
      return;
    }
    const adapter = createCdp(protocol, chain.effectiveRpcUrl());
    const info = await adapter.getCdpInfo(BigInt(opts.position));
    printOutput(info, getOpts());
  });
  cdp.command("adjust").description("Adjust an existing CDP position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--position <id>", "CDP/trove ID").option("--add-collateral <amount>", "Add collateral in wei").option("--withdraw-collateral <amount>", "Withdraw collateral in wei").option("--mint <amount>", "Mint additional stablecoin").option("--repay <amount>", "Repay stablecoin").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry5.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createCdp(protocol, chain.effectiveRpcUrl());
    const tx = await adapter.buildAdjust({
      protocol: protocol.name,
      cdp_id: BigInt(opts.position),
      collateral_delta: opts.addCollateral ? BigInt(opts.addCollateral) : opts.withdrawCollateral ? BigInt(opts.withdrawCollateral) : void 0,
      debt_delta: opts.mint ? BigInt(opts.mint) : opts.repay ? BigInt(opts.repay) : void 0,
      add_collateral: !!opts.addCollateral,
      add_debt: !!opts.mint
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  cdp.command("close").description("Close a CDP position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--position <id>", "CDP/trove ID").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry5.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createCdp(protocol, chain.effectiveRpcUrl());
    const tx = await adapter.buildClose({ protocol: protocol.name, cdp_id: BigInt(opts.position) });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/staking.ts
import { Registry as Registry6 } from "@hypurrquant/defi-core";
import { createLiquidStaking } from "@hypurrquant/defi-protocols";
function registerStaking(parent, getOpts, makeExecutor2) {
  const staking = parent.command("staking").description("Liquid staking: stake, unstake, info");
  staking.command("stake").description("Stake tokens via liquid staking").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry6.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildStake({ protocol: protocol.name, amount: BigInt(opts.amount), recipient });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  staking.command("unstake").description("Unstake tokens").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry6.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildUnstake({ protocol: protocol.name, amount: BigInt(opts.amount), recipient });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  staking.command("info").description("Show staking info and rates").requiredOption("--protocol <protocol>", "Protocol slug").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry6.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
    const info = await adapter.getInfo();
    printOutput(info, getOpts());
  });
}

// src/commands/vault.ts
import { Registry as Registry7 } from "@hypurrquant/defi-core";
import { createVault } from "@hypurrquant/defi-protocols";
function registerVault(parent, getOpts, makeExecutor2) {
  const vault = parent.command("vault").description("Vault operations: deposit, withdraw, info");
  vault.command("deposit").description("Deposit assets into a vault").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei").option("--receiver <address>", "Receiver address for vault shares").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry7.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createVault(protocol, chain.effectiveRpcUrl());
    const receiver = opts.receiver ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildDeposit(BigInt(opts.amount), receiver);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  vault.command("withdraw").description("Withdraw assets from a vault").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei (shares)").option("--receiver <address>", "Receiver address").option("--owner <address>", "Owner address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry7.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createVault(protocol, chain.effectiveRpcUrl());
    const receiver = opts.receiver ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const owner = opts.owner ?? receiver;
    const tx = await adapter.buildWithdraw(BigInt(opts.amount), receiver, owner);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  vault.command("info").description("Show vault info (TVL, APY, shares)").requiredOption("--protocol <protocol>", "Protocol slug").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry7.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createVault(protocol, chain.effectiveRpcUrl());
    const info = await adapter.getVaultInfo();
    printOutput(info, getOpts());
  });
}

// src/commands/yield.ts
import { Registry as Registry8, ProtocolCategory } from "@hypurrquant/defi-core";
import { createLending as createLending2, createVault as createVault2 } from "@hypurrquant/defi-protocols";
function resolveAsset(registry, chain, asset) {
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    return asset;
  }
  return registry.resolveToken(chain, asset).address;
}
async function collectLendingRates(registry, chainName, rpc, assetAddr) {
  const protos = registry.getProtocolsForChain(chainName).filter(
    (p) => p.category === ProtocolCategory.Lending && (p.interface === "aave_v3" || p.interface === "aave_v3_isolated")
  );
  const results = [];
  let first = true;
  for (const proto of protos) {
    if (!first) {
      await new Promise((r) => setTimeout(r, 500));
    }
    first = false;
    try {
      const lending = createLending2(proto, rpc);
      const rates = await lending.getRates(assetAddr);
      results.push(rates);
    } catch (err) {
      process.stderr.write(`Warning: ${proto.name} rates unavailable: ${err}
`);
    }
  }
  return results;
}
async function collectAllYields(registry, chainName, rpc, asset, assetAddr) {
  const opportunities = [];
  const lendingRates = await collectLendingRates(registry, chainName, rpc, assetAddr);
  for (const r of lendingRates) {
    if (r.supply_apy > 0) {
      opportunities.push({
        protocol: r.protocol,
        type: "lending_supply",
        asset,
        apy: r.supply_apy,
        utilization: r.utilization
      });
    }
  }
  const chainProtos = registry.getProtocolsForChain(chainName);
  for (const proto of chainProtos) {
    if (proto.category === ProtocolCategory.Lending && proto.interface === "morpho_blue") {
      try {
        const lending = createLending2(proto, rpc);
        const rates = await lending.getRates(assetAddr);
        if (rates.supply_apy > 0) {
          opportunities.push({
            protocol: rates.protocol,
            type: "morpho_vault",
            asset,
            apy: rates.supply_apy,
            utilization: rates.utilization
          });
        }
      } catch {
      }
    }
  }
  for (const proto of chainProtos) {
    if (proto.category === ProtocolCategory.Vault && proto.interface === "erc4626") {
      try {
        const vault = createVault2(proto, rpc);
        const info = await vault.getVaultInfo();
        opportunities.push({
          protocol: info.protocol,
          type: "vault",
          asset,
          apy: info.apy ?? 0,
          total_assets: info.total_assets.toString()
        });
      } catch {
      }
    }
  }
  opportunities.sort((a, b) => {
    const aa = a["apy"] ?? 0;
    const ba = b["apy"] ?? 0;
    return ba - aa;
  });
  return opportunities;
}
async function runYieldScan(registry, asset, output) {
  const t0 = Date.now();
  const chainKeys = Array.from(registry.chains.keys());
  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const chainName = chain.name.toLowerCase();
      let assetAddr;
      try {
        assetAddr = registry.resolveToken(chainName, asset).address;
      } catch {
        return [];
      }
      const protos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");
      if (protos.length === 0) return [];
      const rpc = chain.effectiveRpcUrl();
      const rates = [];
      for (const proto of protos) {
        try {
          const lending = createLending2(proto, rpc);
          const r = await lending.getRates(assetAddr);
          if (r.supply_apy > 0) {
            rates.push({
              chain: chain.name,
              protocol: r.protocol,
              supply_apy: r.supply_apy,
              borrow_variable_apy: r.borrow_variable_apy
            });
          }
        } catch {
        }
      }
      return rates;
    } catch {
      return [];
    }
  });
  const nested = await Promise.all(tasks);
  const allRates = nested.flat();
  allRates.sort((a, b) => (b["supply_apy"] ?? 0) - (a["supply_apy"] ?? 0));
  const best = allRates.length > 0 ? `${allRates[0]["protocol"]} on ${allRates[0]["chain"]}` : null;
  const arbs = [];
  for (const s of allRates) {
    for (const b of allRates) {
      const sp = s["supply_apy"] ?? 0;
      const bp = b["borrow_variable_apy"] ?? 0;
      if (sp > bp && bp > 0) {
        const sc = s["chain"];
        const bc = b["chain"];
        const sp2 = s["protocol"];
        const bp2 = b["protocol"];
        if (sc !== bc || sp2 !== bp2) {
          arbs.push({
            spread_pct: Math.round((sp - bp) * 100) / 100,
            supply_chain: sc,
            supply_protocol: sp2,
            supply_apy: sp,
            borrow_chain: bc,
            borrow_protocol: bp2,
            borrow_apy: bp,
            strategy: sc === bc ? "same-chain" : "cross-chain"
          });
        }
      }
    }
  }
  arbs.sort((a, b) => {
    const as_ = a["spread_pct"] ?? 0;
    const bs_ = b["spread_pct"] ?? 0;
    return bs_ - as_;
  });
  arbs.splice(10);
  printOutput(
    {
      asset,
      scan_duration_ms: Date.now() - t0,
      chains_scanned: chainKeys.length,
      rates: allRates,
      best_supply: best,
      arb_opportunities: arbs
    },
    output
  );
}
async function scanRatesForExecute(registry, asset) {
  const chainKeys = Array.from(registry.chains.keys());
  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const chainName = chain.name.toLowerCase();
      let assetAddr;
      try {
        assetAddr = registry.resolveToken(chainName, asset).address;
      } catch {
        return [];
      }
      const protos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");
      if (protos.length === 0) return [];
      const rpc = chain.effectiveRpcUrl();
      const rates = [];
      for (const proto of protos) {
        try {
          const lending = createLending2(proto, rpc);
          const r = await lending.getRates(assetAddr);
          if (r.supply_apy > 0) {
            rates.push({
              chain: chain.name,
              protocol: r.protocol,
              slug: proto.slug,
              supply_apy: r.supply_apy,
              borrow_variable_apy: r.borrow_variable_apy
            });
          }
        } catch {
        }
      }
      return rates;
    } catch {
      return [];
    }
  });
  const nested = await Promise.all(tasks);
  const all = nested.flat();
  all.sort((a, b) => b.supply_apy - a.supply_apy);
  return all;
}
function registerYield(parent, getOpts, makeExecutor2) {
  const yieldCmd = parent.command("yield").description("Yield operations: compare, scan, optimize, execute");
  yieldCmd.command("compare").description("Compare lending rates across protocols for an asset").requiredOption("--asset <token>", "Token symbol or address").action(async (opts) => {
    try {
      const registry = Registry8.loadEmbedded();
      const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
      const chain = registry.getChain(chainName);
      const rpc = chain.effectiveRpcUrl();
      const assetAddr = resolveAsset(registry, chainName, opts.asset);
      const results = await collectLendingRates(registry, chainName, rpc, assetAddr);
      if (results.length === 0) {
        printOutput(
          { error: `No lending rate data available for asset '${opts.asset}'` },
          getOpts()
        );
        process.exit(1);
        return;
      }
      results.sort((a, b) => b.supply_apy - a.supply_apy);
      const bestSupply = results[0]?.protocol ?? null;
      const bestBorrow = results.reduce((best, r) => {
        if (!best || r.borrow_variable_apy < best.borrow_variable_apy) return r;
        return best;
      }, null)?.protocol ?? null;
      printOutput(
        {
          asset: opts.asset,
          rates: results,
          best_supply: bestSupply,
          best_borrow: bestBorrow
        },
        getOpts()
      );
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
  yieldCmd.command("scan").description("Scan all chains for best yield opportunities (parallel)").requiredOption("--asset <token>", "Token symbol (e.g. USDC, WETH)").action(async (opts) => {
    try {
      const registry = Registry8.loadEmbedded();
      await runYieldScan(registry, opts.asset, getOpts());
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
  yieldCmd.command("execute").description("Find the best yield opportunity and execute supply (or show cross-chain plan)").requiredOption("--asset <token>", "Token symbol or address (e.g. USDC)").requiredOption("--amount <amount>", "Human-readable amount to supply (e.g. 1000)").option("--min-spread <percent>", "Minimum spread % required to execute cross-chain arb", "1.0").option("--target-chain <chain>", "Override auto-detected best chain").option("--target-protocol <protocol>", "Override auto-detected best protocol slug").action(async (opts) => {
    try {
      const registry = Registry8.loadEmbedded();
      const asset = opts.asset;
      const humanAmount = parseFloat(opts.amount);
      if (isNaN(humanAmount) || humanAmount <= 0) {
        printOutput({ error: `Invalid amount: ${opts.amount}` }, getOpts());
        process.exit(1);
        return;
      }
      const minSpread = parseFloat(opts.minSpread ?? "1.0");
      let targetChainName;
      let targetProtocolSlug = opts.targetProtocol;
      if (opts.targetChain) {
        targetChainName = opts.targetChain.toLowerCase();
      } else {
        process.stderr.write(`Scanning all chains for best ${asset} yield...
`);
        const t0 = Date.now();
        const allRates = await scanRatesForExecute(registry, asset);
        process.stderr.write(`Scan done in ${Date.now() - t0}ms \u2014 ${allRates.length} rates found
`);
        if (allRates.length === 0) {
          printOutput({ error: `No yield opportunities found for ${asset}` }, getOpts());
          process.exit(1);
          return;
        }
        let bestArb = null;
        for (const s of allRates) {
          for (const b of allRates) {
            const spread = s.supply_apy - b.borrow_variable_apy;
            if (spread > 0 && b.borrow_variable_apy > 0 && (s.chain !== b.chain || s.slug !== b.slug)) {
              if (!bestArb || spread > bestArb.spread_pct) {
                bestArb = {
                  spread_pct: Math.round(spread * 1e4) / 1e4,
                  supply_chain: s.chain,
                  supply_protocol: s.protocol,
                  supply_slug: s.slug,
                  supply_apy: s.supply_apy,
                  borrow_chain: b.chain,
                  borrow_protocol: b.protocol,
                  borrow_apy: b.borrow_variable_apy,
                  strategy: s.chain === b.chain ? "same-chain" : "cross-chain"
                };
              }
            }
          }
        }
        if (bestArb && bestArb.strategy === "cross-chain" && bestArb.spread_pct >= minSpread) {
          const supplyChainLower = bestArb.supply_chain.toLowerCase();
          let supplyAssetAddr;
          let supplyDecimals = 18;
          try {
            const tok = registry.resolveToken(supplyChainLower, asset);
            supplyAssetAddr = tok.address;
            supplyDecimals = tok.decimals;
          } catch {
          }
          const amountWei2 = BigInt(Math.round(humanAmount * 10 ** supplyDecimals));
          printOutput(
            {
              mode: "plan_only",
              reason: "cross-chain arb requires manual bridge execution",
              asset,
              amount_human: humanAmount,
              amount_wei: amountWei2.toString(),
              best_arb: bestArb,
              steps: [
                {
                  step: 1,
                  action: "bridge",
                  description: `Bridge ${humanAmount} ${asset} from current chain to ${bestArb.supply_chain}`,
                  from_chain: "current",
                  to_chain: bestArb.supply_chain,
                  token: asset,
                  amount_wei: amountWei2.toString()
                },
                {
                  step: 2,
                  action: "supply",
                  description: `Supply ${humanAmount} ${asset} on ${bestArb.supply_protocol}`,
                  chain: bestArb.supply_chain,
                  protocol: bestArb.supply_protocol,
                  protocol_slug: bestArb.supply_slug,
                  asset_address: supplyAssetAddr,
                  amount_wei: amountWei2.toString(),
                  expected_apy: bestArb.supply_apy
                }
              ],
              expected_spread_pct: bestArb.spread_pct,
              supply_apy: bestArb.supply_apy,
              borrow_apy: bestArb.borrow_apy
            },
            getOpts()
          );
          return;
        }
        targetChainName = allRates[0].chain.toLowerCase();
        if (!targetProtocolSlug) {
          targetProtocolSlug = allRates[0].slug;
        }
      }
      const chain = registry.getChain(targetChainName);
      const chainName = chain.name.toLowerCase();
      const rpc = chain.effectiveRpcUrl();
      let assetAddr;
      let decimals = 18;
      try {
        const tok = registry.resolveToken(chainName, asset);
        assetAddr = tok.address;
        decimals = tok.decimals;
      } catch {
        if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
          assetAddr = asset;
        } else {
          printOutput({ error: `Cannot resolve ${asset} on chain ${chainName}` }, getOpts());
          process.exit(1);
          return;
        }
      }
      const amountWei = BigInt(Math.round(humanAmount * 10 ** decimals));
      let proto;
      if (targetProtocolSlug) {
        try {
          proto = registry.getProtocol(targetProtocolSlug);
        } catch {
          printOutput({ error: `Protocol not found: ${targetProtocolSlug}` }, getOpts());
          process.exit(1);
          return;
        }
      } else {
        const candidates = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");
        if (candidates.length === 0) {
          printOutput({ error: `No aave_v3 lending protocol found on ${chainName}` }, getOpts());
          process.exit(1);
          return;
        }
        let bestRate = null;
        let bestProto = candidates[0];
        for (const c of candidates) {
          try {
            const lending = createLending2(c, rpc);
            const r = await lending.getRates(assetAddr);
            if (!bestRate || r.supply_apy > bestRate.supply_apy) {
              bestRate = r;
              bestProto = c;
            }
          } catch {
          }
        }
        proto = bestProto;
      }
      const onBehalfOf = process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const adapter = createLending2(proto, rpc);
      let currentApy;
      try {
        const r = await adapter.getRates(assetAddr);
        currentApy = r.supply_apy;
      } catch {
      }
      process.stderr.write(
        `Supplying ${humanAmount} ${asset} (${amountWei} wei) on ${proto.name} (${chain.name})...
`
      );
      const executor = makeExecutor2();
      const tx = await adapter.buildSupply({
        protocol: proto.name,
        asset: assetAddr,
        amount: amountWei,
        on_behalf_of: onBehalfOf
      });
      const result = await executor.execute(tx);
      printOutput(
        {
          action: "yield_execute",
          asset,
          amount_human: humanAmount,
          amount_wei: amountWei.toString(),
          chain: chain.name,
          protocol: proto.name,
          protocol_slug: proto.slug,
          supply_apy: currentApy,
          result
        },
        getOpts()
      );
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
  yieldCmd.command("optimize").description("Find the optimal yield strategy for an asset").requiredOption("--asset <token>", "Token symbol or address").option("--strategy <strategy>", "Strategy: best-supply, leverage-loop, auto", "auto").option("--amount <amount>", "Amount to deploy (for allocation breakdown)").action(async (opts) => {
    try {
      const registry = Registry8.loadEmbedded();
      const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
      const chain = registry.getChain(chainName);
      const rpc = chain.effectiveRpcUrl();
      const asset = opts.asset;
      const assetAddr = resolveAsset(registry, chainName, asset);
      const strategy = opts.strategy ?? "auto";
      if (strategy === "auto") {
        const opportunities = await collectAllYields(registry, chainName, rpc, asset, assetAddr);
        if (opportunities.length === 0) {
          printOutput({ error: `No yield opportunities found for '${asset}'` }, getOpts());
          process.exit(1);
          return;
        }
        const amount = opts.amount ? parseFloat(opts.amount) : null;
        const weights = [0.6, 0.3, 0.1];
        const allocations = amount !== null ? opportunities.slice(0, weights.length).map((opp, i) => ({
          protocol: opp["protocol"],
          type: opp["type"],
          apy: opp["apy"],
          allocation_pct: weights[i] * 100,
          amount: (amount * weights[i]).toFixed(2)
        })) : [];
        const best = opportunities[0];
        const weightedApy = allocations.length > 0 ? opportunities.slice(0, weights.length).reduce((sum, o, i) => {
          return sum + (o["apy"] ?? 0) * weights[i];
        }, 0) : best["apy"] ?? 0;
        printOutput(
          {
            strategy: "auto",
            asset,
            best_protocol: best["protocol"],
            best_apy: best["apy"],
            weighted_apy: weightedApy,
            opportunities,
            allocation: allocations
          },
          getOpts()
        );
      } else if (strategy === "best-supply") {
        const results = await collectLendingRates(registry, chainName, rpc, assetAddr);
        if (results.length === 0) {
          printOutput({ error: `No lending rate data available for asset '${asset}'` }, getOpts());
          process.exit(1);
          return;
        }
        results.sort((a, b) => b.supply_apy - a.supply_apy);
        const best = results[0];
        const recommendations = results.map((r) => ({
          protocol: r.protocol,
          supply_apy: r.supply_apy,
          action: "supply"
        }));
        printOutput(
          {
            strategy: "best-supply",
            asset,
            recommendation: `Supply ${asset} on ${best.protocol} for ${(best.supply_apy * 100).toFixed(2)}% APY`,
            best_protocol: best.protocol,
            best_supply_apy: best.supply_apy,
            all_options: recommendations
          },
          getOpts()
        );
      } else if (strategy === "leverage-loop") {
        const results = await collectLendingRates(registry, chainName, rpc, assetAddr);
        if (results.length === 0) {
          printOutput({ error: `No lending rate data available for asset '${asset}'` }, getOpts());
          process.exit(1);
          return;
        }
        const ltv = 0.8;
        const loops = 5;
        const candidates = [];
        for (const r of results) {
          const threshold = r.borrow_variable_apy * 0.8;
          if (r.supply_apy > threshold && r.borrow_variable_apy > 0) {
            let effectiveSupplyApy = 0;
            let effectiveBorrowApy = 0;
            let leverage = 1;
            for (let l = 0; l < loops; l++) {
              effectiveSupplyApy += r.supply_apy * leverage;
              effectiveBorrowApy += r.borrow_variable_apy * leverage * ltv;
              leverage *= ltv;
            }
            candidates.push({
              protocol: r.protocol,
              supply_apy: r.supply_apy,
              borrow_variable_apy: r.borrow_variable_apy,
              loops,
              ltv,
              effective_supply_apy: effectiveSupplyApy,
              effective_borrow_cost: effectiveBorrowApy,
              net_apy: effectiveSupplyApy - effectiveBorrowApy
            });
          }
        }
        candidates.sort((a, b) => {
          const an = a["net_apy"] ?? 0;
          const bn = b["net_apy"] ?? 0;
          return bn - an;
        });
        const recommendation = candidates.length > 0 ? (() => {
          const b = candidates[0];
          return `Leverage loop ${asset} on ${b["protocol"]} \u2014 net APY: ${(b["net_apy"] * 100).toFixed(2)}% (${loops} loops at ${ltv * 100}% LTV)`;
        })() : `No favorable leverage loop found for ${asset} \u2014 supply rate too low relative to borrow rate`;
        printOutput(
          {
            strategy: "leverage-loop",
            asset,
            recommendation,
            candidates
          },
          getOpts()
        );
      } else {
        printOutput(
          { error: `Unknown strategy '${strategy}'. Supported: best-supply, leverage-loop, auto` },
          getOpts()
        );
        process.exit(1);
      }
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
}

// src/commands/portfolio.ts
import { encodeFunctionData as encodeFunctionData2, parseAbi as parseAbi2 } from "viem";
import { Registry as Registry10, ProtocolCategory as ProtocolCategory3, multicallRead as multicallRead2 } from "@hypurrquant/defi-core";

// src/portfolio-tracker.ts
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { encodeFunctionData, parseAbi } from "viem";
import { ProtocolCategory as ProtocolCategory2, multicallRead } from "@hypurrquant/defi-core";
var ERC20_ABI = parseAbi([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var ORACLE_ABI = parseAbi([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var POOL_ABI = parseAbi([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
function decodeU256Word(data, wordOffset = 0) {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}
function snapshotDir() {
  return resolve(homedir(), ".defi-cli", "snapshots");
}
async function takeSnapshot(chainName, wallet, registry) {
  const chain = registry.getChain(chainName);
  const user = wallet;
  const rpc = chain.effectiveRpcUrl();
  const calls = [];
  const callLabels = [];
  const tokenEntries = [];
  for (const t of registry.tokens.get(chainName) ?? []) {
    let entry;
    try {
      entry = registry.resolveToken(chainName, t.symbol);
    } catch {
      continue;
    }
    if (entry.address === "0x0000000000000000000000000000000000000000") continue;
    tokenEntries.push({ symbol: t.symbol, address: entry.address, decimals: entry.decimals });
    calls.push([
      entry.address,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [user] })
    ]);
    callLabels.push(`balance:${t.symbol}`);
  }
  const lendingProtocols = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Lending && p.interface === "aave_v3").filter((p) => p.contracts?.["pool"]);
  for (const p of lendingProtocols) {
    calls.push([
      p.contracts["pool"],
      encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [user] })
    ]);
    callLabels.push(`lending:${p.name}`);
  }
  const oracleEntry = registry.getProtocolsForChain(chainName).find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
  const oracleAddr = oracleEntry?.contracts?.["oracle"];
  const wrappedNative = chain.wrapped_native ?? "0x5555555555555555555555555555555555555555";
  if (oracleAddr) {
    calls.push([
      oracleAddr,
      encodeFunctionData({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [wrappedNative] })
    ]);
    callLabels.push("price:native");
  }
  let results = calls.map(() => null);
  if (calls.length > 0) {
    results = await multicallRead(rpc, calls);
  }
  let nativePriceUsd = 0;
  if (oracleAddr) {
    const priceData = results[results.length - 1] ?? null;
    nativePriceUsd = Number(decodeU256Word(priceData)) / 1e8;
  }
  let idx = 0;
  const tokens = [];
  let totalValueUsd = 0;
  for (const entry of tokenEntries) {
    if (idx >= results.length) break;
    const balance = decodeU256Word(results[idx] ?? null);
    const balF64 = Number(balance) / 10 ** entry.decimals;
    const symbolUpper = entry.symbol.toUpperCase();
    const priceUsd = symbolUpper.includes("USD") ? 1 : nativePriceUsd;
    const valueUsd = balF64 * priceUsd;
    totalValueUsd += valueUsd;
    tokens.push({
      token: entry.address,
      symbol: entry.symbol,
      balance,
      value_usd: valueUsd,
      price_usd: priceUsd
    });
    idx++;
  }
  const defiPositions = [];
  for (const p of lendingProtocols) {
    if (idx >= results.length) break;
    const data = results[idx] ?? null;
    if (data && data.length >= 2 + 192 * 2) {
      const collateral = Number(decodeU256Word(data, 0)) / 1e8;
      const debt = Number(decodeU256Word(data, 1)) / 1e8;
      if (collateral > 0) {
        totalValueUsd += collateral;
        defiPositions.push({
          protocol: p.name,
          type: "lending_supply",
          asset: "collateral",
          amount: BigInt(Math.round(collateral * 1e8)),
          value_usd: collateral
        });
      }
      if (debt > 0) {
        totalValueUsd -= debt;
        defiPositions.push({
          protocol: p.name,
          type: "lending_borrow",
          asset: "debt",
          amount: BigInt(Math.round(debt * 1e8)),
          value_usd: debt
        });
      }
    }
    idx++;
  }
  return {
    timestamp: Date.now(),
    chain: chainName,
    wallet,
    tokens,
    defi_positions: defiPositions,
    total_value_usd: totalValueUsd
  };
}
function saveSnapshot(snapshot) {
  const dir = snapshotDir();
  mkdirSync(dir, { recursive: true });
  const filename = `${snapshot.chain}_${snapshot.wallet}_${snapshot.timestamp}.json`;
  const filepath = resolve(dir, filename);
  writeFileSync(filepath, JSON.stringify(snapshot, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  return filepath;
}
function loadSnapshots(chain, wallet, limit = 10) {
  const dir = snapshotDir();
  if (!existsSync(dir)) return [];
  const prefix = `${chain}_${wallet}_`;
  const files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort().reverse().slice(0, limit);
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
    if (Array.isArray(raw.tokens)) {
      for (const t of raw.tokens) {
        if (typeof t.balance === "string") t.balance = BigInt(t.balance);
      }
    }
    if (Array.isArray(raw.defi_positions)) {
      for (const p of raw.defi_positions) {
        if (typeof p.amount === "string") p.amount = BigInt(p.amount);
      }
    }
    return raw;
  });
}
function calculatePnL(current, previous) {
  const startValue = previous.total_value_usd;
  const endValue = current.total_value_usd;
  const pnlUsd = endValue - startValue;
  const pnlPct = startValue !== 0 ? pnlUsd / startValue * 100 : 0;
  const prevTokenMap = /* @__PURE__ */ new Map();
  for (const t of previous.tokens) {
    prevTokenMap.set(t.symbol, t);
  }
  const tokenChanges = [];
  for (const t of current.tokens) {
    const prev = prevTokenMap.get(t.symbol);
    const prevBalance = prev?.balance ?? 0n;
    const prevValueUsd = prev?.value_usd ?? 0;
    const balanceChange = t.balance - prevBalance;
    const valueChangeUsd = t.value_usd - prevValueUsd;
    if (balanceChange !== 0n || Math.abs(valueChangeUsd) > 1e-3) {
      tokenChanges.push({
        symbol: t.symbol,
        balance_change: balanceChange,
        value_change_usd: valueChangeUsd
      });
    }
  }
  const durationMs = current.timestamp - previous.timestamp;
  const durationHours = durationMs / (1e3 * 60 * 60);
  const period = durationHours < 1 ? `${Math.round(durationMs / 6e4)}m` : durationHours < 24 ? `${durationHours.toFixed(1)}h` : `${(durationHours / 24).toFixed(1)}d`;
  return {
    period,
    start_value_usd: startValue,
    end_value_usd: endValue,
    pnl_usd: pnlUsd,
    pnl_pct: pnlPct,
    token_changes: tokenChanges
  };
}

// src/commands/portfolio.ts
var ERC20_ABI2 = parseAbi2([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var POOL_ABI2 = parseAbi2([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
var ORACLE_ABI2 = parseAbi2([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
function decodeU256(data, wordOffset = 0) {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}
function registerPortfolio(parent, getOpts) {
  const portfolio = parent.command("portfolio").description("Aggregate positions across all protocols");
  portfolio.command("show").description("Show current portfolio positions").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const mode = getOpts();
    const registry = Registry10.loadEmbedded();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    let chain;
    try {
      chain = registry.getChain(chainName);
    } catch (e) {
      printOutput({ error: `Chain not found: ${chainName}` }, mode);
      return;
    }
    const user = opts.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
      printOutput({ error: `Invalid address: ${opts.address}` }, mode);
      return;
    }
    const rpc = chain.effectiveRpcUrl();
    const calls = [];
    const callLabels = [];
    const tokenSymbols = (registry.tokens.get(chainName) ?? []).map((t) => t.symbol);
    for (const symbol of tokenSymbols) {
      let entry;
      try {
        entry = registry.resolveToken(chainName, symbol);
      } catch {
        continue;
      }
      if (entry.address === "0x0000000000000000000000000000000000000000") continue;
      calls.push([
        entry.address,
        encodeFunctionData2({ abi: ERC20_ABI2, functionName: "balanceOf", args: [user] })
      ]);
      callLabels.push(`balance:${symbol}`);
    }
    const lendingProtocols = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory3.Lending && p.interface === "aave_v3").filter((p) => p.contracts?.["pool"]);
    for (const p of lendingProtocols) {
      calls.push([
        p.contracts["pool"],
        encodeFunctionData2({ abi: POOL_ABI2, functionName: "getUserAccountData", args: [user] })
      ]);
      callLabels.push(`lending:${p.name}`);
    }
    const oracleEntry = registry.getProtocolsForChain(chainName).find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
    const oracleAddr = oracleEntry?.contracts?.["oracle"];
    const wrappedNative = chain.wrapped_native ?? "0x5555555555555555555555555555555555555555";
    if (oracleAddr) {
      calls.push([
        oracleAddr,
        encodeFunctionData2({ abi: ORACLE_ABI2, functionName: "getAssetPrice", args: [wrappedNative] })
      ]);
      callLabels.push("price:native");
    }
    if (calls.length === 0) {
      printOutput(
        {
          address: user,
          chain: chain.name,
          error: "No protocols or tokens configured for this chain"
        },
        mode
      );
      return;
    }
    let results;
    try {
      results = await multicallRead2(rpc, calls);
    } catch (e) {
      printOutput({ error: `Multicall failed: ${e instanceof Error ? e.message : String(e)}` }, mode);
      return;
    }
    let nativePriceUsd = 0;
    if (oracleAddr) {
      const priceData = results[results.length - 1] ?? null;
      nativePriceUsd = Number(decodeU256(priceData)) / 1e8;
    }
    let totalValueUsd = 0;
    let idx = 0;
    const tokenBalances = [];
    for (const symbol of tokenSymbols) {
      let entry;
      try {
        entry = registry.resolveToken(chainName, symbol);
      } catch {
        continue;
      }
      if (entry.address === "0x0000000000000000000000000000000000000000") continue;
      if (idx >= results.length) break;
      const balance = decodeU256(results[idx] ?? null);
      if (balance > 0n) {
        const decimals = entry.decimals;
        const balF64 = Number(balance) / 10 ** decimals;
        const symbolUpper = symbol.toUpperCase();
        const valueUsd = symbolUpper.includes("USD") || symbolUpper.includes("usd") ? balF64 : balF64 * nativePriceUsd;
        totalValueUsd += valueUsd;
        tokenBalances.push({
          symbol,
          balance: balF64.toFixed(4),
          value_usd: valueUsd.toFixed(2)
        });
      }
      idx++;
    }
    const lendingPositions = [];
    for (const p of lendingProtocols) {
      if (idx >= results.length) break;
      const data = results[idx] ?? null;
      if (data && data.length >= 2 + 192 * 2) {
        const collateral = Number(decodeU256(data, 0)) / 1e8;
        const debt = Number(decodeU256(data, 1)) / 1e8;
        const hfRaw = decodeU256(data, 5);
        let hf = null;
        if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
          const v = Number(hfRaw) / 1e18;
          hf = v > 1e10 ? null : v;
        }
        if (collateral > 0 || debt > 0) {
          totalValueUsd += collateral - debt;
          lendingPositions.push({
            protocol: p.name,
            collateral_usd: collateral.toFixed(2),
            debt_usd: debt.toFixed(2),
            health_factor: hf
          });
        }
      }
      idx++;
    }
    printOutput(
      {
        address: user,
        chain: chain.name,
        native_price_usd: nativePriceUsd.toFixed(2),
        total_value_usd: totalValueUsd.toFixed(2),
        token_balances: tokenBalances,
        lending_positions: lendingPositions
      },
      mode
    );
  });
  portfolio.command("snapshot").description("Take a new portfolio snapshot and save it locally").requiredOption("--address <address>", "Wallet address to snapshot").action(async (opts) => {
    const mode = getOpts();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    const registry = Registry10.loadEmbedded();
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
      printOutput({ error: `Invalid address: ${opts.address}` }, mode);
      return;
    }
    try {
      const snapshot = await takeSnapshot(chainName, opts.address, registry);
      const filepath = saveSnapshot(snapshot);
      printOutput(
        {
          saved: filepath,
          timestamp: new Date(snapshot.timestamp).toISOString(),
          chain: snapshot.chain,
          wallet: snapshot.wallet,
          total_value_usd: snapshot.total_value_usd.toFixed(2),
          token_count: snapshot.tokens.length,
          defi_position_count: snapshot.defi_positions.length
        },
        mode
      );
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, mode);
    }
  });
  portfolio.command("pnl").description("Show PnL since the last snapshot").requiredOption("--address <address>", "Wallet address").option("--since <hours>", "Compare against snapshot from N hours ago (default: last snapshot)").action(async (opts) => {
    const mode = getOpts();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    const registry = Registry10.loadEmbedded();
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
      printOutput({ error: `Invalid address: ${opts.address}` }, mode);
      return;
    }
    const snapshots = loadSnapshots(chainName, opts.address, 50);
    if (snapshots.length === 0) {
      printOutput({ error: "No snapshots found. Run `portfolio snapshot` first." }, mode);
      return;
    }
    let previous = snapshots[0];
    if (opts.since) {
      const sinceMs = parseFloat(opts.since) * 60 * 60 * 1e3;
      const cutoff = Date.now() - sinceMs;
      const match = snapshots.find((s) => s.timestamp <= cutoff);
      if (!match) {
        printOutput({ error: `No snapshot found older than ${opts.since} hours` }, mode);
        return;
      }
      previous = match;
    }
    try {
      const current = await takeSnapshot(chainName, opts.address, registry);
      const pnl = calculatePnL(current, previous);
      printOutput(
        {
          chain: chainName,
          wallet: opts.address,
          previous_snapshot: new Date(previous.timestamp).toISOString(),
          current_time: new Date(current.timestamp).toISOString(),
          ...pnl,
          pnl_usd: pnl.pnl_usd.toFixed(2),
          pnl_pct: pnl.pnl_pct.toFixed(4),
          start_value_usd: pnl.start_value_usd.toFixed(2),
          end_value_usd: pnl.end_value_usd.toFixed(2)
        },
        mode
      );
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, mode);
    }
  });
  portfolio.command("history").description("List saved portfolio snapshots with values").requiredOption("--address <address>", "Wallet address").option("--limit <n>", "Number of snapshots to show", "10").action(async (opts) => {
    const mode = getOpts();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.address)) {
      printOutput({ error: `Invalid address: ${opts.address}` }, mode);
      return;
    }
    const limit = parseInt(opts.limit, 10);
    const snapshots = loadSnapshots(chainName, opts.address, limit);
    if (snapshots.length === 0) {
      printOutput({ message: "No snapshots found for this address on this chain." }, mode);
      return;
    }
    const history = snapshots.map((s) => ({
      timestamp: new Date(s.timestamp).toISOString(),
      chain: s.chain,
      wallet: s.wallet,
      total_value_usd: s.total_value_usd.toFixed(2),
      token_count: s.tokens.length,
      defi_position_count: s.defi_positions.length
    }));
    printOutput({ snapshots: history }, mode);
  });
}

// src/commands/monitor.ts
import { Registry as Registry11, ProtocolCategory as ProtocolCategory4 } from "@hypurrquant/defi-core";
import { createLending as createLending3 } from "@hypurrquant/defi-protocols";
async function checkChainLendingPositions(chainKey, registry, address, threshold) {
  let chain;
  try {
    chain = registry.getChain(chainKey);
  } catch {
    return [];
  }
  const rpc = chain.effectiveRpcUrl();
  const chainName = chain.name;
  const protocols = registry.getProtocolsForChain(chainKey).filter(
    (p) => p.category === ProtocolCategory4.Lending
  );
  const results = await Promise.all(
    protocols.map(async (proto) => {
      try {
        const adapter = createLending3(proto, rpc);
        const position = await adapter.getUserPosition(address);
        const hf = position.health_factor ?? Infinity;
        const totalBorrow = position.borrows?.reduce(
          (sum, b) => sum + (b.value_usd ?? 0),
          0
        ) ?? 0;
        if (totalBorrow === 0) return null;
        const totalSupply = position.supplies?.reduce(
          (sum, s) => sum + (s.value_usd ?? 0),
          0
        ) ?? 0;
        return {
          chain: chainName,
          protocol: proto.name,
          health_factor: hf === Infinity ? 999999 : Math.round(hf * 100) / 100,
          total_supply_usd: Math.round(totalSupply * 100) / 100,
          total_borrow_usd: Math.round(totalBorrow * 100) / 100,
          alert: hf < threshold
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r) => r !== null);
}
function registerMonitor(parent, getOpts) {
  parent.command("monitor").description("Monitor health factor with alerts").option("--protocol <protocol>", "Protocol slug (required unless --all-chains)").requiredOption("--address <address>", "Wallet address to monitor").option("--threshold <hf>", "Health factor alert threshold", "1.5").option("--interval <secs>", "Polling interval in seconds", "60").option("--once", "Run once instead of continuously").option("--all-chains", "Scan all chains for lending positions").action(async (opts) => {
    const threshold = parseFloat(opts.threshold);
    const address = opts.address;
    if (opts.allChains) {
      const registry = Registry11.loadEmbedded();
      const chainKeys = Array.from(registry.chains.keys());
      const poll = async () => {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        const chainResults = await Promise.all(
          chainKeys.map(
            (ck) => checkChainLendingPositions(ck, registry, address, threshold)
          )
        );
        const positions = chainResults.flat();
        const alertsCount = positions.filter((p) => p.alert).length;
        const output = {
          timestamp,
          address,
          threshold,
          positions,
          alerts_count: alertsCount
        };
        for (const pos of positions) {
          if (pos.alert) {
            process.stderr.write(
              `ALERT: ${pos.chain}/${pos.protocol} HF=${pos.health_factor} < ${threshold}
`
            );
          }
        }
        printOutput(output, getOpts());
      };
      await poll();
      if (!opts.once) {
        const intervalMs = parseInt(opts.interval) * 1e3;
        const timer = setInterval(poll, intervalMs);
        process.on("SIGINT", () => {
          clearInterval(timer);
          process.exit(0);
        });
      }
    } else {
      if (!opts.protocol) {
        printOutput({ error: "Either --protocol or --all-chains is required" }, getOpts());
        process.exit(1);
      }
      const chainName = parent.opts().chain ?? "hyperevm";
      const registry = Registry11.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending3(protocol, chain.effectiveRpcUrl());
      const poll = async () => {
        try {
          const position = await adapter.getUserPosition(address);
          const hf = position.health_factor ?? Infinity;
          const alert = hf < threshold;
          printOutput({
            protocol: protocol.name,
            user: opts.address,
            health_factor: hf,
            threshold,
            alert,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            supplies: position.supplies,
            borrows: position.borrows
          }, getOpts());
        } catch (e) {
          printOutput({
            error: e instanceof Error ? e.message : String(e),
            protocol: protocol.name,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }, getOpts());
        }
      };
      await poll();
      if (!opts.once) {
        const intervalMs = parseInt(opts.interval) * 1e3;
        const timer = setInterval(poll, intervalMs);
        process.on("SIGINT", () => {
          clearInterval(timer);
          process.exit(0);
        });
      }
    }
  });
}

// src/commands/alert.ts
import { Registry as Registry12 } from "@hypurrquant/defi-core";
import { createDex as createDex2 } from "@hypurrquant/defi-protocols";
function registerAlert(parent, getOpts) {
  parent.command("alert").description("Alert on DEX vs Oracle price deviation").option("--threshold <pct>", "Deviation threshold in percent", "5.0").option("--once", "Run once instead of continuously").option("--interval <secs>", "Polling interval in seconds", "60").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry12.loadEmbedded();
    const chain = registry.getChain(chainName);
    const rpcUrl = chain.effectiveRpcUrl();
    const threshold = parseFloat(opts.threshold);
    const dexProtocols = registry.getProtocolsByCategory("dex").filter((p) => p.chain === chainName);
    const lendingProtocols = registry.getProtocolsByCategory("lending").filter((p) => p.chain === chainName);
    const poll = async () => {
      const alerts = [];
      for (const p of dexProtocols) {
        try {
          const dex = createDex2(p, rpcUrl);
          alerts.push({
            protocol: p.name,
            type: "info",
            message: `DEX ${dex.name()} active on ${chainName}`
          });
        } catch {
        }
      }
      printOutput({
        chain: chainName,
        threshold_pct: threshold,
        alerts,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }, getOpts());
    };
    await poll();
    if (!opts.once) {
      const intervalMs = parseInt(opts.interval) * 1e3;
      const timer = setInterval(poll, intervalMs);
      process.on("SIGINT", () => {
        clearInterval(timer);
        process.exit(0);
      });
    }
  });
}

// src/commands/scan.ts
import { encodeFunctionData as encodeFunctionData3, parseAbi as parseAbi3 } from "viem";
import { Registry as Registry13, ProtocolCategory as ProtocolCategory5, multicallRead as multicallRead3 } from "@hypurrquant/defi-core";
var AAVE_ORACLE_ABI = parseAbi3([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var UNIV2_ROUTER_ABI = parseAbi3([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)"
]);
var VTOKEN_ABI = parseAbi3([
  "function exchangeRateStored() external view returns (uint256)"
]);
var STABLECOINS = /* @__PURE__ */ new Set(["USDC", "USDT", "DAI", "USDT0"]);
function round2(x) {
  return Math.round(x * 100) / 100;
}
function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}
function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}
function parseU256F64(data, decimals) {
  if (!data || data.length < 66) return 0;
  const raw = BigInt(data.slice(0, 66));
  return Number(raw) / 10 ** decimals;
}
function parseAmountsOutLast(data, outDecimals) {
  if (!data) return 0;
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 128) return 0;
  const num = parseInt(hex.slice(64, 128), 16);
  if (num === 0) return 0;
  const byteOff = 64 + (num - 1) * 32;
  const hexOff = byteOff * 2;
  if (hex.length < hexOff + 64) return 0;
  const val = BigInt("0x" + hex.slice(hexOff, hexOff + 64));
  return Number(val) / 10 ** outDecimals;
}
function registerScan(parent, getOpts) {
  parent.command("scan").description("Multi-pattern exploit detection scanner").option("--chain <chain>", "Chain to scan", "hyperevm").option("--patterns <patterns>", "Comma-separated patterns: oracle,stable,exchange_rate", "oracle,stable,exchange_rate").option("--oracle-threshold <pct>", "Oracle divergence threshold (percent)", "5.0").option("--stable-threshold <price>", "Stablecoin depeg threshold (min price)", "0.98").option("--rate-threshold <pct>", "Exchange rate change threshold (percent)", "5.0").option("--interval <secs>", "Polling interval in seconds", "30").option("--once", "Single check then exit").option("--all-chains", "Scan all chains in parallel").action(async (opts) => {
    try {
      const registry = Registry13.loadEmbedded();
      const oracleThreshold = parseFloat(opts.oracleThreshold ?? "5.0");
      const stableThreshold = parseFloat(opts.stableThreshold ?? "0.98");
      const rateThreshold = parseFloat(opts.rateThreshold ?? "5.0");
      const interval = parseInt(opts.interval ?? "30", 10);
      const patterns = opts.patterns ?? "oracle,stable,exchange_rate";
      const once = !!opts.once;
      if (opts.allChains) {
        const result = await runAllChains(registry, patterns, oracleThreshold, stableThreshold, rateThreshold);
        printOutput(result, getOpts());
        return;
      }
      const chainName = (opts.chain ?? "hyperevm").toLowerCase();
      const chain = registry.getChain(chainName);
      const rpc = chain.effectiveRpcUrl();
      const pats = patterns.split(",").map((s) => s.trim());
      const doOracle = pats.includes("oracle");
      const doStable = pats.includes("stable");
      const doRate = pats.includes("exchange_rate");
      const allTokens = registry.tokens.get(chainName) ?? [];
      const wrappedNative = chain.wrapped_native;
      const quoteStable = (() => {
        for (const sym of ["USDT", "USDC", "USDT0"]) {
          try {
            return registry.resolveToken(chainName, sym);
          } catch {
          }
        }
        return null;
      })();
      if (!quoteStable) {
        printOutput({ error: `No stablecoin found on chain ${chainName}` }, getOpts());
        return;
      }
      const scanTokens = allTokens.filter(
        (t) => t.address !== "0x0000000000000000000000000000000000000000" && !STABLECOINS.has(t.symbol)
      );
      const oracles = registry.getProtocolsForChain(chainName).filter(
        (p) => p.category === ProtocolCategory5.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated")
      ).flatMap((p) => {
        const oracleAddr = p.contracts?.["oracle"];
        if (!oracleAddr) return [];
        const decimals = p.interface === "aave_v2" ? 18 : 8;
        return [{ name: p.name, addr: oracleAddr, decimals }];
      });
      const dexProto = registry.getProtocolsForChain(chainName).find((p) => p.category === ProtocolCategory5.Dex && p.interface === "uniswap_v2");
      const dexRouter = dexProto?.contracts?.["router"];
      const compoundForks = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory5.Lending && p.interface === "compound_v2").map((p) => ({
        name: p.name,
        vtokens: Object.entries(p.contracts ?? {}).filter(([k]) => k.startsWith("v")).map(([k, a]) => ({ key: k, addr: a }))
      }));
      const usdc = (() => {
        try {
          return registry.resolveToken(chainName, "USDC");
        } catch {
          return null;
        }
      })();
      const usdt = (() => {
        try {
          return registry.resolveToken(chainName, "USDT");
        } catch {
          return null;
        }
      })();
      const prevRates = /* @__PURE__ */ new Map();
      const runOnce = async () => {
        const timestamp = Math.floor(Date.now() / 1e3);
        const t0 = Date.now();
        const calls = [];
        const callTypes = [];
        if (doOracle) {
          for (const oracle of oracles) {
            for (const token of scanTokens) {
              callTypes.push({ kind: "oracle", oracle: oracle.name, token: token.symbol, oracleDecimals: oracle.decimals });
              calls.push([
                oracle.addr,
                encodeFunctionData3({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] })
              ]);
            }
          }
          if (dexRouter) {
            for (const token of scanTokens) {
              const amountIn = BigInt(10) ** BigInt(token.decimals);
              const path = wrappedNative && token.address.toLowerCase() === wrappedNative.toLowerCase() ? [token.address, quoteStable.address] : wrappedNative ? [token.address, wrappedNative, quoteStable.address] : [token.address, quoteStable.address];
              callTypes.push({ kind: "dex", token: token.symbol, outDecimals: quoteStable.decimals });
              calls.push([
                dexRouter,
                encodeFunctionData3({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] })
              ]);
            }
          }
        }
        if (doStable && usdc && usdt && dexRouter) {
          callTypes.push({ kind: "stable", from: "USDC", to: "USDT", outDecimals: usdt.decimals });
          calls.push([
            dexRouter,
            encodeFunctionData3({
              abi: UNIV2_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]]
            })
          ]);
          callTypes.push({ kind: "stable", from: "USDT", to: "USDC", outDecimals: usdc.decimals });
          calls.push([
            dexRouter,
            encodeFunctionData3({
              abi: UNIV2_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [BigInt(10) ** BigInt(usdt.decimals), [usdt.address, usdc.address]]
            })
          ]);
        }
        if (doRate) {
          for (const fork of compoundForks) {
            for (const { key, addr } of fork.vtokens) {
              callTypes.push({ kind: "exchangeRate", protocol: fork.name, vtoken: key });
              calls.push([addr, encodeFunctionData3({ abi: VTOKEN_ABI, functionName: "exchangeRateStored", args: [] })]);
            }
          }
        }
        if (calls.length === 0) {
          printOutput({ error: `No scannable resources found on ${chainName}` }, getOpts());
          return;
        }
        const results = await multicallRead3(rpc, calls);
        const scanMs = Date.now() - t0;
        const alerts = [];
        const oracleByToken = /* @__PURE__ */ new Map();
        const dexByToken = /* @__PURE__ */ new Map();
        const oracleData = {};
        const dexData = {};
        const stableData = {};
        const stablePrices = [];
        const rateData = {};
        for (let i = 0; i < callTypes.length; i++) {
          const ct = callTypes[i];
          const raw = results[i] ?? null;
          if (ct.kind === "oracle") {
            const price = parseU256F64(raw, ct.oracleDecimals);
            if (price > 0) {
              const existing = oracleByToken.get(ct.token) ?? [];
              existing.push({ oracle: ct.oracle, price });
              oracleByToken.set(ct.token, existing);
              oracleData[`${ct.oracle}/${ct.token}`] = round4(price);
            }
          } else if (ct.kind === "dex") {
            const price = parseAmountsOutLast(raw, ct.outDecimals);
            if (price > 0) {
              dexByToken.set(ct.token, price);
              dexData[ct.token] = round4(price);
            }
          } else if (ct.kind === "stable") {
            const price = parseAmountsOutLast(raw, ct.outDecimals);
            if (price <= 0) continue;
            const pair = `${ct.from}/${ct.to}`;
            stableData[pair] = round4(price);
            stablePrices.push({ asset: ct.from, pair, price });
          } else if (ct.kind === "exchangeRate") {
            const rate = parseU256F64(raw, 18);
            const key = `${ct.protocol}/${ct.vtoken}`;
            rateData[key] = round6(rate);
            if (rate > 0) {
              const prev = prevRates.get(key);
              if (prev !== void 0) {
                const change = Math.abs((rate - prev) / prev * 100);
                if (change > rateThreshold) {
                  const severity = change > 50 ? "critical" : change > 20 ? "high" : "medium";
                  alerts.push({
                    pattern: "exchange_rate_anomaly",
                    severity,
                    protocol: ct.protocol,
                    vtoken: ct.vtoken,
                    prev_rate: round6(prev),
                    curr_rate: round6(rate),
                    change_pct: round2(change),
                    action: `possible donation attack on ${ct.protocol} ${ct.vtoken}`
                  });
                }
              }
              prevRates.set(key, rate);
            }
          }
        }
        if (stablePrices.length >= 2) {
          const allBelow = stablePrices.every((s) => s.price < stableThreshold);
          if (!allBelow) {
            for (const { asset, pair, price } of stablePrices) {
              if (price < stableThreshold) {
                const severity = price < 0.95 ? "critical" : "high";
                alerts.push({
                  pattern: "stablecoin_depeg",
                  severity,
                  asset,
                  pair,
                  price: round4(price),
                  threshold: stableThreshold,
                  action: `buy ${asset} at $${round4(price)}, wait for repeg`
                });
              }
            }
          }
        } else {
          for (const { asset, pair, price } of stablePrices) {
            if (price < stableThreshold) {
              const severity = price < 0.95 ? "critical" : "high";
              alerts.push({
                pattern: "stablecoin_depeg",
                severity,
                asset,
                pair,
                price: round4(price),
                threshold: stableThreshold,
                action: `buy ${asset} at $${round4(price)}, wait for repeg`
              });
            }
          }
        }
        if (doOracle) {
          for (const [token, oracleEntries] of oracleByToken) {
            const dexPrice = dexByToken.get(token);
            if (dexPrice === void 0) continue;
            for (const { oracle, price: oraclePrice } of oracleEntries) {
              if (dexPrice < oraclePrice && dexPrice < oraclePrice * 0.1) continue;
              const deviation = Math.abs(dexPrice - oraclePrice) / oraclePrice * 100;
              if (deviation > oracleThreshold) {
                const severity = deviation > 100 ? "critical" : deviation > 20 ? "high" : "medium";
                const action = dexPrice > oraclePrice ? `borrow ${token} from ${oracle}, sell on DEX` : `buy ${token} on DEX, use as collateral on ${oracle}`;
                alerts.push({
                  pattern: "oracle_divergence",
                  severity,
                  asset: token,
                  oracle,
                  oracle_price: round4(oraclePrice),
                  dex_price: round4(dexPrice),
                  deviation_pct: round2(deviation),
                  action
                });
              }
            }
          }
        }
        const data = {};
        if (Object.keys(oracleData).length > 0) data["oracle_prices"] = oracleData;
        if (Object.keys(dexData).length > 0) data["dex_prices"] = dexData;
        if (Object.keys(stableData).length > 0) data["stablecoin_pegs"] = stableData;
        if (Object.keys(rateData).length > 0) data["exchange_rates"] = rateData;
        const output = {
          timestamp,
          chain: chain.name,
          scan_duration_ms: scanMs,
          patterns,
          alert_count: alerts.length,
          alerts,
          data
        };
        for (const alert of alerts) {
          process.stderr.write(
            `ALERT [${alert["severity"]}]: ${alert["pattern"]} \u2014 ${alert["action"]}
`
          );
        }
        printOutput(output, getOpts());
      };
      await runOnce();
      if (!once) {
        const intervalMs = interval * 1e3;
        const loop = async () => {
          await new Promise((r) => setTimeout(r, intervalMs));
          await runOnce();
          void loop();
        };
        await loop();
      }
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
}
async function runAllChains(registry, patterns, oracleThreshold, stableThreshold, _rateThreshold) {
  const t0 = Date.now();
  const chainKeys = Array.from(registry.chains.keys());
  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const rpc = chain.effectiveRpcUrl();
      const chainName = chain.name.toLowerCase();
      const allTokens = registry.tokens.get(chainName) ?? [];
      const wrappedNative = chain.wrapped_native;
      const quoteStable = (() => {
        for (const sym of ["USDT", "USDC", "USDT0"]) {
          try {
            return registry.resolveToken(chainName, sym);
          } catch {
          }
        }
        return null;
      })();
      if (!quoteStable) return null;
      const scanTokens = allTokens.filter(
        (t) => t.address !== "0x0000000000000000000000000000000000000000" && !STABLECOINS.has(t.symbol)
      );
      const pats = patterns.split(",").map((s) => s.trim());
      const doOracle = pats.includes("oracle");
      const doStable = pats.includes("stable");
      const oracles = registry.getProtocolsForChain(chainName).filter(
        (p) => p.category === ProtocolCategory5.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated")
      ).flatMap((p) => {
        const oracleAddr = p.contracts?.["oracle"];
        if (!oracleAddr) return [];
        return [{ name: p.name, addr: oracleAddr, decimals: p.interface === "aave_v2" ? 18 : 8 }];
      });
      const dexProto = registry.getProtocolsForChain(chainName).find((p) => p.category === ProtocolCategory5.Dex && p.interface === "uniswap_v2");
      const dexRouter = dexProto?.contracts?.["router"];
      const usdc = (() => {
        try {
          return registry.resolveToken(chainName, "USDC");
        } catch {
          return null;
        }
      })();
      const usdt = (() => {
        try {
          return registry.resolveToken(chainName, "USDT");
        } catch {
          return null;
        }
      })();
      const calls = [];
      const cts = [];
      if (doOracle) {
        for (const oracle of oracles) {
          for (const token of scanTokens) {
            cts.push({ kind: "oracle", oracle: oracle.name, token: token.symbol, dec: oracle.decimals });
            calls.push([oracle.addr, encodeFunctionData3({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] })]);
          }
        }
        if (dexRouter) {
          for (const token of scanTokens) {
            const path = wrappedNative && token.address.toLowerCase() === wrappedNative.toLowerCase() ? [token.address, quoteStable.address] : wrappedNative ? [token.address, wrappedNative, quoteStable.address] : [token.address, quoteStable.address];
            cts.push({ kind: "dex", token: token.symbol, dec: quoteStable.decimals });
            calls.push([dexRouter, encodeFunctionData3({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(token.decimals), path] })]);
          }
        }
      }
      if (doStable && usdc && usdt && dexRouter) {
        cts.push({ kind: "stable", from: "USDC", to: "USDT", dec: usdt.decimals });
        calls.push([dexRouter, encodeFunctionData3({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]] })]);
        cts.push({ kind: "stable", from: "USDT", to: "USDC", dec: usdc.decimals });
        calls.push([dexRouter, encodeFunctionData3({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdt.decimals), [usdt.address, usdc.address]] })]);
      }
      if (calls.length === 0) return null;
      const ct0 = Date.now();
      const results = await multicallRead3(rpc, calls);
      const scanMs = Date.now() - ct0;
      const alerts = [];
      const oracleByToken = /* @__PURE__ */ new Map();
      const dexByToken = /* @__PURE__ */ new Map();
      const stablePrices = [];
      for (let i = 0; i < cts.length; i++) {
        const ct = cts[i];
        const raw = results[i] ?? null;
        if (ct.kind === "oracle") {
          const price = parseU256F64(raw, ct.dec);
          if (price > 0) {
            const existing = oracleByToken.get(ct.token) ?? [];
            existing.push({ oracle: ct.oracle, price });
            oracleByToken.set(ct.token, existing);
          }
        } else if (ct.kind === "dex") {
          const price = parseAmountsOutLast(raw, ct.dec);
          if (price > 0) dexByToken.set(ct.token, price);
        } else if (ct.kind === "stable") {
          const price = parseAmountsOutLast(raw, ct.dec);
          if (price > 0) stablePrices.push({ asset: ct.from, pair: `${ct.from}/${ct.to}`, price });
        }
      }
      if (stablePrices.length >= 2) {
        const allBelow = stablePrices.every((s) => s.price < stableThreshold);
        if (!allBelow) {
          for (const { asset, pair, price } of stablePrices) {
            if (price < stableThreshold) {
              alerts.push({ pattern: "stablecoin_depeg", severity: price < 0.95 ? "critical" : "high", asset, pair, price: round4(price) });
            }
          }
        }
      }
      for (const [token, oEntries] of oracleByToken) {
        const dp = dexByToken.get(token);
        if (dp === void 0) continue;
        for (const { oracle, price: op } of oEntries) {
          if (dp < op && dp < op * 0.1) continue;
          const dev = Math.abs(dp - op) / op * 100;
          if (dev > oracleThreshold) {
            const sev = dev > 100 ? "critical" : dev > 20 ? "high" : "medium";
            alerts.push({
              pattern: "oracle_divergence",
              severity: sev,
              asset: token,
              oracle,
              oracle_price: round4(op),
              dex_price: round4(dp),
              deviation_pct: round2(dev),
              action: dp > op ? `borrow ${token} from ${oracle}, sell on DEX` : `buy ${token} on DEX, collateral on ${oracle}`
            });
          }
        }
      }
      return { chain: chain.name, scan_duration_ms: scanMs, alert_count: alerts.length, alerts };
    } catch {
      return null;
    }
  });
  const chainResults = (await Promise.all(tasks)).filter(Boolean);
  chainResults.sort((a, b) => {
    const ac = a["alert_count"] ?? 0;
    const bc = b["alert_count"] ?? 0;
    return bc - ac;
  });
  const totalAlerts = chainResults.reduce((sum, r) => sum + (r["alert_count"] ?? 0), 0);
  return {
    mode: "all_chains",
    chains_scanned: chainKeys.length,
    scan_duration_ms: Date.now() - t0,
    total_alerts: totalAlerts,
    chains: chainResults
  };
}

// src/commands/arb.ts
import { Registry as Registry14 } from "@hypurrquant/defi-core";
import { createDex as createDex3 } from "@hypurrquant/defi-protocols";
function registerArb(parent, getOpts, makeExecutor2) {
  parent.command("arb").description("Detect arbitrage opportunities across DEXes").option("--token-in <token>", "Base token (default: WHYPE)", "WHYPE").option("--token-out <token>", "Quote token (default: USDC)", "USDC").option("--amount <amount>", "Test amount in wei", "1000000000000000000").option("--execute", "Execute best arb (default: analysis only)").option("--min-profit <bps>", "Min profit in bps to execute", "10").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry14.loadEmbedded();
    const chain = registry.getChain(chainName);
    const rpcUrl = chain.effectiveRpcUrl();
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const amountIn = BigInt(opts.amount);
    const dexProtocols = registry.getProtocolsByCategory("dex").filter((p) => p.chain === chainName);
    const quotes = [];
    for (const p of dexProtocols) {
      try {
        const adapter = createDex3(p, rpcUrl);
        const buyQuote = await adapter.quote({ protocol: p.name, token_in: tokenIn, token_out: tokenOut, amount_in: amountIn });
        if (buyQuote.amount_out === 0n) continue;
        const sellQuote = await adapter.quote({ protocol: p.name, token_in: tokenOut, token_out: tokenIn, amount_in: buyQuote.amount_out });
        const profitBps = Number((sellQuote.amount_out - amountIn) * 10000n / amountIn);
        quotes.push({ protocol: p.name, buy: buyQuote.amount_out, sell: sellQuote.amount_out, profit_bps: profitBps });
      } catch {
      }
    }
    const opportunities = [];
    for (let i = 0; i < quotes.length; i++) {
      for (let j = 0; j < quotes.length; j++) {
        if (i === j) continue;
        const buyAmount = quotes[i].buy;
        const sellAmount = quotes[j].sell;
        if (sellAmount > amountIn) {
          const profitBps = Number((sellAmount - amountIn) * 10000n / amountIn);
          opportunities.push({ buy_on: quotes[i].protocol, sell_on: quotes[j].protocol, profit_bps: profitBps });
        }
      }
    }
    opportunities.sort((a, b) => b.profit_bps - a.profit_bps);
    printOutput({
      chain: chainName,
      token_in: tokenIn,
      token_out: tokenOut,
      amount_in: amountIn,
      single_dex: quotes,
      cross_dex_opportunities: opportunities.slice(0, 5)
    }, getOpts());
  });
}

// src/commands/positions.ts
import { encodeFunctionData as encodeFunctionData4, parseAbi as parseAbi4 } from "viem";
import { Registry as Registry15, ProtocolCategory as ProtocolCategory6, multicallRead as multicallRead4 } from "@hypurrquant/defi-core";
var ERC20_ABI3 = parseAbi4([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var POOL_ABI3 = parseAbi4([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
var ORACLE_ABI3 = parseAbi4([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
function round22(x) {
  return Math.round(x * 100) / 100;
}
function round42(x) {
  return Math.round(x * 1e4) / 1e4;
}
function estimateTokenValue(symbol, balance, nativePrice) {
  const s = symbol.toUpperCase();
  if (s.includes("USD") || s.includes("DAI")) return balance;
  if (s.includes("BTC") || s.includes("FBTC")) return balance * 75e3;
  if (["WETH", "ETH", "METH", "CBETH", "WSTETH"].includes(s)) return balance * 2350;
  return balance * nativePrice;
}
function decodeU2562(data, offset = 0) {
  if (!data || data.length < 2 + (offset + 32) * 2) return 0n;
  const hex = data.slice(2 + offset * 64, 2 + offset * 64 + 64);
  return BigInt("0x" + hex);
}
async function scanSingleChain(chainName, rpc, user, tokens, lendingPools, oracleAddr, wrappedNative) {
  const calls = [];
  const callTypes = [];
  for (const token of tokens) {
    if (token.address !== "0x0000000000000000000000000000000000000000") {
      callTypes.push({ kind: "token", symbol: token.symbol, decimals: token.decimals });
      calls.push([
        token.address,
        encodeFunctionData4({ abi: ERC20_ABI3, functionName: "balanceOf", args: [user] })
      ]);
    }
  }
  for (const { name, pool, iface } of lendingPools) {
    callTypes.push({ kind: "lending", protocol: name, iface });
    calls.push([
      pool,
      encodeFunctionData4({ abi: POOL_ABI3, functionName: "getUserAccountData", args: [user] })
    ]);
  }
  if (oracleAddr) {
    callTypes.push({ kind: "native_price" });
    calls.push([
      oracleAddr,
      encodeFunctionData4({ abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [wrappedNative] })
    ]);
  }
  if (calls.length === 0) return null;
  let results;
  try {
    results = await multicallRead4(rpc, calls);
  } catch {
    return null;
  }
  const nativePrice = oracleAddr ? Number(decodeU2562(results[results.length - 1])) / 1e8 : 0;
  const tokenBalances = [];
  const lendingPositions = [];
  let chainValue = 0;
  let totalColl = 0;
  let totalDebt = 0;
  for (let i = 0; i < callTypes.length; i++) {
    const ct = callTypes[i];
    const data = results[i] ?? null;
    if (ct.kind === "token") {
      const balance = decodeU2562(data);
      if (balance > 0n) {
        const balF64 = Number(balance) / 10 ** ct.decimals;
        const valueUsd = estimateTokenValue(ct.symbol, balF64, nativePrice);
        if (valueUsd > 0.01) {
          chainValue += valueUsd;
          tokenBalances.push({
            symbol: ct.symbol,
            balance: round42(balF64),
            value_usd: round22(valueUsd)
          });
        }
      }
    } else if (ct.kind === "lending") {
      if (data && data.length >= 2 + 192 * 2) {
        const priceDecimals = ct.iface === "aave_v2" ? 18 : 8;
        const divisor = 10 ** priceDecimals;
        const collateral = Number(decodeU2562(data, 0)) / divisor;
        const debt = Number(decodeU2562(data, 1)) / divisor;
        const hfRaw = decodeU2562(data, 5);
        let hf = null;
        if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
          const v = Number(hfRaw) / 1e18;
          hf = v > 1e10 ? null : round22(v);
        }
        if (collateral > 0.01 || debt > 0.01) {
          const net = collateral - debt;
          chainValue += net;
          totalColl += collateral;
          totalDebt += debt;
          lendingPositions.push({
            protocol: ct.protocol,
            collateral_usd: round22(collateral),
            debt_usd: round22(debt),
            net_usd: round22(net),
            health_factor: hf
          });
        }
      }
    }
  }
  if (tokenBalances.length === 0 && lendingPositions.length === 0) return null;
  return {
    chain_name: chainName,
    native_price: nativePrice,
    chain_value: chainValue,
    collateral: totalColl,
    debt: totalDebt,
    token_balances: tokenBalances,
    lending_positions: lendingPositions
  };
}
function registerPositions(parent, getOpts) {
  parent.command("positions").description("Cross-chain position scanner: find all your positions everywhere").requiredOption("--address <address>", "Wallet address to scan").option("--chains <chains>", "Comma-separated chain names (omit for all)").action(async (opts) => {
    const mode = getOpts();
    const registry = Registry15.loadEmbedded();
    const user = opts.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
      printOutput({ error: `Invalid address: ${opts.address}` }, mode);
      return;
    }
    const chainFilter = opts.chains ? opts.chains.split(",").map((s) => s.trim().toLowerCase()) : null;
    const chainKeys = chainFilter ?? Array.from(registry.chains.keys());
    const start = Date.now();
    const scanParams = [];
    for (const chainKey of chainKeys) {
      let chain;
      try {
        chain = registry.getChain(chainKey);
      } catch {
        continue;
      }
      const rpc = chain.effectiveRpcUrl();
      const rawTokens = registry.tokens.get(chainKey) ?? [];
      const tokens = rawTokens.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals
      }));
      const chainProtocols = registry.getProtocolsForChain(chainKey);
      const lendingPools = chainProtocols.filter(
        (p) => p.category === ProtocolCategory6.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2")
      ).filter((p) => p.contracts?.["pool"]).map((p) => ({
        name: p.name,
        pool: p.contracts["pool"],
        iface: p.interface
      }));
      const oracleEntry = chainProtocols.find(
        (p) => p.interface === "aave_v3" && p.contracts?.["oracle"]
      );
      const oracleAddr = oracleEntry?.contracts?.["oracle"];
      const wrappedNative = chain.wrapped_native ?? "0x5555555555555555555555555555555555555555";
      scanParams.push({ chainName: chain.name, rpc, tokens, lendingPools, oracleAddr, wrappedNative });
    }
    const chainResultsRaw = await Promise.all(
      scanParams.map(
        (p) => scanSingleChain(p.chainName, p.rpc, user, p.tokens, p.lendingPools, p.oracleAddr, p.wrappedNative)
      )
    );
    let grandTotalUsd = 0;
    let totalCollateralUsd = 0;
    let totalDebtUsd = 0;
    const chainResults = chainResultsRaw.filter((r) => r !== null).map((r) => {
      grandTotalUsd += r.chain_value;
      totalCollateralUsd += r.collateral;
      totalDebtUsd += r.debt;
      return {
        chain: r.chain_name,
        native_price_usd: round22(r.native_price),
        chain_total_usd: round22(r.chain_value),
        token_balances: r.token_balances,
        lending_positions: r.lending_positions
      };
    }).sort((a, b) => b.chain_total_usd - a.chain_total_usd);
    const scanMs = Date.now() - start;
    printOutput(
      {
        address: user,
        scan_duration_ms: scanMs,
        chains_scanned: chainKeys.length,
        chains_with_positions: chainResults.length,
        summary: {
          total_value_usd: round22(grandTotalUsd),
          total_collateral_usd: round22(totalCollateralUsd),
          total_debt_usd: round22(totalDebtUsd),
          net_lending_usd: round22(totalCollateralUsd - totalDebtUsd)
        },
        chains: chainResults
      },
      mode
    );
  });
}

// src/commands/price.ts
import { Registry as Registry16, ProtocolCategory as ProtocolCategory7 } from "@hypurrquant/defi-core";
import { createOracleFromLending, createOracleFromCdp, createDex as createDex4, DexSpotPrice } from "@hypurrquant/defi-protocols";
function round23(x) {
  return Math.round(x * 100) / 100;
}
function resolveAsset2(registry, chain, asset) {
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    return { address: asset, symbol: asset, decimals: 18 };
  }
  const token = registry.resolveToken(chain, asset);
  return { address: token.address, symbol: token.symbol, decimals: token.decimals };
}
var WHYPE_ADDRESS = "0x5555555555555555555555555555555555555555";
function registerPrice(parent, getOpts) {
  parent.command("price").description("Query asset prices from oracles and DEXes").requiredOption("--asset <token>", "Token symbol or address").option("--source <source>", "Price source: oracle, dex, or all", "all").action(async (opts) => {
    const mode = getOpts();
    const registry = Registry16.loadEmbedded();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    let chain;
    try {
      chain = registry.getChain(chainName);
    } catch (e) {
      printOutput({ error: `Chain not found: ${chainName}` }, mode);
      return;
    }
    const rpcUrl = chain.effectiveRpcUrl();
    let assetAddr;
    let assetSymbol;
    let assetDecimals;
    try {
      const resolved = resolveAsset2(registry, chainName, opts.asset);
      assetAddr = resolved.address;
      assetSymbol = resolved.symbol;
      assetDecimals = resolved.decimals;
    } catch (e) {
      printOutput({ error: `Could not resolve asset: ${opts.asset}` }, mode);
      return;
    }
    const fetchOracle = opts.source === "all" || opts.source === "oracle";
    const fetchDex = opts.source === "all" || opts.source === "dex";
    const allPrices = [];
    if (fetchOracle) {
      const lendingProtocols = registry.getProtocolsByCategory(ProtocolCategory7.Lending).filter((p) => p.chain.toLowerCase() === chainName);
      await Promise.all(
        lendingProtocols.map(async (entry) => {
          try {
            const oracle = createOracleFromLending(entry, rpcUrl);
            const price = await oracle.getPrice(assetAddr);
            allPrices.push({
              source: price.source,
              source_type: price.source_type,
              price_f64: price.price_f64
            });
          } catch {
          }
        })
      );
      const isWhype = assetAddr.toLowerCase() === WHYPE_ADDRESS.toLowerCase() || assetSymbol.toUpperCase() === "WHYPE" || assetSymbol.toUpperCase() === "HYPE";
      if (isWhype) {
        const cdpProtocols = registry.getProtocolsByCategory(ProtocolCategory7.Cdp).filter((p) => p.chain.toLowerCase() === chainName);
        await Promise.all(
          cdpProtocols.map(async (entry) => {
            try {
              const oracle = createOracleFromCdp(entry, assetAddr, rpcUrl);
              const price = await oracle.getPrice(assetAddr);
              allPrices.push({
                source: price.source,
                source_type: price.source_type,
                price_f64: price.price_f64
              });
            } catch {
            }
          })
        );
      }
    }
    if (fetchDex) {
      let usdcToken;
      try {
        usdcToken = registry.resolveToken(chainName, "USDC");
      } catch {
        process.stderr.write("USDC token not found in registry \u2014 skipping DEX prices\n");
      }
      if (usdcToken) {
        const dexProtocols = registry.getProtocolsByCategory(ProtocolCategory7.Dex).filter((p) => p.chain.toLowerCase() === chainName);
        await Promise.all(
          dexProtocols.map(async (entry) => {
            try {
              const dex = createDex4(entry, rpcUrl);
              const price = await DexSpotPrice.getPrice(
                dex,
                assetAddr,
                assetDecimals,
                usdcToken.address,
                usdcToken.decimals
              );
              allPrices.push({
                source: price.source,
                source_type: price.source_type,
                price_f64: price.price_f64
              });
            } catch {
            }
          })
        );
      }
    }
    if (allPrices.length === 0) {
      printOutput({ error: "No prices could be fetched from any source" }, mode);
      return;
    }
    const pricesF64 = allPrices.map((p) => p.price_f64);
    const maxPrice = Math.max(...pricesF64);
    const minPrice = Math.min(...pricesF64);
    const maxSpreadPct = minPrice > 0 ? (maxPrice - minPrice) / minPrice * 100 : 0;
    const oraclePrices = allPrices.filter((p) => p.source_type === "oracle").map((p) => p.price_f64);
    const dexPrices = allPrices.filter((p) => p.source_type === "dex_spot").map((p) => p.price_f64);
    let oracleVsDexSpreadPct = 0;
    if (oraclePrices.length > 0 && dexPrices.length > 0) {
      const avgOracle = oraclePrices.reduce((a, b) => a + b, 0) / oraclePrices.length;
      const avgDex = dexPrices.reduce((a, b) => a + b, 0) / dexPrices.length;
      const minAvg = Math.min(avgOracle, avgDex);
      oracleVsDexSpreadPct = minAvg > 0 ? Math.abs(avgOracle - avgDex) / minAvg * 100 : 0;
    }
    const report = {
      asset: assetSymbol,
      asset_address: assetAddr,
      prices: allPrices.map((p) => ({
        source: p.source,
        source_type: p.source_type,
        price: round23(p.price_f64)
      })),
      max_spread_pct: round23(maxSpreadPct),
      oracle_vs_dex_spread_pct: round23(oracleVsDexSpreadPct)
    };
    printOutput(report, mode);
  });
}

// src/commands/wallet.ts
import { Registry as Registry17 } from "@hypurrquant/defi-core";
import { createPublicClient as createPublicClient3, http as http3, formatEther } from "viem";
function registerWallet(parent, getOpts) {
  const wallet = parent.command("wallet").description("Wallet management");
  wallet.command("balance").description("Show native token balance").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry17.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient3({ transport: http3(chain.effectiveRpcUrl()) });
    const balance = await client.getBalance({ address: opts.address });
    printOutput({
      chain: chain.name,
      address: opts.address,
      native_token: chain.native_token,
      balance_wei: balance,
      balance_formatted: formatEther(balance)
    }, getOpts());
  });
  wallet.command("address").description("Show configured wallet address").action(async () => {
    const addr = process.env.DEFI_WALLET_ADDRESS ?? "(not set)";
    printOutput({ address: addr }, getOpts());
  });
}

// src/commands/token.ts
import { Registry as Registry18, buildApprove, buildTransfer, erc20Abi } from "@hypurrquant/defi-core";
import { createPublicClient as createPublicClient4, http as http4, maxUint256 } from "viem";
function registerToken(parent, getOpts, makeExecutor2) {
  const token = parent.command("token").description("Token operations: approve, allowance, transfer, balance");
  token.command("balance").description("Query token balance for an address").requiredOption("--token <token>", "Token symbol or address").requiredOption("--owner <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry18.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient4({ transport: http4(chain.effectiveRpcUrl()) });
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const [balance, symbol, decimals] = await Promise.all([
      client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "balanceOf", args: [opts.owner] }),
      client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" })
    ]);
    printOutput({
      token: tokenAddr,
      symbol,
      owner: opts.owner,
      balance,
      decimals
    }, getOpts());
  });
  token.command("approve").description("Approve a spender for a token").requiredOption("--token <token>", "Token symbol or address").requiredOption("--spender <address>", "Spender address").option("--amount <amount>", "Amount to approve (use 'max' for unlimited)", "max").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry18.loadEmbedded();
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const amount = opts.amount === "max" ? maxUint256 : BigInt(opts.amount);
    const tx = buildApprove(tokenAddr, opts.spender, amount);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  token.command("allowance").description("Check token allowance").requiredOption("--token <token>", "Token symbol or address").requiredOption("--owner <address>", "Owner address").requiredOption("--spender <address>", "Spender address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry18.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient4({ transport: http4(chain.effectiveRpcUrl()) });
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const allowance = await client.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: "allowance",
      args: [opts.owner, opts.spender]
    });
    printOutput({ token: tokenAddr, owner: opts.owner, spender: opts.spender, allowance }, getOpts());
  });
  token.command("transfer").description("Transfer tokens to an address").requiredOption("--token <token>", "Token symbol or address").requiredOption("--to <address>", "Recipient address").requiredOption("--amount <amount>", "Amount to transfer (in wei)").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry18.loadEmbedded();
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const tx = buildTransfer(tokenAddr, opts.to, BigInt(opts.amount));
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/whales.ts
import { encodeFunctionData as encodeFunctionData5, parseAbi as parseAbi5 } from "viem";
import { Registry as Registry19, ProtocolCategory as ProtocolCategory8, multicallRead as multicallRead5 } from "@hypurrquant/defi-core";
var POOL_ABI4 = parseAbi5([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
function round24(x) {
  return Math.round(x * 100) / 100;
}
function round43(x) {
  return Math.round(x * 1e4) / 1e4;
}
function decodeU2563(data, wordOffset = 0) {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}
function getExplorerApi(chainId, explorerUrl) {
  const routescanChains = [1, 43114, 10, 5e3];
  if (routescanChains.includes(chainId)) {
    return {
      base: `https://api.routescan.io/v2/network/mainnet/evm/${chainId}/etherscan/api`
    };
  }
  const apiKey = process.env["ETHERSCAN_API_KEY"];
  if (apiKey) {
    return {
      base: `https://api.etherscan.io/v2/api?chainid=${chainId}`,
      apiKey
    };
  }
  return null;
}
function registerWhales(parent, getOpts) {
  parent.command("whales").description("Find top token holders (whales) and their positions").requiredOption("--token <token>", "Token symbol or address").option("--top <n>", "Number of top holders to show", "10").option("--positions", "Also scan each whale's lending positions").action(async (opts) => {
    const mode = getOpts();
    const registry = Registry19.loadEmbedded();
    const chainName = (parent.opts().chain ?? "hyperevm").toLowerCase();
    let chain;
    try {
      chain = registry.getChain(chainName);
    } catch {
      printOutput({ error: `Chain not found: ${chainName}` }, mode);
      return;
    }
    const rpc = chain.effectiveRpcUrl();
    const top = parseInt(opts.top, 10) || 10;
    let token;
    try {
      token = registry.resolveToken(chainName, opts.token);
    } catch {
      printOutput({ error: `Token not found: ${opts.token}` }, mode);
      return;
    }
    const explorerApi = getExplorerApi(chain.chain_id, chain.explorer_url);
    if (!explorerApi) {
      printOutput(
        {
          error: `No explorer API available for ${chain.name} (chain_id: ${chain.chain_id}). Set ETHERSCAN_API_KEY to enable.`
        },
        mode
      );
      return;
    }
    const tokenAddr = token.address;
    let url = `${explorerApi.base}?module=token&action=tokenholderlist&contractaddress=${tokenAddr}&page=1&offset=${top}`;
    if (explorerApi.apiKey) {
      url += `&apikey=${explorerApi.apiKey}`;
    }
    let body;
    try {
      const resp = await fetch(url);
      body = await resp.json();
    } catch (e) {
      printOutput({ error: `Explorer API request failed: ${e instanceof Error ? e.message : String(e)}` }, mode);
      return;
    }
    if (body.status !== "1") {
      const msg = typeof body.result === "string" ? body.result : "Unknown error";
      if (msg.includes("API Key") || msg.includes("apikey")) {
        printOutput(
          { error: "Explorer API requires API key. Set ETHERSCAN_API_KEY environment variable." },
          mode
        );
        return;
      }
      printOutput({ error: `Explorer API error: ${msg}` }, mode);
      return;
    }
    const holders = Array.isArray(body.result) ? body.result : [];
    const whaleList = [];
    for (const h of holders) {
      const addrStr = h["TokenHolderAddress"] ?? "";
      const qtyStr = h["TokenHolderQuantity"] ?? "0";
      if (/^0x[0-9a-fA-F]{40}$/.test(addrStr)) {
        const raw = BigInt(qtyStr || "0");
        const balance = Number(raw) / 10 ** token.decimals;
        whaleList.push({ address: addrStr, balance });
      }
    }
    const whaleData = [];
    if (opts.positions && whaleList.length > 0) {
      const lendingPools = registry.getProtocolsForChain(chainName).filter(
        (p) => p.category === ProtocolCategory8.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2")
      ).filter((p) => p.contracts?.["pool"]).map((p) => ({
        name: p.name,
        pool: p.contracts["pool"],
        iface: p.interface
      }));
      const calls = [];
      for (const whale of whaleList) {
        for (const { pool } of lendingPools) {
          calls.push([
            pool,
            encodeFunctionData5({ abi: POOL_ABI4, functionName: "getUserAccountData", args: [whale.address] })
          ]);
        }
      }
      let results = [];
      if (calls.length > 0) {
        try {
          results = await multicallRead5(rpc, calls);
        } catch {
          results = [];
        }
      }
      const poolsPerWhale = lendingPools.length;
      for (let wi = 0; wi < whaleList.length; wi++) {
        const whale = whaleList[wi];
        const positions = [];
        for (let pi = 0; pi < lendingPools.length; pi++) {
          const { name: protoName, iface } = lendingPools[pi];
          const idx = wi * poolsPerWhale + pi;
          const data = results[idx] ?? null;
          if (data && data.length >= 2 + 192 * 2) {
            const dec = iface === "aave_v2" ? 18 : 8;
            const divisor = 10 ** dec;
            const collateral = Number(decodeU2563(data, 0)) / divisor;
            const debt = Number(decodeU2563(data, 1)) / divisor;
            const hfRaw = decodeU2563(data, 5);
            let hf = null;
            if (hfRaw <= BigInt("0xffffffffffffffffffffffffffffffff")) {
              const v = Number(hfRaw) / 1e18;
              hf = v > 1e10 ? null : round24(v);
            }
            if (collateral > 0.01 || debt > 0.01) {
              positions.push({
                protocol: protoName,
                collateral_usd: round24(collateral),
                debt_usd: round24(debt),
                health_factor: hf
              });
            }
          }
        }
        whaleData.push({
          rank: wi + 1,
          address: whale.address,
          balance: round43(whale.balance),
          positions
        });
      }
    } else {
      for (let wi = 0; wi < whaleList.length; wi++) {
        const whale = whaleList[wi];
        whaleData.push({
          rank: wi + 1,
          address: whale.address,
          balance: round43(whale.balance)
        });
      }
    }
    printOutput(
      {
        chain: chain.name,
        token: opts.token,
        token_address: tokenAddr,
        decimals: token.decimals,
        top,
        holders: whaleData,
        explorer: chain.explorer_url ?? ""
      },
      mode
    );
  });
}

// src/commands/compare.ts
import { spawnSync } from "child_process";
import { Registry as Registry20, ProtocolCategory as ProtocolCategory9 } from "@hypurrquant/defi-core";
import { createLending as createLending4 } from "@hypurrquant/defi-protocols";
function round25(x) {
  return Math.round(x * 100) / 100;
}
async function fetchPerpRates() {
  let result = spawnSync("perp", ["--json", "arb", "scan", "--rates"], { encoding: "utf8", timeout: 3e4 });
  if (result.error || result.status !== 0) {
    result = spawnSync("npx", ["-y", "perp-cli@latest", "--json", "arb", "scan", "--rates"], {
      encoding: "utf8",
      timeout: 6e4
    });
  }
  if (result.error || result.status !== 0) {
    throw new Error("perp-cli not found or failed");
  }
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error("perp JSON parse error");
  }
  const d = data;
  const symbolsRaw = d["data"]?.["symbols"] ?? d["symbols"];
  const symbols = Array.isArray(symbolsRaw) ? symbolsRaw : [];
  const results = [];
  for (const sym of symbols) {
    const symbol = sym["symbol"] ?? "?";
    const maxSpread = sym["maxSpreadAnnual"] ?? 0;
    const longEx = sym["longExchange"] ?? "?";
    const shortEx = sym["shortExchange"] ?? "?";
    if (Math.abs(maxSpread) > 0) {
      results.push({
        type: "perp_funding",
        asset: symbol,
        apy: round25(maxSpread),
        detail: `long ${longEx} / short ${shortEx}`,
        risk: Math.abs(maxSpread) > 50 ? "high" : Math.abs(maxSpread) > 20 ? "medium" : "low",
        source: "perp-cli"
      });
    }
    const rates = Array.isArray(sym["rates"]) ? sym["rates"] : [];
    for (const rate of rates) {
      const exchange = rate["exchange"] ?? "?";
      const annual = rate["annualizedPct"] ?? 0;
      if (Math.abs(annual) > 1) {
        results.push({
          type: "perp_rate",
          asset: symbol,
          apy: round25(annual),
          detail: exchange,
          risk: Math.abs(annual) > 50 ? "high" : Math.abs(annual) > 20 ? "medium" : "low",
          source: "perp-cli"
        });
      }
    }
  }
  return results;
}
async function fetchLendingRates(registry, asset) {
  const chainKeys = Array.from(registry.chains.keys());
  const tasks = chainKeys.map(async (ck) => {
    try {
      const chain = registry.getChain(ck);
      const chainName = chain.name.toLowerCase();
      let assetAddr;
      try {
        assetAddr = registry.resolveToken(chainName, asset).address;
      } catch {
        return [];
      }
      const protos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory9.Lending && p.interface === "aave_v3");
      if (protos.length === 0) return [];
      const rpc = chain.effectiveRpcUrl();
      const rates = [];
      for (const proto of protos) {
        try {
          const lending = createLending4(proto, rpc);
          const r = await lending.getRates(assetAddr);
          if (r.supply_apy > 0) {
            rates.push({
              type: "lending_supply",
              asset,
              apy: round25(r.supply_apy * 100),
              detail: `${r.protocol} (${chain.name})`,
              risk: "low",
              source: "defi-cli"
            });
          }
        } catch {
        }
      }
      return rates;
    } catch {
      return [];
    }
  });
  const nested = await Promise.all(tasks);
  return nested.flat();
}
function registerCompare(parent, getOpts) {
  parent.command("compare").description("Compare all yield sources: perp funding vs lending APY vs staking").option("--asset <token>", "Token symbol to compare (e.g. USDC, ETH)", "USDC").option("--no-perps", "Exclude perp funding rates").option("--no-lending", "Exclude lending rates").option("--min-apy <pct>", "Minimum absolute APY to show", "1.0").action(async (opts) => {
    try {
      const registry = Registry20.loadEmbedded();
      const asset = opts.asset ?? "USDC";
      const includePerps = opts.perps !== false;
      const includeLending = opts.lending !== false;
      const minApy = parseFloat(opts.minApy ?? "1.0");
      const t0 = Date.now();
      const opportunities = [];
      if (includePerps) {
        try {
          const perpData = await fetchPerpRates();
          for (const opp of perpData) {
            const apy = Math.abs(opp["apy"] ?? 0);
            if (apy >= minApy) opportunities.push(opp);
          }
        } catch {
        }
      }
      if (includeLending) {
        const lendingData = await fetchLendingRates(registry, asset);
        for (const opp of lendingData) {
          const apy = Math.abs(opp["apy"] ?? 0);
          if (apy >= minApy) opportunities.push(opp);
        }
      }
      opportunities.sort((a, b) => {
        const aApy = Math.abs(a["apy"] ?? 0);
        const bApy = Math.abs(b["apy"] ?? 0);
        return bApy - aApy;
      });
      const scanMs = Date.now() - t0;
      printOutput(
        {
          asset,
          scan_duration_ms: scanMs,
          total_opportunities: opportunities.length,
          opportunities
        },
        getOpts()
      );
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
}

// src/commands/swap.ts
import { Registry as Registry21 } from "@hypurrquant/defi-core";
var ODOS_API = "https://api.odos.xyz";
function registerSwap(parent, getOpts, makeExecutor2) {
  parent.command("swap").description("Aggregator swap: best price across all DEXes (ODOS)").requiredOption("--token-in <token>", "Input token symbol or address").requiredOption("--token-out <token>", "Output token symbol or address").requiredOption("--amount <amount>", "Amount of input token in wei").option("--slippage <bps>", "Slippage tolerance in basis points", "50").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry21.loadEmbedded();
    const chain = registry.getChain(chainName);
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const sender = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    try {
      const quoteRes = await fetch(`${ODOS_API}/sor/quote/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: chain.chain_id,
          inputTokens: [{ tokenAddress: tokenIn, amount: opts.amount }],
          outputTokens: [{ tokenAddress: tokenOut, proportion: 1 }],
          slippageLimitPercent: parseInt(opts.slippage) / 100,
          userAddr: sender
        })
      });
      const quote = await quoteRes.json();
      if (!quote.pathId) {
        printOutput({ error: "No ODOS route found", quote }, getOpts());
        return;
      }
      const assembleRes = await fetch(`${ODOS_API}/sor/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathId: quote.pathId, userAddr: sender })
      });
      const assembled = await assembleRes.json();
      if (assembled.transaction) {
        const tx = {
          description: `ODOS swap ${tokenIn} \u2192 ${tokenOut}`,
          to: assembled.transaction.to,
          data: assembled.transaction.data,
          value: BigInt(assembled.transaction.value ?? 0)
        };
        const result = await executor.execute(tx);
        printOutput({ ...result, odos_quote: quote }, getOpts());
      } else {
        printOutput({ error: "ODOS assembly failed", assembled }, getOpts());
      }
    } catch (e) {
      printOutput({ error: `ODOS API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
    }
  });
}

// src/commands/bridge.ts
import { Registry as Registry22 } from "@hypurrquant/defi-core";
var LIFI_API = "https://li.quest/v1";
var DLN_API = "https://dln.debridge.finance/v1.0/dln/order";
var CCTP_FEE_API = "https://iris-api.circle.com/v2/burn/USDC/fees";
var DLN_CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  bnb: 56,
  polygon: 137,
  arbitrum: 42161,
  avalanche: 43114,
  base: 8453,
  linea: 59144,
  zksync: 324
};
async function getDebridgeQuote(srcChainId, dstChainId, srcToken, dstToken, amountRaw, recipient) {
  const params = new URLSearchParams({
    srcChainId: String(srcChainId),
    srcChainTokenIn: srcToken,
    srcChainTokenInAmount: amountRaw,
    dstChainId: String(dstChainId),
    dstChainTokenOut: dstToken,
    prependOperatingExpenses: "true"
  });
  const res = await fetch(`${DLN_API}/quote?${params}`);
  if (!res.ok) throw new Error(`deBridge quote failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const estimation = data.estimation;
  const dstOut = estimation?.dstChainTokenOut;
  const amountOut = String(dstOut?.recommendedAmount ?? dstOut?.amount ?? "0");
  const fulfillDelay = Number(data.order?.approximateFulfillmentDelay ?? 10);
  const createParams = new URLSearchParams({
    srcChainId: String(srcChainId),
    srcChainTokenIn: srcToken,
    srcChainTokenInAmount: amountRaw,
    dstChainId: String(dstChainId),
    dstChainTokenOut: dstToken,
    dstChainTokenOutAmount: amountOut,
    dstChainTokenOutRecipient: recipient,
    srcChainOrderAuthorityAddress: recipient,
    dstChainOrderAuthorityAddress: recipient,
    prependOperatingExpenses: "true"
  });
  const createRes = await fetch(`${DLN_API}/create-tx?${createParams}`);
  if (!createRes.ok) throw new Error(`deBridge create-tx failed: ${createRes.status} ${await createRes.text()}`);
  const createData = await createRes.json();
  return {
    amountOut,
    estimatedTime: fulfillDelay,
    raw: createData
  };
}
var CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  solana: 5,
  base: 6,
  polygon: 7,
  sui: 8,
  aptos: 9
};
var CCTP_TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
var CCTP_USDC_ADDRESSES = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
};
async function getCctpFeeEstimate(srcDomain, dstDomain, amountUsdc) {
  try {
    const res = await fetch(`${CCTP_FEE_API}/${srcDomain}/${dstDomain}`);
    if (res.ok) {
      const schedules = await res.json();
      const schedule = schedules.find((s) => s.finalityThreshold === 2e3) ?? schedules[0];
      if (schedule) {
        const amountSubunits = BigInt(Math.round(amountUsdc * 1e6));
        const bpsRounded = BigInt(Math.round(schedule.minimumFee * 100));
        const protocolFee = amountSubunits * bpsRounded / 1000000n;
        const protocolFeeBuffered = protocolFee * 120n / 100n;
        if (schedule.forwardFee) {
          const forwardFeeSubunits = BigInt(schedule.forwardFee.high);
          const totalMaxFee = protocolFeeBuffered + forwardFeeSubunits;
          return { fee: Number(totalMaxFee) / 1e6, maxFeeSubunits: totalMaxFee };
        }
        const minFee = protocolFeeBuffered > 0n ? protocolFeeBuffered : 10000n;
        return { fee: Number(minFee) / 1e6, maxFeeSubunits: minFee };
      }
    }
  } catch {
  }
  return { fee: 0.25, maxFeeSubunits: 250000n };
}
function registerBridge(parent, getOpts) {
  parent.command("bridge").description("Cross-chain bridge: move assets between chains").requiredOption("--token <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount in wei").requiredOption("--to-chain <chain>", "Destination chain name").option("--recipient <address>", "Recipient address on destination chain").option("--slippage <bps>", "Slippage in bps (LI.FI only)", "50").option("--provider <name>", "Bridge provider: lifi, debridge, cctp", "lifi").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry22.loadEmbedded();
    const fromChain = registry.getChain(chainName);
    const toChain = registry.getChain(opts.toChain);
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    const provider = opts.provider.toLowerCase();
    if (provider === "debridge") {
      try {
        const srcId = DLN_CHAIN_IDS[chainName] ?? fromChain.chain_id;
        const dstId = DLN_CHAIN_IDS[opts.toChain] ?? toChain.chain_id;
        const result = await getDebridgeQuote(
          srcId,
          dstId,
          tokenAddr,
          tokenAddr,
          opts.amount,
          recipient
        );
        const tx = result.raw.tx;
        printOutput({
          from_chain: fromChain.name,
          to_chain: toChain.name,
          token: tokenAddr,
          amount: opts.amount,
          bridge: "deBridge DLN",
          estimated_output: result.amountOut,
          estimated_time_seconds: result.estimatedTime,
          tx: tx ? { to: tx.to, data: tx.data, value: tx.value } : void 0
        }, getOpts());
      } catch (e) {
        printOutput({ error: `deBridge API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
      }
      return;
    }
    if (provider === "cctp") {
      try {
        const srcDomain = CCTP_DOMAINS[chainName];
        const dstDomain = CCTP_DOMAINS[opts.toChain];
        if (srcDomain === void 0) {
          printOutput({ error: `CCTP not supported on source chain: ${chainName}. Supported: ${Object.keys(CCTP_DOMAINS).join(", ")}` }, getOpts());
          return;
        }
        if (dstDomain === void 0) {
          printOutput({ error: `CCTP not supported on destination chain: ${opts.toChain}. Supported: ${Object.keys(CCTP_DOMAINS).join(", ")}` }, getOpts());
          return;
        }
        const usdcSrc = CCTP_USDC_ADDRESSES[chainName];
        const usdcDst = CCTP_USDC_ADDRESSES[opts.toChain];
        if (!usdcSrc) {
          printOutput({ error: `No native USDC address known for ${chainName}. CCTP requires native USDC.` }, getOpts());
          return;
        }
        const amountUsdc = Number(BigInt(opts.amount)) / 1e6;
        const { fee, maxFeeSubunits } = await getCctpFeeEstimate(srcDomain, dstDomain, amountUsdc);
        const recipientPadded = `0x${"0".repeat(24)}${recipient.replace("0x", "").toLowerCase()}`;
        const { encodeFunctionData: encodeFunctionData6, parseAbi: parseAbi6 } = await import("viem");
        const tokenMessengerAbi = parseAbi6([
          "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)"
        ]);
        const data = encodeFunctionData6({
          abi: tokenMessengerAbi,
          functionName: "depositForBurn",
          args: [
            BigInt(opts.amount),
            dstDomain,
            recipientPadded,
            usdcSrc,
            `0x${"0".repeat(64)}`,
            // any caller
            maxFeeSubunits,
            2e3
            // standard finality
          ]
        });
        printOutput({
          from_chain: fromChain.name,
          to_chain: toChain.name,
          token: usdcSrc,
          token_dst: usdcDst ?? tokenAddr,
          amount: opts.amount,
          bridge: "Circle CCTP V2",
          estimated_fee_usdc: fee,
          estimated_output: String(BigInt(opts.amount) - maxFeeSubunits),
          note: "After burn, poll https://iris-api.circle.com/v2/messages/{srcDomain} for attestation, then call MessageTransmitter.receiveMessage() on destination",
          tx: {
            to: CCTP_TOKEN_MESSENGER_V2,
            data,
            value: "0x0"
          }
        }, getOpts());
      } catch (e) {
        printOutput({ error: `CCTP error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
      }
      return;
    }
    try {
      const params = new URLSearchParams({
        fromChain: String(fromChain.chain_id),
        toChain: String(toChain.chain_id),
        fromToken: tokenAddr,
        toToken: tokenAddr,
        fromAmount: opts.amount,
        fromAddress: recipient,
        slippage: String(parseInt(opts.slippage) / 1e4)
      });
      const res = await fetch(`${LIFI_API}/quote?${params}`);
      const quote = await res.json();
      if (quote.transactionRequest) {
        printOutput({
          from_chain: fromChain.name,
          to_chain: toChain.name,
          token: tokenAddr,
          amount: opts.amount,
          bridge: quote.toolDetails?.name ?? "LI.FI",
          estimated_output: quote.estimate?.toAmount,
          tx: { to: quote.transactionRequest.to, data: quote.transactionRequest.data, value: quote.transactionRequest.value }
        }, getOpts());
      } else {
        printOutput({ error: "No LI.FI route found", details: quote }, getOpts());
      }
    } catch (e) {
      printOutput({ error: `LI.FI API error: ${e instanceof Error ? e.message : String(e)}` }, getOpts());
    }
  });
}

// src/commands/nft.ts
import { Registry as Registry23 } from "@hypurrquant/defi-core";
import { createNft } from "@hypurrquant/defi-protocols";
function registerNft(parent, getOpts) {
  const nft = parent.command("nft").description("NFT operations: collection info, ownership, balance");
  nft.command("info").description("Get NFT collection info (name, symbol, total supply)").requiredOption("--collection <address>", "NFT collection contract address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry23.loadEmbedded();
    const chain = registry.getChain(chainName);
    const nftProtocols = registry.getProtocolsByCategory("nft").filter((p) => p.chain === chainName);
    const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
    try {
      const adapter = createNft(entry, chain.effectiveRpcUrl());
      const info = await adapter.getCollectionInfo(opts.collection);
      printOutput(info, getOpts());
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
    }
  });
  nft.command("owner").description("Check who owns a specific NFT token ID").requiredOption("--collection <address>", "NFT collection contract address").requiredOption("--token-id <id>", "Token ID").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry23.loadEmbedded();
    const chain = registry.getChain(chainName);
    const nftProtocols = registry.getProtocolsByCategory("nft").filter((p) => p.chain === chainName);
    const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
    try {
      const adapter = createNft(entry, chain.effectiveRpcUrl());
      const info = await adapter.getTokenInfo(opts.collection, BigInt(opts.tokenId));
      printOutput(info, getOpts());
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
    }
  });
  nft.command("balance").description("Check how many NFTs an address holds in a collection").requiredOption("--collection <address>", "NFT collection contract address").requiredOption("--owner <address>", "Owner address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry23.loadEmbedded();
    const chain = registry.getChain(chainName);
    const nftProtocols = registry.getProtocolsByCategory("nft").filter((p) => p.chain === chainName);
    const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
    try {
      const adapter = createNft(entry, chain.effectiveRpcUrl());
      const balance = await adapter.getBalance(opts.owner, opts.collection);
      printOutput({ collection: opts.collection, owner: opts.owner, balance }, getOpts());
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
    }
  });
  nft.command("uri").description("Get token URI for a specific NFT").requiredOption("--collection <address>", "NFT collection contract address").requiredOption("--token-id <id>", "Token ID").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry23.loadEmbedded();
    const chain = registry.getChain(chainName);
    const nftProtocols = registry.getProtocolsByCategory("nft").filter((p) => p.chain === chainName);
    const entry = nftProtocols[0] ?? { name: "ERC721", slug: "erc721", category: "nft", interface: "erc721", chain: chainName, contracts: { collection: opts.collection } };
    try {
      const adapter = createNft(entry, chain.effectiveRpcUrl());
      const info = await adapter.getTokenInfo(opts.collection, BigInt(opts.tokenId));
      printOutput({ collection: opts.collection, token_id: opts.tokenId, token_uri: info.token_uri }, getOpts());
    } catch (e) {
      printOutput({ error: e instanceof Error ? e.message : String(e) }, getOpts());
    }
  });
}

// src/commands/farm.ts
import { Registry as Registry24 } from "@hypurrquant/defi-core";
import { createMasterChef } from "@hypurrquant/defi-protocols";
function registerFarm(parent, getOpts, makeExecutor2) {
  const farm = parent.command("farm").description("LP farm operations: deposit, withdraw, claim rewards (MasterChef)");
  farm.command("deposit").description("Deposit LP tokens into a MasterChef farm").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pid <pid>", "Farm pool ID").requiredOption("--amount <amount>", "LP token amount in wei").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry24.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMasterChef(protocol, rpcUrl);
    const tx = await adapter.buildDeposit(
      protocol.contracts?.["masterchef"],
      BigInt(opts.amount),
      BigInt(opts.pid)
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farm.command("withdraw").description("Withdraw LP tokens from a MasterChef farm").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pid <pid>", "Farm pool ID").requiredOption("--amount <amount>", "LP token amount in wei").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry24.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMasterChef(protocol, rpcUrl);
    const tx = await adapter.buildWithdrawPid(
      BigInt(opts.pid),
      BigInt(opts.amount)
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farm.command("claim").description("Claim pending rewards from a MasterChef farm").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pid <pid>", "Farm pool ID").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry24.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMasterChef(protocol, rpcUrl);
    const tx = await adapter.buildClaimRewardsPid(
      BigInt(opts.pid)
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farm.command("info").description("Show pending rewards and farm info").requiredOption("--protocol <protocol>", "Protocol slug").option("--pid <pid>", "Farm pool ID (optional)").option("--address <address>", "Wallet address to query (defaults to DEFI_WALLET_ADDRESS env)").action(async (opts) => {
    const registry = Registry24.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMasterChef(protocol, rpcUrl);
    const walletAddress = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
    if (!walletAddress) {
      throw new Error("--address or DEFI_WALLET_ADDRESS required");
    }
    const masterchef = protocol.contracts?.["masterchef"];
    const rewards = await adapter.getPendingRewards(masterchef, walletAddress);
    printOutput(rewards, getOpts());
  });
}

// src/cli.ts
var BANNER = `
  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2557
  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551    \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2588\u2588\u2551    \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D     \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D

  2 chains \xB7 32 protocols \xB7 by HypurrQuant

  Scan exploits, swap tokens, bridge assets, track whales,
  compare yields \u2014 all from your terminal.
`;
var program = new Command().name("defi").description("DeFi CLI \u2014 Multi-chain DeFi toolkit").version("0.1.0").addHelpText("before", BANNER).option("--json", "Output as JSON").option("--ndjson", "Output as newline-delimited JSON").option("--fields <fields>", "Select specific output fields (comma-separated)").option("--chain <chain>", "Target chain", "hyperevm").option("--dry-run", "Dry-run mode (default, no broadcast)", true).option("--broadcast", "Actually broadcast the transaction");
function getOutputMode() {
  const opts = program.opts();
  return parseOutputMode(opts);
}
function makeExecutor() {
  const opts = program.opts();
  const registry = Registry25.loadEmbedded();
  const chain = registry.getChain(opts.chain ?? "hyperevm");
  return new Executor(!!opts.broadcast, chain.effectiveRpcUrl());
}
registerStatus(program, getOutputMode);
registerSchema(program, getOutputMode);
registerDex(program, getOutputMode, makeExecutor);
registerGauge(program, getOutputMode, makeExecutor);
registerLending(program, getOutputMode, makeExecutor);
registerCdp(program, getOutputMode, makeExecutor);
registerStaking(program, getOutputMode, makeExecutor);
registerVault(program, getOutputMode, makeExecutor);
registerYield(program, getOutputMode, makeExecutor);
registerPortfolio(program, getOutputMode);
registerMonitor(program, getOutputMode);
registerAlert(program, getOutputMode);
registerScan(program, getOutputMode);
registerArb(program, getOutputMode, makeExecutor);
registerPositions(program, getOutputMode);
registerPrice(program, getOutputMode);
registerWallet(program, getOutputMode);
registerToken(program, getOutputMode, makeExecutor);
registerWhales(program, getOutputMode);
registerCompare(program, getOutputMode);
registerSwap(program, getOutputMode, makeExecutor);
registerBridge(program, getOutputMode);
registerNft(program, getOutputMode);
registerFarm(program, getOutputMode, makeExecutor);
program.command("agent").description("Agent mode: read JSON commands from stdin (for AI agents)").action(async () => {
  const executor = makeExecutor();
  process.stderr.write("Agent mode: reading JSON commands from stdin...\n");
  process.stderr.write("Agent mode not yet fully implemented in TS port.\n");
  process.exit(1);
});

export {
  program
};
//# sourceMappingURL=chunk-F2I4LLKZ.js.map