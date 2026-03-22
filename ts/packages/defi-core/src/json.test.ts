import { describe, it, expect } from "vitest";
import { jsonStringify, jsonReplacer, jsonReplacerDecimal, parseBigInt } from "./json.js";

describe("jsonReplacer (hex mode)", () => {
  it("serializes bigint as 0x-hex string", () => {
    expect(jsonReplacer("amount", 123456789n)).toBe("0x75bcd15");
  });

  it("serializes zero as 0x0", () => {
    expect(jsonReplacer("val", 0n)).toBe("0x0");
  });

  it("passes through non-bigint values", () => {
    expect(jsonReplacer("name", "hello")).toBe("hello");
    expect(jsonReplacer("count", 42)).toBe(42);
    expect(jsonReplacer("flag", true)).toBe(true);
  });
});

describe("jsonReplacerDecimal", () => {
  it("serializes bigint as decimal string", () => {
    expect(jsonReplacerDecimal("amount", 123456789n)).toBe("123456789");
  });
});

describe("jsonStringify", () => {
  it("handles objects with bigint fields (hex)", () => {
    const obj = { amount: 123456789n, name: "test" };
    const result = jsonStringify(obj);
    const parsed = JSON.parse(result);
    expect(parsed.amount).toBe("0x75bcd15");
    expect(parsed.name).toBe("test");
  });

  it("handles nested bigint values", () => {
    const obj = { token: { amount: 1000000000000000000n } };
    const result = jsonStringify(obj);
    const parsed = JSON.parse(result);
    expect(parsed.token.amount).toBe("0xde0b6b3a7640000");
  });
});

describe("parseBigInt", () => {
  it("parses hex strings", () => {
    expect(parseBigInt("0x75bcd15")).toBe(123456789n);
  });

  it("parses decimal strings", () => {
    expect(parseBigInt("123456789")).toBe(123456789n);
  });
});
