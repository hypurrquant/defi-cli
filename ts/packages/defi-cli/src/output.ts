import { jsonStringify } from "@hypurrquant/defi-core";
import { renderTable } from "./table.js";

export interface OutputMode {
  json: boolean;
  ndjson: boolean;
  fields?: string[];
}

export function parseOutputMode(opts: {
  json?: boolean;
  ndjson?: boolean;
  fields?: string;
}): OutputMode {
  return {
    json: !!(opts.json || opts.ndjson),
    ndjson: !!opts.ndjson,
    fields: opts.fields
      ? opts.fields.split(",").map((f) => f.trim())
      : undefined,
  };
}

export function formatOutput(value: unknown, mode: OutputMode): string {
  if (mode.ndjson) {
    return JSON.stringify(value, jsonReplacer);
  }

  if (mode.json) {
    let jsonVal = JSON.parse(jsonStringify(value));

    if (mode.fields && typeof jsonVal === "object" && jsonVal !== null && !Array.isArray(jsonVal)) {
      const filtered: Record<string, unknown> = {};
      for (const key of mode.fields) {
        if (key in jsonVal) filtered[key] = jsonVal[key];
      }
      jsonVal = filtered;
    }

    return JSON.stringify(jsonVal, null, 2);
  }

  // Human-readable: try table format, fallback to pretty JSON
  const jsonVal = JSON.parse(jsonStringify(value));
  const table = renderTable(jsonVal);
  if (table !== null) return table;
  return JSON.stringify(jsonVal, null, 2);
}

export function printOutput(value: unknown, mode: OutputMode): void {
  console.log(formatOutput(value, mode));
}

function jsonReplacer(_key: string, val: unknown): unknown {
  if (typeof val === "bigint") return "0x" + val.toString(16);
  return val;
}
