import { describe, it, expect } from "vitest";
import { parseOutputMode, formatOutput } from "./output.js";

describe("parseOutputMode", () => {
  it("defaults to non-json", () => {
    expect(parseOutputMode({})).toEqual({ json: false, ndjson: false, fields: undefined });
  });

  it("json flag sets json=true, ndjson=false", () => {
    expect(parseOutputMode({ json: true })).toMatchObject({ json: true, ndjson: false });
  });

  it("ndjson flag implies json=true", () => {
    expect(parseOutputMode({ ndjson: true })).toMatchObject({ json: true, ndjson: true });
  });

  it("fields are split on comma and trimmed", () => {
    expect(parseOutputMode({ json: true, fields: "a, b ,c" }).fields).toEqual(["a", "b", "c"]);
  });
});

describe("formatOutput", () => {
  it("ndjson emits single-line JSON", () => {
    const out = formatOutput({ a: 1, b: 2 }, { json: true, ndjson: true });
    expect(out).toBe('{"a":1,"b":2}');
  });

  it("json emits pretty 2-space indented JSON", () => {
    const out = formatOutput({ a: 1 }, { json: true, ndjson: false });
    expect(out).toContain('\n  "a": 1');
  });

  it("json+fields filters keys", () => {
    const out = formatOutput(
      { a: 1, b: 2, c: 3 },
      { json: true, ndjson: false, fields: ["a", "c"] },
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ a: 1, c: 3 });
  });
});
