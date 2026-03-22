/**
 * BigInt JSON serialization utilities.
 *
 * Rust's alloy U256 (backed by ruint) serializes to JSON as 0x-prefixed
 * lowercase hex strings (e.g., "0x75bcd15"). We must match this exactly
 * for behavioral parity.
 */

/** JSON replacer for Rust parity — bigint becomes 0x-hex string */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return "0x" + value.toString(16);
  }
  return value;
}

/** JSON replacer for SDK consumers — bigint becomes decimal string */
export function jsonReplacerDecimal(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

/** Stringify with decimal bigint handling */
export function jsonStringify(data: unknown, pretty = true): string {
  return pretty
    ? JSON.stringify(data, jsonReplacerDecimal, 2)
    : JSON.stringify(data, jsonReplacerDecimal);
}

/** Parse a 0x-hex or decimal string to bigint */
export function parseBigInt(value: string): bigint {
  if (value.startsWith("0x") || value.startsWith("0X")) {
    return BigInt(value);
  }
  return BigInt(value);
}
