import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "smol-toml";

export interface WhitelistEntry {
  chain: string;
  protocol: string;
  pool?: string;       // pool name or address (for LP)
  asset?: string;      // asset symbol (for lending)
  type: "lb" | "gauge" | "farming" | "lending";
  max_allocation_pct: number;
}

export function loadWhitelist(): WhitelistEntry[] {
  const path = resolve(process.env["HOME"] ?? "~", ".defi", "pools.toml");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw) as { whitelist?: WhitelistEntry[] };
    return parsed.whitelist ?? [];
  } catch {
    return []; // No whitelist file = empty
  }
}
