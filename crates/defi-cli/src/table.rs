use comfy_table::{Cell, Color, Table, presets::UTF8_FULL_CONDENSED};
use serde_json::Value;

/// Try to render a JSON value as a human-readable table.
/// Returns None if the shape isn't recognized.
pub fn render(value: &Value) -> Option<String> {
    // Detect by presence of key fields
    if value.get("alerts").is_some() && value.get("scan_duration_ms").is_some() {
        return Some(render_scan(value));
    }
    if value.get("holders").is_some() {
        return Some(render_whales(value));
    }
    if value.get("opportunities").is_some() && value.get("total_opportunities").is_some() {
        return Some(render_compare(value));
    }
    if value.get("arb_opportunities").is_some() && value.get("rates").is_some() {
        return Some(render_yield_scan(value));
    }
    if value.get("rates").is_some() && value.get("asset").is_some() {
        return Some(render_yield(value));
    }
    if value.get("chains").is_some() && value.get("total_alerts").is_some() {
        return Some(render_scan_all(value));
    }
    if value.get("chains").is_some() && value.get("chains_scanned").is_some() {
        return Some(render_positions(value));
    }
    if value.get("bridge").is_some() && value.get("amount_out").is_some() {
        return Some(render_bridge(value));
    }
    if value.get("aggregator").is_some() && value.get("amount_out").is_some() {
        return Some(render_swap(value));
    }
    if value.get("protocols").is_some() && value.get("summary").is_some() {
        return Some(render_status(value));
    }
    if value.get("token_balances").is_some() && value.get("lending_positions").is_some() {
        return Some(render_portfolio(value));
    }
    None
}

fn render_scan(v: &Value) -> String {
    let chain = v["chain"].as_str().unwrap_or("?");
    let ms = v["scan_duration_ms"].as_u64().unwrap_or(0);
    let count = v["alert_count"].as_u64().unwrap_or(0);
    let mut out = format!("  Scan: {} ({} ms)\n", chain, ms);

    if count > 0 {
        let mut t = Table::new();
        t.load_preset(UTF8_FULL_CONDENSED);
        t.set_header(vec![
            Cell::new("Severity").fg(Color::White),
            Cell::new("Pattern"),
            Cell::new("Asset"),
            Cell::new("Oracle"),
            Cell::new("DEX"),
            Cell::new("Gap"),
        ]);
        for a in v["alerts"].as_array().unwrap_or(&vec![]) {
            let sev = a["severity"].as_str().unwrap_or("?");
            let color = match sev {
                "critical" => Color::Red,
                "high" => Color::Yellow,
                _ => Color::Cyan,
            };
            t.add_row(vec![
                Cell::new(sev.to_uppercase()).fg(color),
                Cell::new(a["pattern"].as_str().unwrap_or("?")),
                Cell::new(a["asset"].as_str().unwrap_or("?")),
                Cell::new(format_price(a.get("oracle_price"))),
                Cell::new(format_price(a.get("dex_price"))),
                Cell::new(format!(
                    "{}%",
                    a["deviation_pct"]
                        .as_f64()
                        .map(|v| format!("{:.1}", v))
                        .unwrap_or_else(|| "?".into())
                )),
            ]);
        }
        out.push_str(&t.to_string());
    } else {
        out.push_str(&format!("  {} alerts\n", count));
    }

    // Data summary
    if let Some(data) = v.get("data") {
        let o = data
            .get("oracle_prices")
            .and_then(|v| v.as_object())
            .map(|m| m.len())
            .unwrap_or(0);
        let d = data
            .get("dex_prices")
            .and_then(|v| v.as_object())
            .map(|m| m.len())
            .unwrap_or(0);
        let s = data
            .get("stablecoin_pegs")
            .and_then(|v| v.as_object())
            .map(|m| m.len())
            .unwrap_or(0);
        out.push_str(&format!(
            "\n  Data: {} oracle, {} dex, {} stablecoin prices",
            o, d, s
        ));
    }
    out
}

fn render_scan_all(v: &Value) -> String {
    let total = v["total_alerts"].as_u64().unwrap_or(0);
    let scanned = v["chains_scanned"].as_u64().unwrap_or(0);
    let ms = v["scan_duration_ms"].as_u64().unwrap_or(0);
    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["Chain", "Alerts", "Time", "Details"]);

    for c in v["chains"].as_array().unwrap_or(&vec![]) {
        let name = c["chain"].as_str().unwrap_or("?");
        let alerts = c["alert_count"].as_u64().unwrap_or(0);
        let cms = c["scan_duration_ms"].as_u64().unwrap_or(0);
        let details: String = c["alerts"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .map(|a| a["asset"].as_str().unwrap_or("?").to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let color = if alerts > 0 {
            Color::Yellow
        } else {
            Color::Green
        };
        t.add_row(vec![
            Cell::new(name),
            Cell::new(alerts).fg(color),
            Cell::new(format!("{}ms", cms)),
            Cell::new(if details.is_empty() {
                "clean".into()
            } else {
                details
            }),
        ]);
    }
    format!(
        "  All-chain scan: {} chains, {} alerts, {}ms\n\n{}",
        scanned, total, ms, t
    )
}

fn render_whales(v: &Value) -> String {
    let chain = v["chain"].as_str().unwrap_or("?");
    let token = v["token"].as_str().unwrap_or("?");
    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["#", "Address", &format!("{} Balance", token)]);

    for h in v["holders"].as_array().unwrap_or(&vec![]) {
        let rank = h["rank"].as_u64().unwrap_or(0);
        let addr = h["address"].as_str().unwrap_or("?");
        let bal = h["balance"].as_f64().unwrap_or(0.0);
        let short_addr = if addr.len() > 18 {
            format!("{}...{}", &addr[..10], &addr[addr.len() - 6..])
        } else {
            addr.to_string()
        };
        t.add_row(vec![
            Cell::new(rank),
            Cell::new(short_addr),
            Cell::new(format!("{:.2}", bal)),
        ]);
    }
    format!("  {} {} Top Holders\n\n{}", chain, token, t)
}

fn render_yield(v: &Value) -> String {
    let chain = v["chain"].as_str().unwrap_or("?");
    let asset = v["asset"].as_str().unwrap_or("?");
    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["Protocol", "Supply APY", "Borrow APY"]);

    for r in v["rates"].as_array().unwrap_or(&vec![]) {
        let supply = r["supply_apy"].as_f64().unwrap_or(0.0);
        let borrow = r["borrow_variable_apy"].as_f64().unwrap_or(0.0);
        let color = if supply > 3.0 {
            Color::Green
        } else if supply > 1.0 {
            Color::Cyan
        } else {
            Color::White
        };
        t.add_row(vec![
            Cell::new(r["protocol"].as_str().unwrap_or("?")),
            Cell::new(format!("{:.2}%", supply)).fg(color),
            Cell::new(format!("{:.2}%", borrow)),
        ]);
    }
    let best = v["best_supply"].as_str().unwrap_or("?");
    format!(
        "  {} {} Yield Comparison (best: {})\n\n{}",
        chain, asset, best, t
    )
}

fn render_positions(v: &Value) -> String {
    let addr = v["address"].as_str().unwrap_or("?");
    let total = v
        .get("total_value_usd")
        .or(v.get("summary").and_then(|s| s.get("total_value_usd")))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let ms = v["scan_duration_ms"].as_u64().unwrap_or(0);
    let scanned = v["chains_scanned"].as_u64().unwrap_or(0);

    let mut out = format!(
        "  Positions for {}...{} ({}ms, {} chains)\n  Total: ${:.2}\n\n",
        &addr[..8],
        &addr[addr.len().saturating_sub(4)..],
        ms,
        scanned,
        total
    );

    for c in v["chains"].as_array().unwrap_or(&vec![]) {
        let chain = c["chain"].as_str().unwrap_or("?");
        let ctotal = c["chain_total_usd"].as_f64().unwrap_or(0.0);
        out.push_str(&format!("  {} (${:.2})\n", chain, ctotal));

        let mut t = Table::new();
        t.load_preset(UTF8_FULL_CONDENSED);
        t.set_header(vec!["Type", "Asset/Protocol", "Value"]);

        for b in c["token_balances"].as_array().unwrap_or(&vec![]) {
            t.add_row(vec![
                Cell::new("wallet"),
                Cell::new(b["symbol"].as_str().unwrap_or("?")),
                Cell::new(format!("${:.2}", b["value_usd"].as_f64().unwrap_or(0.0)))
                    .fg(Color::Green),
            ]);
        }
        for l in c["lending_positions"].as_array().unwrap_or(&vec![]) {
            let coll = l["collateral_usd"].as_f64().unwrap_or(0.0);
            let debt = l["debt_usd"].as_f64().unwrap_or(0.0);
            t.add_row(vec![
                Cell::new("lending"),
                Cell::new(l["protocol"].as_str().unwrap_or("?")),
                Cell::new(format!("coll ${:.0} debt ${:.0}", coll, debt)).fg(Color::Cyan),
            ]);
        }
        out.push_str(&format!("{}\n", t));
    }
    out
}

fn render_swap(v: &Value) -> String {
    let from = v["from"].as_str().unwrap_or("?");
    let to = v["to"].as_str().unwrap_or("?");
    let amt_in = v["amount_in"].as_f64().unwrap_or(0.0);
    let amt_out = v["amount_out"].as_f64().unwrap_or(0.0);
    let impact = v["price_impact_pct"]
        .as_f64()
        .map(|v| format!("{:.4}%", v))
        .unwrap_or_else(|| "n/a".into());
    let agg = v["aggregator"].as_str().unwrap_or("?");
    let chain = v["chain"].as_str().unwrap_or("?");

    format!(
        "  Swap on {} via {}\n\n  {} {} -> {:.6} {}\n  Price impact: {}\n",
        chain, agg, amt_in, from, amt_out, to, impact
    )
}

fn render_bridge(v: &Value) -> String {
    let from = v["from_chain"].as_str().unwrap_or("?");
    let to = v["to_chain"].as_str().unwrap_or("?");
    let token = v["token"].as_str().unwrap_or("?");
    let amt_in = v["amount_in"].as_f64().unwrap_or(0.0);
    let amt_out = v["amount_out"].as_f64().unwrap_or(0.0);
    let cost = v["total_cost_usd"].as_f64().unwrap_or(0.0);
    let time = v["estimated_time_sec"].as_u64().unwrap_or(0);
    let bridge = v["bridge"].as_str().unwrap_or("?");

    format!(
        "  Bridge {} -> {} via {}\n\n  {} {} -> {:.6} {}\n  Cost: ${:.2} | Time: {}s\n",
        from, to, bridge, amt_in, token, amt_out, token, cost, time
    )
}

fn render_status(v: &Value) -> String {
    let chain = v["chain"].as_str().unwrap_or("?");
    let total_p = v["summary"]["total_protocols"].as_u64().unwrap_or(0);
    let total_t = v["summary"]["total_tokens"].as_u64().unwrap_or(0);

    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["Protocol", "Category", "Interface"]);

    for p in v["protocols"].as_array().unwrap_or(&vec![]) {
        t.add_row(vec![
            Cell::new(p["name"].as_str().unwrap_or("?")),
            Cell::new(p["category"].as_str().unwrap_or("?")),
            Cell::new(p["interface"].as_str().unwrap_or("?")),
        ]);
    }

    let empty = vec![];
    let tokens: Vec<&str> = v["tokens"]
        .as_array()
        .unwrap_or(&empty)
        .iter()
        .filter_map(|t| t.as_str())
        .collect();

    let mut out = format!("  {} — {} protocols", chain, total_p);
    if !tokens.is_empty() {
        out.push_str(&format!(
            ", {} tokens\n  Tokens: {}",
            total_t,
            tokens.join(", ")
        ));
    }
    format!("{}\n\n{}", out, t)
}

fn render_compare(v: &Value) -> String {
    let asset = v["asset"].as_str().unwrap_or("?");
    let ms = v["scan_duration_ms"].as_u64().unwrap_or(0);
    let total = v["total_opportunities"].as_u64().unwrap_or(0);

    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["Type", "Asset", "APY", "Where", "Risk"]);

    let empty = vec![];
    for opp in v["opportunities"].as_array().unwrap_or(&empty) {
        let typ = opp["type"].as_str().unwrap_or("?");
        let apy = opp["apy"].as_f64().unwrap_or(0.0);
        let detail = opp["detail"].as_str().unwrap_or("?");
        let risk = opp["risk"].as_str().unwrap_or("?");
        let opp_asset = opp["asset"].as_str().unwrap_or("?");

        let type_label = match typ {
            "perp_funding" => "Perp Arb",
            "perp_rate" => "Perp Rate",
            "lending_supply" => "Lending",
            _ => typ,
        };

        let color = if apy.abs() > 20.0 {
            Color::Green
        } else if apy.abs() > 5.0 {
            Color::Cyan
        } else {
            Color::White
        };

        let risk_color = match risk {
            "high" => Color::Red,
            "medium" => Color::Yellow,
            _ => Color::Green,
        };

        t.add_row(vec![
            Cell::new(type_label),
            Cell::new(opp_asset),
            Cell::new(format!("{:.1}%", apy)).fg(color),
            Cell::new(detail),
            Cell::new(risk).fg(risk_color),
        ]);
    }

    format!(
        "  Yield Compare: {} ({} opportunities, {}ms)\n\n{}",
        asset, total, ms, t
    )
}

fn render_yield_scan(v: &Value) -> String {
    let asset = v["asset"].as_str().unwrap_or("?");
    let ms = v["scan_duration_ms"].as_u64().unwrap_or(0);
    let best = v["best_supply"].as_str().unwrap_or("?");

    let mut t = Table::new();
    t.load_preset(UTF8_FULL_CONDENSED);
    t.set_header(vec!["Chain", "Protocol", "Supply APY", "Borrow APY"]);

    for r in v["rates"].as_array().unwrap_or(&vec![]) {
        let supply = r["supply_apy"].as_f64().unwrap_or(0.0);
        let color = if supply > 3.0 {
            Color::Green
        } else if supply > 1.0 {
            Color::Cyan
        } else {
            Color::White
        };
        t.add_row(vec![
            Cell::new(r["chain"].as_str().unwrap_or("?")),
            Cell::new(r["protocol"].as_str().unwrap_or("?")),
            Cell::new(format!("{:.2}%", supply)).fg(color),
            Cell::new(format!(
                "{:.2}%",
                r["borrow_variable_apy"].as_f64().unwrap_or(0.0)
            )),
        ]);
    }

    let mut out = format!(
        "  {} Yield Scan ({}ms) — Best: {}\n\n{}",
        asset, ms, best, t
    );

    let empty_arbs = vec![];
    let arbs = v["arb_opportunities"].as_array().unwrap_or(&empty_arbs);
    if !arbs.is_empty() {
        let mut at = Table::new();
        at.load_preset(UTF8_FULL_CONDENSED);
        at.set_header(vec!["Spread", "Supply @", "Borrow @", "Type"]);
        for a in arbs {
            let spread = a["spread_pct"].as_f64().unwrap_or(0.0);
            let color = if spread > 1.0 {
                Color::Green
            } else {
                Color::Cyan
            };
            at.add_row(vec![
                Cell::new(format!("+{:.2}%", spread)).fg(color),
                Cell::new(format!(
                    "{} ({})",
                    a["supply_protocol"].as_str().unwrap_or("?"),
                    a["supply_chain"].as_str().unwrap_or("?")
                )),
                Cell::new(format!(
                    "{} ({})",
                    a["borrow_protocol"].as_str().unwrap_or("?"),
                    a["borrow_chain"].as_str().unwrap_or("?")
                )),
                Cell::new(a["strategy"].as_str().unwrap_or("?")),
            ]);
        }
        out.push_str(&format!("\n  Arb Opportunities\n\n{}", at));
    }
    out
}

fn render_portfolio(v: &Value) -> String {
    render_positions(v) // Same format
}

fn format_price(v: Option<&Value>) -> String {
    v.and_then(|v| v.as_f64())
        .map(|p| {
            if p > 1000.0 {
                format!("${:.0}", p)
            } else {
                format!("${:.4}", p)
            }
        })
        .unwrap_or_else(|| "?".into())
}
