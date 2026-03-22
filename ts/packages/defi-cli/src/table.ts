import pc from "picocolors";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Try to render a JSON value as a human-readable table. Returns null if shape isn't recognized. */
export function renderTable(value: JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const v = value as Record<string, JsonValue>;

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

// ---------------------------------------------------------------------------
// Simple table helpers (no external dep)
// ---------------------------------------------------------------------------

function makeTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").replace(/\x1b\[[0-9;]*m/g, "").length))
  );

  const sep = "┼" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┼";
  const topBorder = "┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const midBorder = "├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const botBorder = "└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  function padCell(text: string, width: number): string {
    const visLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
    return text + " ".repeat(Math.max(0, width - visLen));
  }

  const headerRow = "│ " + headers.map((h, i) => padCell(pc.bold(h), colWidths[i])).join(" │ ") + " │";
  const dataRows = rows.map(
    (row) => "│ " + row.map((cell, i) => padCell(cell ?? "", colWidths[i])).join(" │ ") + " │"
  );

  return [topBorder, headerRow, midBorder, ...dataRows, botBorder].join("\n");
}

function asStr(v: JsonValue | undefined): string {
  if (v === undefined || v === null) return "?";
  return String(v);
}

function asF64(v: JsonValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function asU64(v: JsonValue | undefined): number {
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}

function asArr(v: JsonValue | undefined): JsonValue[] {
  if (Array.isArray(v)) return v;
  return [];
}

function asObj(v: JsonValue | undefined): Record<string, JsonValue> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, JsonValue>;
  return {};
}

function formatPrice(v: JsonValue | undefined): string {
  const p = asF64(v);
  if (p === 0) return "?";
  return p > 1000 ? `$${p.toFixed(0)}` : `$${p.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderScan(v: Record<string, JsonValue>): string {
  const chain = asStr(v["chain"]);
  const ms = asU64(v["scan_duration_ms"]);
  const count = asU64(v["alert_count"]);
  let out = `  Scan: ${chain} (${ms} ms)\n`;

  if (count > 0) {
    const rows = asArr(v["alerts"]).map((a) => {
      const ao = asObj(a as JsonValue);
      const sev = asStr(ao["severity"]);
      const color = sev === "critical" ? pc.red : sev === "high" ? pc.yellow : pc.cyan;
      return [
        color(sev.toUpperCase()),
        asStr(ao["pattern"]),
        asStr(ao["asset"]),
        formatPrice(ao["oracle_price"]),
        formatPrice(ao["dex_price"]),
        `${asF64(ao["deviation_pct"]).toFixed(1)}%`,
      ];
    });
    out += makeTable(["Severity", "Pattern", "Asset", "Oracle", "DEX", "Gap"], rows);
  } else {
    out += `  ${count} alerts\n`;
  }

  const data = asObj(v["data"]);
  const o = Object.keys(asObj(data["oracle_prices"])).length;
  const d = Object.keys(asObj(data["dex_prices"])).length;
  const s = Object.keys(asObj(data["stablecoin_pegs"])).length;
  out += `\n  Data: ${o} oracle, ${d} dex, ${s} stablecoin prices`;
  return out;
}

function renderScanAll(v: Record<string, JsonValue>): string {
  const total = asU64(v["total_alerts"]);
  const scanned = asU64(v["chains_scanned"]);
  const ms = asU64(v["scan_duration_ms"]);

  const rows = asArr(v["chains"]).map((c) => {
    const co = asObj(c as JsonValue);
    const alerts = asU64(co["alert_count"]);
    const cms = asU64(co["scan_duration_ms"]);
    const details = asArr(co["alerts"])
      .map((a) => asStr(asObj(a as JsonValue)["asset"]))
      .join(", ") || "clean";
    const alertStr = alerts > 0 ? pc.yellow(String(alerts)) : pc.green(String(alerts));
    return [asStr(co["chain"]), alertStr, `${cms}ms`, details];
  });

  return `  All-chain scan: ${scanned} chains, ${total} alerts, ${ms}ms\n\n` +
    makeTable(["Chain", "Alerts", "Time", "Details"], rows);
}

function renderWhales(v: Record<string, JsonValue>): string {
  const chain = asStr(v["chain"]);
  const token = asStr(v["token"]);

  const rows = asArr(v["holders"]).map((h) => {
    const ho = asObj(h as JsonValue);
    const addr = asStr(ho["address"]);
    const short = addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr;
    return [String(asU64(ho["rank"])), short, asF64(ho["balance"]).toFixed(2)];
  });

  return `  ${chain} ${token} Top Holders\n\n` + makeTable(["#", "Address", `${token} Balance`], rows);
}

function renderYield(v: Record<string, JsonValue>): string {
  const chain = asStr(v["chain"]);
  const asset = asStr(v["asset"]);

  const rows = asArr(v["rates"]).map((r) => {
    const ro = asObj(r as JsonValue);
    const supply = asF64(ro["supply_apy"]);
    const borrow = asF64(ro["borrow_variable_apy"]);
    const color = supply > 3 ? pc.green : supply > 1 ? pc.cyan : (s: string) => s;
    return [asStr(ro["protocol"]), color(`${supply.toFixed(2)}%`), `${borrow.toFixed(2)}%`];
  });

  const best = asStr(v["best_supply"]);
  return `  ${chain} ${asset} Yield Comparison (best: ${best})\n\n` +
    makeTable(["Protocol", "Supply APY", "Borrow APY"], rows);
}

function renderPositions(v: Record<string, JsonValue>): string {
  const addr = asStr(v["address"]);
  const summary = asObj(v["summary"]);
  const total = asF64(v["total_value_usd"] ?? summary["total_value_usd"]);
  const ms = asU64(v["scan_duration_ms"]);
  const scanned = asU64(v["chains_scanned"]);

  let out = `  Positions for ${addr.slice(0, 8)}...${addr.slice(-4)} (${ms}ms, ${scanned} chains)\n  Total: $${total.toFixed(2)}\n\n`;

  for (const c of asArr(v["chains"])) {
    const co = asObj(c as JsonValue);
    const chain = asStr(co["chain"]);
    const ctotal = asF64(co["chain_total_usd"]);
    out += `  ${chain} ($${ctotal.toFixed(2)})\n`;

    const rows: string[][] = [];
    for (const b of asArr(co["token_balances"])) {
      const bo = asObj(b as JsonValue);
      rows.push(["wallet", asStr(bo["symbol"]), pc.green(`$${asF64(bo["value_usd"]).toFixed(2)}`)]);
    }
    for (const l of asArr(co["lending_positions"])) {
      const lo = asObj(l as JsonValue);
      const coll = asF64(lo["collateral_usd"]);
      const debt = asF64(lo["debt_usd"]);
      rows.push(["lending", asStr(lo["protocol"]), pc.cyan(`coll $${coll.toFixed(0)} debt $${debt.toFixed(0)}`)]);
    }
    out += makeTable(["Type", "Asset/Protocol", "Value"], rows) + "\n";
  }
  return out;
}

function renderSwap(v: Record<string, JsonValue>): string {
  const from = asStr(v["from"]);
  const to = asStr(v["to"]);
  const amtIn = asF64(v["amount_in"]);
  const amtOut = asF64(v["amount_out"]);
  const impact = typeof v["price_impact_pct"] === "number"
    ? `${asF64(v["price_impact_pct"]).toFixed(4)}%`
    : "n/a";
  const agg = asStr(v["aggregator"]);
  const chain = asStr(v["chain"]);
  return `  Swap on ${chain} via ${agg}\n\n  ${amtIn} ${from} -> ${amtOut.toFixed(6)} ${to}\n  Price impact: ${impact}\n`;
}

function renderBridge(v: Record<string, JsonValue>): string {
  const from = asStr(v["from_chain"]);
  const to = asStr(v["to_chain"]);
  const token = asStr(v["token"]);
  const amtIn = asF64(v["amount_in"]);
  const amtOut = asF64(v["amount_out"]);
  const cost = asF64(v["total_cost_usd"]);
  const time = asU64(v["estimated_time_sec"]);
  const bridge = asStr(v["bridge"]);
  return `  Bridge ${from} -> ${to} via ${bridge}\n\n  ${amtIn} ${token} -> ${amtOut.toFixed(6)} ${token}\n  Cost: $${cost.toFixed(2)} | Time: ${time}s\n`;
}

function renderStatus(v: Record<string, JsonValue>): string {
  const chain = asStr(v["chain"]);
  const summary = asObj(v["summary"]);
  const totalP = asU64(summary["total_protocols"]);
  const totalT = asU64(summary["total_tokens"]);

  const rows = asArr(v["protocols"]).map((p) => {
    const po = asObj(p as JsonValue);
    return [asStr(po["name"]), asStr(po["category"]), asStr(po["interface"])];
  });

  const tokens = asArr(v["tokens"]).map((t) => String(t)).filter(Boolean);
  let out = `  ${chain} — ${totalP} protocols`;
  if (tokens.length > 0) {
    out += `, ${totalT} tokens\n  Tokens: ${tokens.join(", ")}`;
  }
  return `${out}\n\n` + makeTable(["Protocol", "Category", "Interface"], rows);
}

function renderCompare(v: Record<string, JsonValue>): string {
  const asset = asStr(v["asset"]);
  const ms = asU64(v["scan_duration_ms"]);
  const total = asU64(v["total_opportunities"]);

  const rows = asArr(v["opportunities"]).map((opp) => {
    const oo = asObj(opp as JsonValue);
    const typ = asStr(oo["type"]);
    const apy = asF64(oo["apy"]);
    const detail = asStr(oo["detail"]);
    const risk = asStr(oo["risk"]);
    const oppAsset = asStr(oo["asset"]);

    const typeLabel = typ === "perp_funding" ? "Perp Arb"
      : typ === "perp_rate" ? "Perp Rate"
      : typ === "lending_supply" ? "Lending"
      : typ;

    const apyColor = Math.abs(apy) > 20 ? pc.green : Math.abs(apy) > 5 ? pc.cyan : (s: string) => s;
    const riskColor = risk === "high" ? pc.red : risk === "medium" ? pc.yellow : pc.green;

    return [typeLabel, oppAsset, apyColor(`${apy.toFixed(1)}%`), detail, riskColor(risk)];
  });

  return `  Yield Compare: ${asset} (${total} opportunities, ${ms}ms)\n\n` +
    makeTable(["Type", "Asset", "APY", "Where", "Risk"], rows);
}

function renderYieldScan(v: Record<string, JsonValue>): string {
  const asset = asStr(v["asset"]);
  const ms = asU64(v["scan_duration_ms"]);
  const best = asStr(v["best_supply"]);

  const rows = asArr(v["rates"]).map((r) => {
    const ro = asObj(r as JsonValue);
    const supply = asF64(ro["supply_apy"]);
    const borrow = asF64(ro["borrow_variable_apy"]);
    const color = supply > 3 ? pc.green : supply > 1 ? pc.cyan : (s: string) => s;
    return [asStr(ro["chain"]), asStr(ro["protocol"]), color(`${supply.toFixed(2)}%`), `${borrow.toFixed(2)}%`];
  });

  let out = `  ${asset} Yield Scan (${ms}ms) — Best: ${best}\n\n` +
    makeTable(["Chain", "Protocol", "Supply APY", "Borrow APY"], rows);

  const arbs = asArr(v["arb_opportunities"]);
  if (arbs.length > 0) {
    const arbRows = arbs.map((a) => {
      const ao = asObj(a as JsonValue);
      const spread = asF64(ao["spread_pct"]);
      const color = spread > 1 ? pc.green : pc.cyan;
      return [
        color(`+${spread.toFixed(2)}%`),
        `${asStr(ao["supply_protocol"])} (${asStr(ao["supply_chain"])})`,
        `${asStr(ao["borrow_protocol"])} (${asStr(ao["borrow_chain"])})`,
        asStr(ao["strategy"]),
      ];
    });
    out += "\n  Arb Opportunities\n\n" + makeTable(["Spread", "Supply @", "Borrow @", "Type"], arbRows);
  }

  return out;
}

function renderPortfolio(v: Record<string, JsonValue>): string {
  return renderPositions(v);
}
