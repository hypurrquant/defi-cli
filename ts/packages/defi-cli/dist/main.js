#!/usr/bin/env node

// src/main.ts
import { config } from "dotenv";
import { resolve as resolve4 } from "path";

// src/cli.ts
import { Command } from "commander";
import { createRequire } from "module";

// src/executor.ts
import { createPublicClient as createPublicClient2, createWalletClient, http as http2, parseAbi as parseAbi3, encodeFunctionData as encodeFunctionData3 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ../defi-core/dist/index.js
import { encodeFunctionData, parseAbi } from "viem";
import { createPublicClient, http } from "viem";
import { encodeFunctionData as encodeFunctionData2, decodeFunctionResult, parseAbi as parseAbi2 } from "viem";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/util.js
function isEscaped(str, ptr) {
  let i = 0;
  while (str[ptr - ++i] === "\\")
    ;
  return --i && i % 2;
}
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && isEscaped(str, seek));
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{2,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "	",
  n: "\n",
  f: "\f",
  r: "\r",
  e: "\x1B",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === "\n")
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === "\n" || c === "\r" && str[ptr] === "\n") {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "x" || c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "x" ? 2 : c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === "\n" || c === " " || c === "	" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== "\n" && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr);
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== "\n" && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// ../defi-core/dist/index.js
import { existsSync } from "fs";
var TxStatus = /* @__PURE__ */ ((TxStatus2) => {
  TxStatus2["DryRun"] = "dry_run";
  TxStatus2["Simulated"] = "simulated";
  TxStatus2["SimulationFailed"] = "simulation_failed";
  TxStatus2["NeedsApproval"] = "needs_approval";
  TxStatus2["Pending"] = "pending";
  TxStatus2["Confirmed"] = "confirmed";
  TxStatus2["Failed"] = "failed";
  return TxStatus2;
})(TxStatus || {});
var InterestRateMode = /* @__PURE__ */ ((InterestRateMode2) => {
  InterestRateMode2["Variable"] = "variable";
  InterestRateMode2["Stable"] = "stable";
  return InterestRateMode2;
})(InterestRateMode || {});
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
function jsonReplacerDecimal(_key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
function jsonStringify(data, pretty = true) {
  return pretty ? JSON.stringify(data, jsonReplacerDecimal, 2) : JSON.stringify(data, jsonReplacerDecimal);
}
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
var providerCache = /* @__PURE__ */ new Map();
function getProvider(rpcUrl) {
  const cached = providerCache.get(rpcUrl);
  if (cached) return cached;
  const client = createPublicClient({ transport: http(rpcUrl) });
  providerCache.set(rpcUrl, client);
  return client;
}
var MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
var multicall3Abi = parseAbi2([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) returns (Result[] returnData)"
]);
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
var __dirname = fileURLToPath(new URL(".", import.meta.url));
function findConfigDir() {
  const candidates = [
    resolve(__dirname, "../../../config"),
    // from dist/registry/ (monorepo build)
    resolve(__dirname, "../../../../config"),
    // from src/registry/ (vitest)
    resolve(__dirname, "../config"),
    // from dist/ (npm bundle — config at package root)
    resolve(__dirname, "../../config")
    // from dist/subdir (npm bundle variant)
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
  /**
   * Resolve a pool by name (e.g. "WHYPE/USDC") from a protocol's pool list.
   * Returns the pool info or throws if not found.
   */
  resolvePool(protocolSlug, poolName) {
    const protocol = this.getProtocol(protocolSlug);
    if (!protocol.pools || protocol.pools.length === 0) {
      throw new Error(`Protocol ${protocol.name} has no pools configured`);
    }
    const pool = protocol.pools.find(
      (p) => p.name.toLowerCase() === poolName.toLowerCase()
    );
    if (!pool) {
      const available = protocol.pools.map((p) => p.name).join(", ");
      throw new Error(`Pool '${poolName}' not found in ${protocol.name}. Available: ${available}`);
    }
    return pool;
  }
};

// src/executor.ts
var ERC20_ABI = parseAbi3([
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
]);
var GAS_BUFFER_BPS = 12000n;
var DEFAULT_PRIORITY_FEE_WEI = 20000000000n;
var MAX_GAS_LIMIT = 5000000000n;
var Executor = class _Executor {
  dryRun;
  rpcUrl;
  explorerUrl;
  constructor(broadcast, rpcUrl, explorerUrl) {
    this.dryRun = !broadcast;
    this.rpcUrl = rpcUrl;
    this.explorerUrl = explorerUrl;
  }
  /** Apply 20% buffer to a gas estimate */
  static applyGasBuffer(gas) {
    return gas * GAS_BUFFER_BPS / 10000n;
  }
  /**
   * Check allowance for a single token/spender pair and send an approve tx if needed.
   * Only called in broadcast mode (not dry-run).
   */
  async checkAndApprove(token, spender, amount, owner, publicClient, walletClient) {
    const allowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender]
    });
    if (allowance >= amount) return;
    process.stderr.write(
      `  Approving ${amount} of ${token} for ${spender}...
`
    );
    const approveData = encodeFunctionData3({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount]
    });
    const rpcUrl = this.rpcUrl;
    const gasLimit = await (async () => {
      try {
        const estimated = await publicClient.estimateGas({
          to: token,
          data: approveData,
          account: owner
        });
        const buffered = _Executor.applyGasBuffer(estimated);
        return buffered > MAX_GAS_LIMIT ? MAX_GAS_LIMIT : buffered;
      } catch {
        return 80000n;
      }
    })();
    const [maxFeePerGas, maxPriorityFeePerGas] = await this.fetchEip1559Fees(rpcUrl);
    const approveTxHash = await walletClient.sendTransaction({
      chain: null,
      account: walletClient.account,
      to: token,
      data: approveData,
      gas: gasLimit > 0n ? gasLimit : void 0,
      maxFeePerGas: maxFeePerGas > 0n ? maxFeePerGas : void 0,
      maxPriorityFeePerGas: maxPriorityFeePerGas > 0n ? maxPriorityFeePerGas : void 0
    });
    const approveTxUrl = this.explorerUrl ? `${this.explorerUrl}/tx/${approveTxHash}` : void 0;
    process.stderr.write(`  Approve tx: ${approveTxHash}
`);
    if (approveTxUrl) process.stderr.write(`  Explorer: ${approveTxUrl}
`);
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    process.stderr.write(
      `  Approved ${amount} of ${token} for ${spender}
`
    );
  }
  /** Fetch EIP-1559 fee params from the network. Returns [maxFeePerGas, maxPriorityFeePerGas]. */
  async fetchEip1559Fees(rpcUrl) {
    try {
      const client = createPublicClient2({ transport: http2(rpcUrl) });
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
      const client = createPublicClient2({ transport: http2(rpcUrl) });
      const estimated = await client.estimateGas({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        account: from
      });
      if (estimated > 0n) {
        const buffered = _Executor.applyGasBuffer(estimated);
        return buffered > MAX_GAS_LIMIT ? MAX_GAS_LIMIT : buffered;
      }
    } catch {
      if (tx.gas_estimate) {
        return _Executor.applyGasBuffer(BigInt(tx.gas_estimate));
      }
    }
    return 0n;
  }
  /** Simulate a transaction via eth_call + eth_estimateGas */
  async simulate(tx) {
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL \u2014 cannot simulate. Set HYPEREVM_RPC_URL.");
    }
    const client = createPublicClient2({ transport: http2(rpcUrl) });
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    const from = privateKey ? privateKeyToAccount(privateKey).address : "0x0000000000000000000000000000000000000001";
    if (tx.approvals && tx.approvals.length > 0) {
      const pendingApprovals = [];
      for (const approval of tx.approvals) {
        try {
          const allowance = await client.readContract({
            address: approval.token,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [from, approval.spender]
          });
          if (allowance < approval.amount) {
            pendingApprovals.push({
              token: approval.token,
              spender: approval.spender,
              needed: approval.amount.toString(),
              current: allowance.toString()
            });
          }
        } catch {
        }
      }
      if (pendingApprovals.length > 0) {
        return {
          tx_hash: void 0,
          status: TxStatus.NeedsApproval,
          gas_used: tx.gas_estimate,
          description: tx.description,
          details: {
            to: tx.to,
            from,
            data: tx.data,
            value: tx.value.toString(),
            mode: "simulated",
            result: "needs_approval",
            pending_approvals: pendingApprovals,
            hint: "Use --broadcast to auto-approve and execute"
          }
        };
      }
    }
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
    const publicClient = createPublicClient2({ transport: http2(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http2(rpcUrl) });
    if (tx.pre_txs && tx.pre_txs.length > 0) {
      for (const preTx of tx.pre_txs) {
        process.stderr.write(`  Pre-tx: ${preTx.description}...
`);
        const preGas = await this.estimateGasWithBuffer(rpcUrl, preTx, account.address);
        const preTxHash = await walletClient.sendTransaction({
          chain: null,
          to: preTx.to,
          data: preTx.data,
          value: preTx.value,
          gas: preGas > 0n ? preGas : void 0
        });
        const preTxUrl = this.explorerUrl ? `${this.explorerUrl}/tx/${preTxHash}` : void 0;
        process.stderr.write(`  Pre-tx sent: ${preTxHash}
`);
        if (preTxUrl) process.stderr.write(`  Explorer: ${preTxUrl}
`);
        const preReceipt = await publicClient.waitForTransactionReceipt({ hash: preTxHash });
        if (preReceipt.status !== "success") {
          throw new DefiError("TX_FAILED", `Pre-transaction failed: ${preTx.description}`);
        }
        process.stderr.write(`  Pre-tx confirmed
`);
      }
    }
    if (tx.approvals && tx.approvals.length > 0) {
      for (const approval of tx.approvals) {
        await this.checkAndApprove(
          approval.token,
          approval.spender,
          approval.amount,
          account.address,
          publicClient,
          walletClient
        );
      }
    }
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
    const txUrl = this.explorerUrl ? `${this.explorerUrl}/tx/${txHash}` : void 0;
    process.stderr.write(`Transaction sent: ${txHash}
`);
    if (txUrl) process.stderr.write(`Explorer: ${txUrl}
`);
    process.stderr.write("Waiting for confirmation...\n");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const status = receipt.status === "success" ? "confirmed" : "failed";
    let mintedTokenId;
    if (receipt.status === "success" && receipt.logs) {
      const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
      for (const log of receipt.logs) {
        if (log.topics.length >= 4 && log.topics[0] === TRANSFER_TOPIC && log.topics[1] === ZERO_TOPIC) {
          mintedTokenId = BigInt(log.topics[3]).toString();
          break;
        }
      }
    }
    const details = {
      to: tx.to,
      from: account.address,
      block_number: receipt.blockNumber?.toString(),
      gas_limit: gasLimit.toString(),
      gas_used: receipt.gasUsed?.toString(),
      explorer_url: txUrl,
      mode: "broadcast"
    };
    if (mintedTokenId) {
      details.minted_token_id = mintedTokenId;
      process.stderr.write(`  Minted NFT tokenId: ${mintedTokenId}
`);
    }
    return {
      tx_hash: txHash,
      status,
      gas_used: receipt.gasUsed ? Number(receipt.gasUsed) : void 0,
      description: tx.description,
      details
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

// src/commands/status.ts
import { createPublicClient as createPublicClient3, http as http3 } from "viem";
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
      const client = createPublicClient3({ transport: http3(rpcUrl) });
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

// ../defi-protocols/dist/index.js
import { encodeFunctionData as encodeFunctionData4, parseAbi as parseAbi4, createPublicClient as createPublicClient4, http as http4, decodeAbiParameters } from "viem";
import { encodeFunctionData as encodeFunctionData22, parseAbi as parseAbi22, createPublicClient as createPublicClient22, http as http22, decodeFunctionResult as decodeFunctionResult2, decodeAbiParameters as decodeAbiParameters2 } from "viem";
import { encodeFunctionData as encodeFunctionData32, parseAbi as parseAbi32, createPublicClient as createPublicClient32, http as http32, decodeAbiParameters as decodeAbiParameters3, concatHex, zeroAddress } from "viem";
import { encodeFunctionData as encodeFunctionData42, parseAbi as parseAbi42, zeroAddress as zeroAddress2 } from "viem";
import { encodeFunctionData as encodeFunctionData5, parseAbi as parseAbi5 } from "viem";
import { encodeFunctionData as encodeFunctionData6, parseAbi as parseAbi6, decodeAbiParameters as decodeAbiParameters4 } from "viem";
import { encodeFunctionData as encodeFunctionData7, parseAbi as parseAbi7, createPublicClient as createPublicClient42, http as http42, zeroAddress as zeroAddress3 } from "viem";
import { createPublicClient as createPublicClient5, encodeFunctionData as encodeFunctionData8, http as http5, parseAbi as parseAbi8, zeroAddress as zeroAddress4 } from "viem";
import { encodeFunctionData as encodeFunctionData9, parseAbi as parseAbi9, zeroAddress as zeroAddress5 } from "viem";
import { encodeFunctionData as encodeFunctionData10, parseAbi as parseAbi10, createPublicClient as createPublicClient6, http as http6 } from "viem";
import {
  encodeFunctionData as encodeFunctionData11,
  decodeFunctionResult as decodeFunctionResult22,
  parseAbi as parseAbi11,
  createPublicClient as createPublicClient7,
  http as http7
} from "viem";
import {
  createPublicClient as createPublicClient8,
  decodeAbiParameters as decodeAbiParameters5,
  encodeFunctionData as encodeFunctionData12,
  encodeAbiParameters,
  http as http8,
  keccak256,
  parseAbi as parseAbi12
} from "viem";
import { createPublicClient as createPublicClient9, http as http9, parseAbi as parseAbi13, encodeFunctionData as encodeFunctionData13, decodeFunctionResult as decodeFunctionResult3, zeroAddress as zeroAddress6 } from "viem";
import { createPublicClient as createPublicClient10, http as http10, parseAbi as parseAbi14, encodeFunctionData as encodeFunctionData14, zeroAddress as zeroAddress7 } from "viem";
import { createPublicClient as createPublicClient11, http as http11, parseAbi as parseAbi15 } from "viem";
import { createPublicClient as createPublicClient12, http as http12, parseAbi as parseAbi16, encodeFunctionData as encodeFunctionData15 } from "viem";
import { createPublicClient as createPublicClient13, http as http13, parseAbi as parseAbi17, encodeFunctionData as encodeFunctionData16 } from "viem";
import { createPublicClient as createPublicClient14, http as http14, parseAbi as parseAbi18, encodeFunctionData as encodeFunctionData17 } from "viem";
import { parseAbi as parseAbi19, encodeFunctionData as encodeFunctionData18, decodeFunctionResult as decodeFunctionResult4, zeroAddress as zeroAddress8 } from "viem";
import { createPublicClient as createPublicClient15, http as http15, parseAbi as parseAbi20, encodeFunctionData as encodeFunctionData19, zeroAddress as zeroAddress9 } from "viem";
import { createPublicClient as createPublicClient16, http as http16, parseAbi as parseAbi21 } from "viem";
import { createPublicClient as createPublicClient17, http as http17, parseAbi as parseAbi222, encodeFunctionData as encodeFunctionData20 } from "viem";
import { parseAbi as parseAbi23, encodeFunctionData as encodeFunctionData21 } from "viem";
import { createPublicClient as createPublicClient18, http as http18, parseAbi as parseAbi24, encodeFunctionData as encodeFunctionData222, zeroAddress as zeroAddress10 } from "viem";
import { createPublicClient as createPublicClient19, http as http19, parseAbi as parseAbi25, encodeFunctionData as encodeFunctionData23, zeroAddress as zeroAddress11 } from "viem";
import { parseAbi as parseAbi26, encodeFunctionData as encodeFunctionData24 } from "viem";
import { parseAbi as parseAbi27, encodeFunctionData as encodeFunctionData25 } from "viem";
import { createPublicClient as createPublicClient20, http as http20, parseAbi as parseAbi28 } from "viem";
import { createPublicClient as createPublicClient21, encodeFunctionData as encodeFunctionData26, http as http21, parseAbi as parseAbi29, zeroAddress as zeroAddress12 } from "viem";
var DEFAULT_FEE = 3e3;
var swapRouterAbi = parseAbi4([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var quoterAbi = parseAbi4([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
]);
var ramsesQuoterAbi = parseAbi4([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; int24 tickSpacing; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
]);
var positionManagerAbi = parseAbi4([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var UniswapV3Adapter = class {
  protocolName;
  router;
  quoter;
  positionManager;
  factory;
  fee;
  rpcUrl;
  useTickSpacingQuoter;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.quoter = entry.contracts?.["quoter"];
    this.positionManager = entry.contracts?.["position_manager"];
    this.factory = entry.contracts?.["factory"];
    this.fee = DEFAULT_FEE;
    this.rpcUrl = rpcUrl;
    this.useTickSpacingQuoter = entry.contracts?.["pool_deployer"] !== void 0 || entry.contracts?.["gauge_factory"] !== void 0;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const amountOutMinimum = 0n;
    const data = encodeFunctionData4({
      abi: swapRouterAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.token_in,
          tokenOut: params.token_out,
          fee: this.fee,
          recipient: params.recipient,
          deadline,
          amountIn: params.amount_in,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (this.quoter) {
      const client2 = createPublicClient4({ transport: http4(this.rpcUrl) });
      if (this.useTickSpacingQuoter) {
        const tickSpacings = [1, 10, 50, 100, 200];
        const tsResults = await Promise.allSettled(
          tickSpacings.map(async (ts) => {
            const result = await client2.call({
              to: this.quoter,
              data: encodeFunctionData4({
                abi: ramsesQuoterAbi,
                functionName: "quoteExactInputSingle",
                args: [
                  {
                    tokenIn: params.token_in,
                    tokenOut: params.token_out,
                    amountIn: params.amount_in,
                    tickSpacing: ts,
                    sqrtPriceLimitX96: 0n
                  }
                ]
              })
            });
            if (!result.data) return { amountOut: 0n, tickSpacing: ts };
            const [amountOut2] = decodeAbiParameters(
              [{ name: "amountOut", type: "uint256" }],
              result.data
            );
            return { amountOut: amountOut2, tickSpacing: ts };
          })
        );
        let best2 = { amountOut: 0n, tickSpacing: 50 };
        for (const r of tsResults) {
          if (r.status === "fulfilled" && r.value.amountOut > best2.amountOut) {
            best2 = r.value;
          }
        }
        if (best2.amountOut > 0n) {
          return {
            protocol: this.protocolName,
            amount_out: best2.amountOut,
            price_impact_bps: void 0,
            fee_bps: void 0,
            route: [`${params.token_in} -> ${params.token_out} (tickSpacing: ${best2.tickSpacing})`]
          };
        }
        throw DefiError.rpcError(
          `[${this.protocolName}] No quote available \u2014 pool exists but has zero liquidity for this pair`
        );
      }
      const feeTiers = [500, 3e3, 1e4, 100];
      const results = await Promise.allSettled(
        feeTiers.map(async (fee) => {
          const result = await client2.call({
            to: this.quoter,
            data: encodeFunctionData4({
              abi: quoterAbi,
              functionName: "quoteExactInputSingle",
              args: [
                {
                  tokenIn: params.token_in,
                  tokenOut: params.token_out,
                  amountIn: params.amount_in,
                  fee,
                  sqrtPriceLimitX96: 0n
                }
              ]
            })
          });
          if (!result.data) return { amountOut: 0n, fee };
          const [amountOut2] = decodeAbiParameters(
            [{ name: "amountOut", type: "uint256" }],
            result.data
          );
          return { amountOut: amountOut2, fee };
        })
      );
      let best = { amountOut: 0n, fee: 3e3 };
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.amountOut > best.amountOut) {
          best = r.value;
        }
      }
      if (best.amountOut > 0n) {
        return {
          protocol: this.protocolName,
          amount_out: best.amountOut,
          price_impact_bps: void 0,
          fee_bps: Math.floor(best.fee / 10),
          route: [`${params.token_in} -> ${params.token_out} (fee: ${best.fee})`]
        };
      }
    }
    const client = createPublicClient4({ transport: http4(this.rpcUrl) });
    const callData = encodeFunctionData4({
      abi: swapRouterAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.token_in,
          tokenOut: params.token_out,
          fee: this.fee,
          recipient: "0x0000000000000000000000000000000000000001",
          deadline: BigInt("18446744073709551615"),
          amountIn: params.amount_in,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    let output;
    try {
      const result = await client.call({ to: this.router, data: callData });
      output = result.data;
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("STF") || errMsg.includes("insufficient")) {
        throw DefiError.unsupported(
          `[${this.protocolName}] quote unavailable \u2014 no quoter contract configured. Swap simulation requires token balance. Add a quoter address to the protocol config.`
        );
      }
      throw DefiError.rpcError(`[${this.protocolName}] swap simulation for quote failed: ${errMsg}`);
    }
    const amountOut = output && output.length >= 66 ? BigInt(output.slice(0, 66)) : 0n;
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: Math.floor(this.fee / 10),
      route: [`${params.token_in} -> ${params.token_out} (simulated)`]
    };
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError("CONTRACT_ERROR", "Position manager address not configured");
    }
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
    const amount0 = rawAmount0 === 0n && rawAmount1 > 0n ? 1n : rawAmount0;
    const amount1 = rawAmount1 === 0n && rawAmount0 > 0n ? 1n : rawAmount1;
    const data = encodeFunctionData4({
      abi: positionManagerAbi,
      functionName: "mint",
      args: [
        {
          token0,
          token1,
          fee: this.fee,
          tickLower: -887220,
          tickUpper: 887220,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: params.recipient,
          deadline: BigInt("18446744073709551615")
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 5e5,
      approvals: [
        { token: token0, spender: pm, amount: amount0 },
        { token: token1, spender: pm, amount: amount1 }
      ]
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId \u2014 use NFT position manager directly`
    );
  }
};
var abi = parseAbi22([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)"
]);
var lbQuoterAbi = parseAbi22([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
]);
var UniswapV2Adapter = class {
  protocolName;
  router;
  rpcUrl;
  lbQuoter;
  lbIntermediaries;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.rpcUrl = rpcUrl;
    this.lbIntermediaries = [];
    if (entry.contracts) {
      for (const [key, addr] of Object.entries(entry.contracts)) {
        if (key.startsWith("lb_mid_")) {
          this.lbIntermediaries.push(addr);
        }
      }
    }
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const path = [params.token_in, params.token_out];
    const data = encodeFunctionData22({
      abi,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, path, params.recipient, deadline]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 15e4,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (this.lbQuoter) {
      try {
        return await this.lbQuote(params);
      } catch {
      }
    }
    const client = createPublicClient22({ transport: http22(this.rpcUrl) });
    const path = [params.token_in, params.token_out];
    const result = await client.call({
      to: this.router,
      data: encodeFunctionData22({
        abi,
        functionName: "getAmountsOut",
        args: [params.amount_in, path]
      })
    });
    if (!result.data) {
      throw DefiError.rpcError(`[${this.protocolName}] getAmountsOut returned no data`);
    }
    const decoded = decodeFunctionResult2({
      abi,
      functionName: "getAmountsOut",
      data: result.data
    });
    const amountOut = decoded[decoded.length - 1];
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: 30,
      route: [`${params.token_in} -> ${params.token_out}`]
    };
  }
  async lbQuote(params) {
    const client = createPublicClient22({ transport: http22(this.rpcUrl) });
    const routes = [[params.token_in, params.token_out]];
    const tokenInLower = params.token_in.toLowerCase();
    const tokenOutLower = params.token_out.toLowerCase();
    for (const mid of this.lbIntermediaries) {
      if (mid.toLowerCase() !== tokenInLower && mid.toLowerCase() !== tokenOutLower) {
        routes.push([params.token_in, mid, params.token_out]);
      }
    }
    const lbResultParams = [
      {
        type: "tuple",
        components: [
          { name: "route", type: "address[]" },
          { name: "pairs", type: "address[]" },
          { name: "binSteps", type: "uint256[]" },
          { name: "versions", type: "uint256[]" },
          { name: "amounts", type: "uint128[]" },
          { name: "virtualAmountsWithoutSlippage", type: "uint128[]" },
          { name: "fees", type: "uint128[]" }
        ]
      }
    ];
    let bestOut = 0n;
    let bestRoute = [];
    const results = await Promise.allSettled(
      routes.map(async (route) => {
        const result = await client.call({
          to: this.lbQuoter,
          data: encodeFunctionData22({
            abi: lbQuoterAbi,
            functionName: "findBestPathFromAmountIn",
            args: [route, params.amount_in]
          })
        });
        if (!result.data) return { amountOut: 0n, route };
        const [quote] = decodeAbiParameters2(lbResultParams, result.data);
        const amounts = quote.amounts;
        return { amountOut: amounts[amounts.length - 1], route };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.amountOut > bestOut) {
        bestOut = r.value.amountOut;
        bestRoute = r.value.route;
      }
    }
    if (bestOut === 0n) {
      throw DefiError.rpcError(`[${this.protocolName}] LB quote returned zero for all routes`);
    }
    return {
      protocol: this.protocolName,
      amount_out: bestOut,
      price_impact_bps: void 0,
      fee_bps: void 0,
      route: [bestRoute.map((a) => a.slice(0, 10)).join(" -> ") + " (LB)"]
    };
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData22({
      abi,
      functionName: "addLiquidity",
      args: [
        params.token_a,
        params.token_b,
        params.amount_a,
        params.amount_b,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [
        { token: params.token_a, spender: this.router, amount: params.amount_a },
        { token: params.token_b, spender: this.router, amount: params.amount_b }
      ]
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData22({
      abi,
      functionName: "removeLiquidity",
      args: [
        params.token_a,
        params.token_b,
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Remove liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
};
function pctToTickDelta(pct) {
  return Math.round(Math.log(1 + pct / 100) / Math.log(1.0001));
}
function alignTickDown(tick, tickSpacing) {
  return Math.floor(tick / tickSpacing) * tickSpacing;
}
function alignTickUp(tick, tickSpacing) {
  return Math.ceil(tick / tickSpacing) * tickSpacing;
}
function rangeToTicks(currentTick, rangePct, tickSpacing) {
  const delta = pctToTickDelta(rangePct);
  return {
    tickLower: alignTickDown(currentTick - delta, tickSpacing),
    tickUpper: alignTickUp(currentTick + delta, tickSpacing)
  };
}
var abi2 = parseAbi32([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 limitSqrtPrice; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var algebraQuoterAbi = parseAbi32([
  "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256[] memory amountOutList, uint256[] memory amountInList, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate, uint16[] memory feeList)"
]);
var algebraSingleQuoterAbi = parseAbi32([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) params) external returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After)"
]);
var algebraIntegralPmAbi = parseAbi32([
  "struct MintParams { address token0; address token1; address deployer; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var algebraV2PmAbi = parseAbi32([
  "struct MintParams { address token0; address token1; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var AlgebraV3Adapter = class {
  protocolName;
  router;
  quoter;
  positionManager;
  rpcUrl;
  // NEST and similar forks expose quoteExactInputSingle((address,address,uint256,uint160))
  // instead of path-based quoteExactInput. Detected by presence of pool_deployer in config.
  useSingleQuoter;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.quoter = entry.contracts?.["quoter"];
    this.positionManager = entry.contracts?.["position_manager"];
    this.rpcUrl = rpcUrl;
    this.useSingleQuoter = entry.contracts?.["pool_deployer"] !== void 0;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const amountOutMinimum = 0n;
    const data = encodeFunctionData32({
      abi: abi2,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.token_in,
          tokenOut: params.token_out,
          recipient: params.recipient,
          deadline,
          amountIn: params.amount_in,
          amountOutMinimum,
          limitSqrtPrice: 0n
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 25e4,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (!this.quoter) {
      throw DefiError.unsupported(
        `[${this.protocolName}] No quoter contract configured`
      );
    }
    const client = createPublicClient32({ transport: http32(this.rpcUrl) });
    if (this.useSingleQuoter) {
      const result2 = await client.call({
        to: this.quoter,
        data: encodeFunctionData32({
          abi: algebraSingleQuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: params.token_in,
              tokenOut: params.token_out,
              amountIn: params.amount_in,
              limitSqrtPrice: 0n
            }
          ]
        })
      }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] quoteExactInputSingle failed: ${e}`);
      });
      if (!result2.data || result2.data.length < 66) {
        throw DefiError.rpcError(`[${this.protocolName}] quoter returned empty data`);
      }
      const [amountOut2] = decodeAbiParameters3(
        [
          { name: "amountOut", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "sqrtPriceX96After", type: "uint160" }
        ],
        result2.data
      );
      return {
        protocol: this.protocolName,
        amount_out: amountOut2,
        price_impact_bps: void 0,
        fee_bps: void 0,
        route: [`${params.token_in} -> ${params.token_out}`]
      };
    }
    const path = concatHex([params.token_in, zeroAddress, params.token_out]);
    const result = await client.call({
      to: this.quoter,
      data: encodeFunctionData32({
        abi: algebraQuoterAbi,
        functionName: "quoteExactInput",
        args: [path, params.amount_in]
      })
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] quoteExactInput failed: ${e}`);
    });
    if (!result.data || result.data.length < 66) {
      throw DefiError.rpcError(`[${this.protocolName}] quoter returned empty data`);
    }
    const decoded = decodeAbiParameters3(
      [
        { name: "amountOutList", type: "uint256[]" },
        { name: "amountInList", type: "uint256[]" },
        { name: "sqrtPriceX96AfterList", type: "uint160[]" },
        { name: "initializedTicksCrossedList", type: "uint32[]" },
        { name: "gasEstimate", type: "uint256" },
        { name: "feeList", type: "uint16[]" }
      ],
      result.data
    );
    const amountOutList = decoded[0];
    const feeList = decoded[5];
    const amountOut = amountOutList[amountOutList.length - 1];
    const fee = feeList.length > 0 ? feeList[0] : void 0;
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: fee !== void 0 ? Math.floor(fee / 10) : void 0,
      route: [`${params.token_in} -> ${params.token_out}`]
    };
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError("CONTRACT_ERROR", "Position manager address not configured");
    }
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
    let tickLower = params.tick_lower ?? -887220;
    let tickUpper = params.tick_upper ?? 887220;
    const isSingleSide = rawAmount0 === 0n || rawAmount1 === 0n;
    const needsAutoTick = params.range_pct !== void 0 || isSingleSide && !params.tick_lower && !params.tick_upper;
    if (needsAutoTick) {
      if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required for auto tick detection");
      const poolAddr = params.pool;
      if (!poolAddr) throw new DefiError("CONTRACT_ERROR", "Pool address required (use --pool)");
      const client = createPublicClient32({ transport: http32(this.rpcUrl) });
      const algebraPoolAbi = parseAbi32([
        "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
        "function tickSpacing() view returns (int24)"
      ]);
      const [globalState, spacing] = await Promise.all([
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "globalState" }),
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "tickSpacing" })
      ]);
      const currentTick = Number(globalState[1]);
      const tickSpace = Number(spacing);
      if (params.range_pct !== void 0) {
        const range = rangeToTicks(currentTick, params.range_pct, tickSpace);
        tickLower = range.tickLower;
        tickUpper = range.tickUpper;
      } else if (rawAmount0 > 0n && rawAmount1 === 0n) {
        tickLower = alignTickUp(currentTick + tickSpace, tickSpace);
        tickUpper = 887220;
      } else {
        tickLower = -887220;
        tickUpper = alignTickDown(currentTick - tickSpace, tickSpace);
      }
    }
    const amount0 = rawAmount0;
    const amount1 = rawAmount1;
    const data = this.useSingleQuoter ? encodeFunctionData32({
      abi: algebraV2PmAbi,
      functionName: "mint",
      args: [{ token0, token1, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }]
    }) : encodeFunctionData32({
      abi: algebraIntegralPmAbi,
      functionName: "mint",
      args: [{ token0, token1, deployer: zeroAddress, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }]
    });
    const approvals = [];
    if (amount0 > 0n) approvals.push({ token: token0, spender: pm, amount: amount0 });
    if (amount1 > 0n) approvals.push({ token: token1, spender: pm, amount: amount1 });
    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 5e5,
      approvals
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId \u2014 use NFT position manager directly`
    );
  }
};
var abi3 = parseAbi42([
  "function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes calldata userData) external returns (uint256 amountOut)"
]);
var BalancerV3Adapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minAmountOut = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const data = encodeFunctionData42({
      abi: abi3,
      functionName: "swapSingleTokenExactIn",
      args: [
        zeroAddress2,
        // TODO: resolve pool from registry
        params.token_in,
        params.token_out,
        params.amount_in,
        minAmountOut,
        deadline,
        false,
        "0x"
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via Balancer V3`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async quote(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] add_liquidity requires pool-specific params`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] remove_liquidity requires pool-specific params`);
  }
};
var poolAbi = parseAbi5([
  "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) external returns (uint256)",
  "function remove_liquidity(uint256 amount, uint256[2] min_amounts) external returns (uint256[2])"
]);
var CurveStableSwapAdapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minDy = 0n;
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "exchange",
      args: [0n, 1n, params.amount_in, minDy]
    });
    return {
      description: `[${this.protocolName}] Curve pool exchange ${params.amount_in} tokens (index 0 -> 1)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async quote(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC connection`);
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "add_liquidity",
      args: [[params.amount_a, params.amount_b], 0n]
    });
    return {
      description: `[${this.protocolName}] Curve add liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 4e5
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "remove_liquidity",
      args: [params.liquidity, [0n, 0n]]
    });
    return {
      description: `[${this.protocolName}] Curve remove liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
};
var abi4 = parseAbi6([
  "struct Route { address from; address to; bool stable; }",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] calldata routes) external view returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)"
]);
var abiV2 = parseAbi6([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] calldata routes) external view returns (uint256[] memory amounts)"
]);
var SolidlyAdapter = class {
  protocolName;
  router;
  /** Default to volatile (false). True for stablecoin pairs. */
  defaultStable;
  rpcUrl;
  /** Factory address — present on Velodrome V2 / Aerodrome forks */
  factory;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.defaultStable = false;
    this.rpcUrl = rpcUrl;
    this.factory = entry.contracts?.["factory"];
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const routes = [
      { from: params.token_in, to: params.token_out, stable: this.defaultStable }
    ];
    const data = encodeFunctionData6({
      abi: abi4,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, routes, params.recipient, deadline]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via Solidly`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  encodeV1(params, stable) {
    return encodeFunctionData6({
      abi: abi4,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable }]]
    });
  }
  encodeV2(params, stable) {
    return encodeFunctionData6({
      abi: abiV2,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable, factory: this.factory }]]
    });
  }
  async quote(params) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const candidates = [
      { callData: this.encodeV1(params, false), stable: false },
      { callData: this.encodeV1(params, true), stable: true }
    ];
    if (this.factory) {
      candidates.unshift(
        { callData: this.encodeV2(params, false), stable: false },
        { callData: this.encodeV2(params, true), stable: true }
      );
    }
    const rawResults = await multicallRead(
      this.rpcUrl,
      candidates.map((c) => [this.router, c.callData])
    );
    let bestOut = 0n;
    let bestStable = false;
    for (let i = 0; i < rawResults.length; i++) {
      const raw = rawResults[i];
      if (!raw) continue;
      try {
        const [amounts] = decodeAbiParameters4(
          [{ name: "amounts", type: "uint256[]" }],
          raw
        );
        const out = amounts.length >= 2 ? amounts[amounts.length - 1] : 0n;
        if (out > bestOut) {
          bestOut = out;
          bestStable = candidates[i].stable;
        }
      } catch {
      }
    }
    if (bestOut === 0n) {
      throw DefiError.rpcError(`[${this.protocolName}] getAmountsOut returned zero for all routes`);
    }
    return {
      protocol: this.protocolName,
      amount_out: bestOut,
      price_impact_bps: void 0,
      fee_bps: bestStable ? 4 : 20,
      route: [`${params.token_in} -> ${params.token_out} (stable: ${bestStable})`]
    };
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData6({
      abi: abi4,
      functionName: "addLiquidity",
      args: [
        params.token_a,
        params.token_b,
        this.defaultStable,
        params.amount_a,
        params.amount_b,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 35e4,
      approvals: [
        { token: params.token_a, spender: this.router, amount: params.amount_a },
        { token: params.token_b, spender: this.router, amount: params.amount_b }
      ]
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData6({
      abi: abi4,
      functionName: "removeLiquidity",
      args: [
        params.token_a,
        params.token_b,
        this.defaultStable,
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Remove liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
};
var thenaPmAbi = parseAbi7([
  "struct MintParams { address token0; address token1; int24 tickSpacing; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; uint160 sqrtPriceX96; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var thenaRouterAbi = parseAbi7([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; int24 tickSpacing; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var thenaPoolAbi = parseAbi7([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function tickSpacing() view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);
var thenaFactoryAbi = parseAbi7([
  "function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)"
]);
var ThenaCLAdapter = class {
  protocolName;
  router;
  positionManager;
  factory;
  rpcUrl;
  defaultTickSpacing;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    this.router = router;
    this.positionManager = entry.contracts?.["position_manager"];
    this.factory = entry.contracts?.["pool_factory"];
    this.rpcUrl = rpcUrl;
    this.defaultTickSpacing = 50;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const data = encodeFunctionData7({
      abi: thenaRouterAbi,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: params.token_in,
        tokenOut: params.token_out,
        tickSpacing: this.defaultTickSpacing,
        recipient: params.recipient,
        deadline: BigInt(params.deadline ?? 18446744073709551615n),
        amountIn: params.amount_in,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n
      }]
    });
    return {
      description: `[${this.protocolName}] Swap`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] quote not yet implemented \u2014 use swap router`);
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) throw new DefiError("CONTRACT_ERROR", "Position manager not configured");
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required");
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
    const client = createPublicClient42({ transport: http42(this.rpcUrl) });
    const poolAddr = params.pool;
    let tickSpacing = this.defaultTickSpacing;
    let tickLower = params.tick_lower ?? 0;
    let tickUpper = params.tick_upper ?? 0;
    if (poolAddr || !params.tick_lower || !params.tick_upper) {
      let pool = poolAddr;
      if (!pool && this.factory) {
        pool = await client.readContract({
          address: this.factory,
          abi: thenaFactoryAbi,
          functionName: "getPool",
          args: [token0, token1, tickSpacing]
        });
        if (pool === zeroAddress3) throw new DefiError("CONTRACT_ERROR", "Pool not found");
      }
      if (pool) {
        const [slot0, ts] = await Promise.all([
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "slot0" }),
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "tickSpacing" })
        ]);
        const currentTick = Number(slot0[1]);
        tickSpacing = Number(ts);
        if (params.range_pct !== void 0) {
          const range = rangeToTicks(currentTick, params.range_pct, tickSpacing);
          tickLower = range.tickLower;
          tickUpper = range.tickUpper;
        } else if (!params.tick_lower && !params.tick_upper) {
          const isSingleSide = rawAmount0 === 0n || rawAmount1 === 0n;
          if (isSingleSide) {
            if (rawAmount0 > 0n) {
              tickLower = alignTickUp(currentTick + tickSpacing, tickSpacing);
              tickUpper = Math.floor(887272 / tickSpacing) * tickSpacing;
            } else {
              tickLower = Math.ceil(-887272 / tickSpacing) * tickSpacing;
              tickUpper = alignTickDown(currentTick - tickSpacing, tickSpacing);
            }
          } else {
            tickLower = Math.ceil(-887272 / tickSpacing) * tickSpacing;
            tickUpper = Math.floor(887272 / tickSpacing) * tickSpacing;
          }
        }
      }
    }
    if (params.tick_lower !== void 0) tickLower = params.tick_lower;
    if (params.tick_upper !== void 0) tickUpper = params.tick_upper;
    const data = encodeFunctionData7({
      abi: thenaPmAbi,
      functionName: "mint",
      args: [{
        token0,
        token1,
        tickSpacing,
        tickLower,
        tickUpper,
        amount0Desired: rawAmount0,
        amount1Desired: rawAmount1,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: params.recipient,
        deadline: BigInt("18446744073709551615"),
        sqrtPriceX96: 0n
      }]
    });
    const approvals = [];
    if (rawAmount0 > 0n) approvals.push({ token: token0, spender: pm, amount: rawAmount0 });
    if (rawAmount1 > 0n) approvals.push({ token: token1, spender: pm, amount: rawAmount1 });
    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 7e5,
      approvals
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] remove_liquidity requires tokenId`);
  }
};
var gaugeManagerAbi = parseAbi8([
  "function gauges(address pool) view returns (address gauge)",
  "function isGauge(address gauge) view returns (bool)",
  "function isAlive(address gauge) view returns (bool)",
  "function claimRewards(address gauge, uint256[] tokenIds, uint8 redeemType) external"
]);
var gaugeCLAbi = parseAbi8([
  "function deposit(uint256 tokenId) external",
  "function withdraw(uint256 tokenId, uint8 redeemType) external",
  "function earned(uint256 tokenId) view returns (uint256)",
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function rewardToken() view returns (address)"
]);
var nfpmAbi = parseAbi8([
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view returns (address)"
]);
var veAbi = parseAbi8([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external"
]);
var voterAbi = parseAbi8([
  "function vote(uint256 tokenId, address[] pools, uint256[] weights) external",
  "function claimBribes(address[] bribes, address[][] tokens, uint256 tokenId) external",
  "function claimFees(address[] fees, address[][] tokens, uint256 tokenId) external"
]);
var HybraGaugeAdapter = class {
  protocolName;
  gaugeManager;
  veToken;
  voter;
  positionManager;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const gm = entry.contracts?.["gauge_manager"];
    if (!gm) throw new DefiError("CONTRACT_ERROR", "Missing 'gauge_manager' contract");
    this.gaugeManager = gm;
    const ve = entry.contracts?.["ve_token"];
    if (!ve) throw new DefiError("CONTRACT_ERROR", "Missing 've_token' contract");
    this.veToken = ve;
    this.voter = entry.contracts?.["voter"] ?? zeroAddress4;
    this.positionManager = entry.contracts?.["position_manager"] ?? zeroAddress4;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  // ─── Gauge Lookup ──────────────────────────────────────────
  async resolveGauge(pool) {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC required");
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    const gauge = await client.readContract({
      address: this.gaugeManager,
      abi: gaugeManagerAbi,
      functionName: "gauges",
      args: [pool]
    });
    if (gauge === zeroAddress4) throw new DefiError("CONTRACT_ERROR", `No gauge for pool ${pool}`);
    return gauge;
  }
  // ─── CL Gauge: NFT Deposit/Withdraw ──────────────────────────
  async buildDeposit(gauge, _amount, tokenId) {
    if (tokenId === void 0) throw new DefiError("CONTRACT_ERROR", "tokenId required for CL gauge deposit");
    const approveTx = {
      description: `[${this.protocolName}] Approve NFT #${tokenId} to gauge`,
      to: this.positionManager,
      data: encodeFunctionData8({ abi: nfpmAbi, functionName: "approve", args: [gauge, tokenId] }),
      value: 0n,
      gas_estimate: 8e4
    };
    return {
      description: `[${this.protocolName}] Deposit NFT #${tokenId} to gauge`,
      to: gauge,
      data: encodeFunctionData8({ abi: gaugeCLAbi, functionName: "deposit", args: [tokenId] }),
      value: 0n,
      gas_estimate: 5e5,
      pre_txs: [approveTx]
    };
  }
  async buildWithdraw(gauge, _amount, tokenId) {
    if (tokenId === void 0) throw new DefiError("CONTRACT_ERROR", "tokenId required for CL gauge withdraw");
    return {
      description: `[${this.protocolName}] Withdraw NFT #${tokenId} from gauge`,
      to: gauge,
      data: encodeFunctionData8({ abi: gaugeCLAbi, functionName: "withdraw", args: [tokenId, 1] }),
      value: 0n,
      gas_estimate: 1e6
    };
  }
  // ─── Claim: via GaugeManager ──────────────────────────────────
  async buildClaimRewards(gauge, _account) {
    throw DefiError.unsupported(`[${this.protocolName}] Use buildClaimRewardsByTokenId for CL gauges`);
  }
  async buildClaimRewardsByTokenId(gauge, tokenId) {
    return {
      description: `[${this.protocolName}] Claim rewards for NFT #${tokenId}`,
      to: this.gaugeManager,
      data: encodeFunctionData8({
        abi: gaugeManagerAbi,
        functionName: "claimRewards",
        args: [gauge, [tokenId], 1]
        // redeemType=1
      }),
      value: 0n,
      gas_estimate: 1e6
    };
  }
  // ─── Pending Rewards ──────────────────────────────────────────
  async getPendingRewards(gauge, _user) {
    throw DefiError.unsupported(`[${this.protocolName}] Use getPendingRewardsByTokenId for CL gauges`);
  }
  async getPendingRewardsByTokenId(gauge, tokenId) {
    if (!this.rpcUrl) throw DefiError.rpcError("RPC required");
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    return await client.readContract({
      address: gauge,
      abi: gaugeCLAbi,
      functionName: "earned",
      args: [tokenId]
    });
  }
  // ─── VoteEscrow ──────────────────────────────────────────────
  async buildCreateLock(amount, lockDuration) {
    return {
      description: `[${this.protocolName}] Create veNFT lock`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "create_lock", args: [amount, BigInt(lockDuration)] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildIncreaseAmount(tokenId, amount) {
    return {
      description: `[${this.protocolName}] Increase veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "increase_amount", args: [tokenId, amount] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildIncreaseUnlockTime(tokenId, lockDuration) {
    return {
      description: `[${this.protocolName}] Extend veNFT #${tokenId} lock`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "increase_unlock_time", args: [tokenId, BigInt(lockDuration)] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildWithdrawExpired(tokenId) {
    return {
      description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "withdraw", args: [tokenId] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  // ─── Voter ──────────────────────────────────────────────────
  async buildVote(tokenId, pools, weights) {
    return {
      description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "vote", args: [tokenId, pools, weights] }),
      value: 0n,
      gas_estimate: 5e5
    };
  }
  async buildClaimBribes(bribes, tokenId) {
    const tokensPerBribe = bribes.map(() => []);
    return {
      description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "claimBribes", args: [bribes, tokensPerBribe, tokenId] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildClaimFees(fees, tokenId) {
    const tokensPerFee = fees.map(() => []);
    return {
      description: `[${this.protocolName}] Claim fees for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "claimFees", args: [fees, tokensPerFee, tokenId] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
};
var abi5 = parseAbi9([
  "function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) external payable returns (uint256 realToAmount)"
]);
var WooFiAdapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minToAmount = 0n;
    const data = encodeFunctionData9({
      abi: abi5,
      functionName: "swap",
      args: [
        params.token_in,
        params.token_out,
        params.amount_in,
        minToAmount,
        params.recipient,
        zeroAddress5
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via WOOFi`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async quote(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
};
var masterchefAbi = parseAbi10([
  "function deposit(uint256 pid, uint256 amount) external",
  "function withdraw(uint256 pid, uint256 amount) external",
  "function claim(uint256[] calldata pids) external",
  "function pendingRewards(address account, uint256[] calldata pids) view returns (uint256[] memory moeRewards)",
  "function getNumberOfFarms() view returns (uint256)",
  "function getPidByPool(address pool) view returns (uint256)"
]);
var MasterChefAdapter = class {
  protocolName;
  masterchef;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const masterchef = entry.contracts?.["masterchef"];
    if (!masterchef) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'masterchef' contract");
    }
    this.masterchef = masterchef;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  /**
   * Deposit LP tokens into a MasterChef farm.
   * `gauge` is the pool address (unused for calldata — MasterChef is the target).
   * `tokenId` carries the farm pid.
   */
  async buildDeposit(gauge, amount, tokenId) {
    const pid = tokenId ?? 0n;
    const data = encodeFunctionData10({
      abi: masterchefAbi,
      functionName: "deposit",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Deposit ${amount} LP to farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Withdraw LP tokens from a MasterChef farm.
   * `gauge` is used to look up the pid description only; call site should pass pid via tokenId
   * on the deposit flow. Here pid defaults to 0 — callers should encode the pid in the gauge
   * address slot or wrap this adapter with a pid-aware helper.
   */
  async buildWithdraw(gauge, amount) {
    const pid = 0n;
    const data = encodeFunctionData10({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Withdraw LP tokens specifying a pid explicitly (MasterChef extension beyond IGauge). */
  async buildWithdrawPid(pid, amount) {
    const data = encodeFunctionData10({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Claim pending MOE rewards. IGauge interface provides no pid — defaults to pid=0. */
  async buildClaimRewards(gauge) {
    const pid = 0n;
    const data = encodeFunctionData10({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]]
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Claim pending MOE rewards for a specific pid (MasterChef extension beyond IGauge). */
  async buildClaimRewardsPid(pid) {
    const data = encodeFunctionData10({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]]
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Get pending MOE rewards for a user. Requires rpcUrl. */
  async getPendingRewards(_gauge, user) {
    if (!this.rpcUrl) {
      throw DefiError.unsupported(`[${this.protocolName}] getPendingRewards requires RPC`);
    }
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    const rewards = await client.readContract({
      address: this.masterchef,
      abi: masterchefAbi,
      functionName: "pendingRewards",
      args: [user, [0n]]
    });
    return rewards.map((amount) => ({
      token: this.masterchef,
      symbol: "MOE",
      amount
    }));
  }
};
var lbRouterAbi = parseAbi11([
  "struct LiquidityParameters { address tokenX; address tokenY; uint256 binStep; uint256 amountX; uint256 amountY; uint256 amountXMin; uint256 amountYMin; uint256 activeIdDesired; uint256 idSlippage; int256[] deltaIds; uint256[] distributionX; uint256[] distributionY; address to; address refundTo; uint256 deadline; }",
  "function addLiquidity(LiquidityParameters calldata liquidityParameters) external returns (uint256 amountXAdded, uint256 amountYAdded, uint256 amountXLeft, uint256 amountYLeft, uint256[] memory depositIds, uint256[] memory liquidityMinted)",
  "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] memory ids, uint256[] memory amounts, address to, uint256 deadline) external returns (uint256 amountX, uint256 amountY)"
]);
var lbFactoryAbi = parseAbi11([
  "function getNumberOfLBPairs() external view returns (uint256)",
  "function getLBPairAtIndex(uint256 index) external view returns (address)"
]);
var lbPairAbi = parseAbi11([
  "function getLBHooksParameters() external view returns (bytes32)",
  "function getActiveId() external view returns (uint24)",
  "function getBinStep() external view returns (uint16)",
  "function getTokenX() external view returns (address)",
  "function getTokenY() external view returns (address)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)"
]);
var lbRewarderAbi = parseAbi11([
  "function getRewardToken() external view returns (address)",
  "function getRewardedRange() external view returns (uint256 minBinId, uint256 maxBinId)",
  "function getPendingRewards(address user, uint256[] calldata ids) external view returns (uint256 pendingRewards)",
  "function claim(address user, uint256[] calldata ids) external",
  "function getPid() external view returns (uint256)",
  "function isStopped() external view returns (bool)",
  "function getLBPair() external view returns (address)",
  "function getMasterChef() external view returns (address)"
]);
var masterChefAbi = parseAbi11([
  "function getMoePerSecond() external view returns (uint256)",
  "function getTreasuryShare() external view returns (uint256)",
  "function getStaticShare() external view returns (uint256)",
  "function getVeMoe() external view returns (address)"
]);
var veMoeAbi = parseAbi11([
  "function getWeight(uint256 pid) external view returns (uint256)",
  "function getTotalWeight() external view returns (uint256)",
  "function getTopPoolIds() external view returns (uint256[] memory)"
]);
var lbPairBinAbi = parseAbi11([
  "function getBin(uint24 id) external view returns (uint128 reserveX, uint128 reserveY)",
  "function getActiveId() external view returns (uint24)"
]);
var lbQuoterAbi2 = parseAbi11([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
]);
var erc20Abi2 = parseAbi11([
  "function symbol() external view returns (string)"
]);
var _addressAbi = parseAbi11(["function f() external view returns (address)"]);
function decodeAddressResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _addressAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256Abi = parseAbi11(["function f() external view returns (uint256)"]);
function decodeUint256Result(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _uint256Abi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _boolAbi = parseAbi11(["function f() external view returns (bool)"]);
function decodeBoolResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _boolAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function decodeStringResult(data) {
  if (!data) return "?";
  try {
    return decodeFunctionResult22({ abi: erc20Abi2, functionName: "symbol", data });
  } catch {
    return "?";
  }
}
var _rangeAbi = parseAbi11(["function f() external view returns (uint256 minBinId, uint256 maxBinId)"]);
function decodeRangeResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _rangeAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _binAbi = parseAbi11(["function f() external view returns (uint128 reserveX, uint128 reserveY)"]);
function decodeBinResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _binAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256ArrayAbi = parseAbi11(["function f() external view returns (uint256[] memory)"]);
function decodeUint256ArrayResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _uint256ArrayAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function extractRewarderAddress(hooksParams) {
  if (!hooksParams || hooksParams === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return null;
  }
  const hex = hooksParams.slice(2);
  if (hex.length < 64) return null;
  const addrHex = hex.slice(24, 64);
  if (addrHex === "0000000000000000000000000000000000000000") return null;
  return `0x${addrHex}`;
}
function buildUniformDistribution(deltaIds) {
  const PRECISION = 10n ** 18n;
  const n = deltaIds.length;
  const xBins = deltaIds.filter((d) => d >= 0).length;
  const yBins = deltaIds.filter((d) => d <= 0).length;
  const distributionX = [];
  const distributionY = [];
  for (const delta of deltaIds) {
    const xShare = delta >= 0 && xBins > 0 ? PRECISION / BigInt(xBins) : 0n;
    const yShare = delta <= 0 && yBins > 0 ? PRECISION / BigInt(yBins) : 0n;
    distributionX.push(xShare);
    distributionY.push(yShare);
  }
  const xSum = distributionX.reduce((a, b) => a + b, 0n);
  const ySum = distributionY.reduce((a, b) => a + b, 0n);
  if (xSum > 0n && xSum !== PRECISION) {
    const firstX = distributionX.findIndex((v) => v > 0n);
    if (firstX !== -1) distributionX[firstX] += PRECISION - xSum;
  }
  if (ySum > 0n && ySum !== PRECISION) {
    const firstY = distributionY.findIndex((v) => v > 0n);
    if (firstY !== -1) distributionY[firstY] += PRECISION - ySum;
  }
  return { distributionX, distributionY };
}
var MerchantMoeLBAdapter = class {
  protocolName;
  lbRouter;
  lbFactory;
  lbQuoter;
  rpcUrl;
  /** WMNT address (lb_mid_wmnt in config) used for MOE price routing */
  wmnt;
  /** USDT address (lb_mid_usdt in config) used for MNT/USD price routing */
  usdt;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const lbRouter = entry.contracts?.["lb_router"];
    if (!lbRouter) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'lb_router' contract address");
    }
    const lbFactory = entry.contracts?.["lb_factory"];
    if (!lbFactory) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'lb_factory' contract address");
    }
    this.lbRouter = lbRouter;
    this.lbFactory = lbFactory;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.wmnt = entry.contracts?.["lb_mid_wmnt"];
    this.usdt = entry.contracts?.["lb_mid_usdt"];
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  requireRpc() {
    if (!this.rpcUrl) {
      throw DefiError.rpcError(`[${this.protocolName}] RPC URL required`);
    }
    return this.rpcUrl;
  }
  /**
   * Build an addLiquidity transaction for a Liquidity Book pair.
   * Distributes tokenX/tokenY uniformly across active bin ± numBins.
   */
  async buildAddLiquidity(params) {
    const numBins = params.numBins ?? 5;
    const deadline = params.deadline ?? BigInt("18446744073709551615");
    let activeIdDesired = params.activeIdDesired;
    if (activeIdDesired === void 0) {
      const rpcUrl = this.requireRpc();
      const client = createPublicClient7({ transport: http7(rpcUrl) });
      const activeId = await client.readContract({
        address: params.pool,
        abi: lbPairAbi,
        functionName: "getActiveId"
      });
      activeIdDesired = activeId;
    }
    const deltaIds = [];
    for (let d = -numBins; d <= numBins; d++) {
      deltaIds.push(d);
    }
    const { distributionX, distributionY } = buildUniformDistribution(deltaIds);
    const data = encodeFunctionData11({
      abi: lbRouterAbi,
      functionName: "addLiquidity",
      args: [
        {
          tokenX: params.tokenX,
          tokenY: params.tokenY,
          binStep: BigInt(params.binStep),
          amountX: params.amountX,
          amountY: params.amountY,
          amountXMin: 0n,
          amountYMin: 0n,
          activeIdDesired: BigInt(activeIdDesired),
          idSlippage: BigInt(numBins + 2),
          deltaIds: deltaIds.map(BigInt),
          distributionX,
          distributionY,
          to: params.recipient,
          refundTo: params.recipient,
          deadline
        }
      ]
    });
    return {
      description: `[${this.protocolName}] LB addLiquidity ${params.amountX} tokenX + ${params.amountY} tokenY across ${deltaIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 8e5,
      approvals: [
        { token: params.tokenX, spender: this.lbRouter, amount: params.amountX },
        { token: params.tokenY, spender: this.lbRouter, amount: params.amountY }
      ]
    };
  }
  /**
   * Build a removeLiquidity transaction for specific LB bins.
   */
  async buildRemoveLiquidity(params) {
    const deadline = params.deadline ?? BigInt("18446744073709551615");
    const data = encodeFunctionData11({
      abi: lbRouterAbi,
      functionName: "removeLiquidity",
      args: [
        params.tokenX,
        params.tokenY,
        params.binStep,
        params.amountXMin ?? 0n,
        params.amountYMin ?? 0n,
        params.binIds.map(BigInt),
        params.amounts,
        params.recipient,
        deadline
      ]
    });
    return {
      description: `[${this.protocolName}] LB removeLiquidity from ${params.binIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 6e5
    };
  }
  /**
   * Auto-detect bin IDs for a pool from the rewarder's rewarded range.
   * Falls back to active bin ± 50 scan if no rewarder exists.
   */
  async autoDetectBins(pool) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient7({ transport: http7(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (rewarder) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      const ids2 = [];
      for (let b = min; b <= max; b++) ids2.push(b);
      return ids2;
    }
    const activeId = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getActiveId"
    });
    const ids = [];
    for (let b = activeId - 50; b <= activeId + 50; b++) ids.push(b);
    return ids;
  }
  /**
   * Get pending MOE rewards for a user across specified bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   * Reads the rewarder address from the pool's hooks parameters.
   */
  async getPendingRewards(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient7({ transport: http7(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      return [];
    }
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }
    const [pending, rewardToken] = await Promise.all([
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getPendingRewards",
        args: [user, resolvedBinIds.map(BigInt)]
      }),
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardToken"
      })
    ]);
    return [
      {
        token: rewardToken,
        symbol: "MOE",
        amount: pending
      }
    ];
  }
  /**
   * Build a claim rewards transaction for specific LB bins.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   */
  async buildClaimRewards(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient7({ transport: http7(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      throw new DefiError("CONTRACT_ERROR", `[${this.protocolName}] Pool ${pool} has no active rewarder`);
    }
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }
    const data = encodeFunctionData11({
      abi: lbRewarderAbi,
      functionName: "claim",
      args: [user, resolvedBinIds.map(BigInt)]
    });
    return {
      description: `[${this.protocolName}] LB claim rewards for ${resolvedBinIds.length} bins`,
      to: rewarder,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  /**
   * Discover all active rewarded LB pools by iterating the factory.
   * Uses 7 multicall batches to minimise RPC round-trips and avoid 429s.
   *
   * Batch 1: getNumberOfLBPairs(), then getLBPairAtIndex(i) for all i
   * Batch 2: getLBHooksParameters() for all pairs → extract rewarder addresses
   * Batch 3: isStopped/getRewardedRange/getRewardToken/getPid/getMasterChef for each rewarder
   * Batch 4: getTokenX/getTokenY for each rewarded pair, then symbol() for unique tokens
   * Batch 5: Bootstrap MasterChef→VeMoe, then getMoePerSecond/getTreasuryShare/getStaticShare/getTotalWeight/getTopPoolIds
   * Batch 6: VeMoe.getWeight(pid) for each rewarded pool
   * Batch 7: Pool.getBin(binId) for all bins in rewarded range of each pool
   * Price: LB Quoter findBestPathFromAmountIn for MOE/WMNT and WMNT/USDT prices
   */
  async discoverRewardedPools() {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient7({ transport: http7(rpcUrl) });
    const pairCount = await client.readContract({
      address: this.lbFactory,
      abi: lbFactoryAbi,
      functionName: "getNumberOfLBPairs"
    });
    const count = Number(pairCount);
    if (count === 0) return [];
    const batch1Calls = Array.from({ length: count }, (_, i) => [
      this.lbFactory,
      encodeFunctionData11({ abi: lbFactoryAbi, functionName: "getLBPairAtIndex", args: [BigInt(i)] })
    ]);
    const batch1Results = await multicallRead(rpcUrl, batch1Calls);
    const pairAddresses = batch1Results.map((r) => decodeAddressResult(r)).filter((a) => a !== null);
    if (pairAddresses.length === 0) return [];
    const batch2Calls = pairAddresses.map((pair) => [
      pair,
      encodeFunctionData11({ abi: lbPairAbi, functionName: "getLBHooksParameters" })
    ]);
    const batch2Results = await multicallRead(rpcUrl, batch2Calls);
    const rewardedPairs = [];
    for (let i = 0; i < pairAddresses.length; i++) {
      const raw = batch2Results[i];
      if (!raw) continue;
      let hooksBytes;
      try {
        const _bytes32Abi = parseAbi11(["function f() external view returns (bytes32)"]);
        hooksBytes = decodeFunctionResult22({ abi: _bytes32Abi, functionName: "f", data: raw });
      } catch {
        continue;
      }
      const rewarder = extractRewarderAddress(hooksBytes);
      if (rewarder) {
        rewardedPairs.push({ pool: pairAddresses[i], rewarder });
      }
    }
    if (rewardedPairs.length === 0) return [];
    const batch3Calls = [];
    for (const { rewarder } of rewardedPairs) {
      batch3Calls.push([rewarder, encodeFunctionData11({ abi: lbRewarderAbi, functionName: "isStopped" })]);
      batch3Calls.push([rewarder, encodeFunctionData11({ abi: lbRewarderAbi, functionName: "getRewardedRange" })]);
      batch3Calls.push([rewarder, encodeFunctionData11({ abi: lbRewarderAbi, functionName: "getRewardToken" })]);
      batch3Calls.push([rewarder, encodeFunctionData11({ abi: lbRewarderAbi, functionName: "getPid" })]);
      batch3Calls.push([rewarder, encodeFunctionData11({ abi: lbRewarderAbi, functionName: "getMasterChef" })]);
    }
    const batch3Results = await multicallRead(rpcUrl, batch3Calls);
    const batch4aCalls = [];
    for (const { pool } of rewardedPairs) {
      batch4aCalls.push([pool, encodeFunctionData11({ abi: lbPairAbi, functionName: "getTokenX" })]);
      batch4aCalls.push([pool, encodeFunctionData11({ abi: lbPairAbi, functionName: "getTokenY" })]);
    }
    const batch4aResults = await multicallRead(rpcUrl, batch4aCalls);
    const tokenXAddresses = [];
    const tokenYAddresses = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      tokenXAddresses.push(decodeAddressResult(batch4aResults[i * 2] ?? null));
      tokenYAddresses.push(decodeAddressResult(batch4aResults[i * 2 + 1] ?? null));
    }
    const uniqueTokens = Array.from(
      new Set([...tokenXAddresses, ...tokenYAddresses].filter((a) => a !== null))
    );
    const batch4bCalls = uniqueTokens.map((token) => [
      token,
      encodeFunctionData11({ abi: erc20Abi2, functionName: "symbol" })
    ]);
    const batch4bResults = await multicallRead(rpcUrl, batch4bCalls);
    const symbolMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i], decodeStringResult(batch4bResults[i] ?? null));
    }
    const STRIDE3 = 5;
    const poolData = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const base = i * STRIDE3;
      poolData.push({
        stopped: decodeBoolResult(batch3Results[base] ?? null) ?? false,
        range: decodeRangeResult(batch3Results[base + 1] ?? null),
        rewardToken: decodeAddressResult(batch3Results[base + 2] ?? null),
        pid: Number(decodeUint256Result(batch3Results[base + 3] ?? null) ?? 0n),
        masterChef: decodeAddressResult(batch3Results[base + 4] ?? null)
      });
    }
    const masterChefAddr = poolData.map((d) => d.masterChef).find((a) => a !== null) ?? null;
    let moePerDay = 0;
    let topPoolIds = /* @__PURE__ */ new Set();
    let totalWeightRaw = 0n;
    let veMoeAddr = null;
    if (masterChefAddr) {
      veMoeAddr = await client.readContract({
        address: masterChefAddr,
        abi: masterChefAbi,
        functionName: "getVeMoe"
      });
      const batch5Calls = [
        [masterChefAddr, encodeFunctionData11({ abi: masterChefAbi, functionName: "getMoePerSecond" })],
        [masterChefAddr, encodeFunctionData11({ abi: masterChefAbi, functionName: "getTreasuryShare" })],
        [masterChefAddr, encodeFunctionData11({ abi: masterChefAbi, functionName: "getStaticShare" })],
        [veMoeAddr, encodeFunctionData11({ abi: veMoeAbi, functionName: "getTotalWeight" })],
        [veMoeAddr, encodeFunctionData11({ abi: veMoeAbi, functionName: "getTopPoolIds" })]
      ];
      const batch5Results = await multicallRead(rpcUrl, batch5Calls);
      const moePerSecRaw = decodeUint256Result(batch5Results[0] ?? null) ?? 0n;
      const treasuryShareRaw = decodeUint256Result(batch5Results[1] ?? null) ?? 0n;
      const staticShareRaw = decodeUint256Result(batch5Results[2] ?? null) ?? 0n;
      totalWeightRaw = decodeUint256Result(batch5Results[3] ?? null) ?? 0n;
      const topPoolIdsRaw = decodeUint256ArrayResult(batch5Results[4] ?? null) ?? [];
      topPoolIds = new Set(topPoolIdsRaw.map(Number));
      const PRECISION = 10n ** 18n;
      const netPerSec = moePerSecRaw * (PRECISION - treasuryShareRaw) / PRECISION * (PRECISION - staticShareRaw) / PRECISION;
      moePerDay = Number(netPerSec * 86400n) / 1e18;
    }
    const weightByPid = /* @__PURE__ */ new Map();
    if (veMoeAddr && rewardedPairs.length > 0) {
      const batch6Calls = poolData.map((d) => [
        veMoeAddr,
        encodeFunctionData11({ abi: veMoeAbi, functionName: "getWeight", args: [BigInt(d.pid)] })
      ]);
      const batch6Results = await multicallRead(rpcUrl, batch6Calls);
      for (let i = 0; i < poolData.length; i++) {
        weightByPid.set(poolData[i].pid, decodeUint256Result(batch6Results[i] ?? null) ?? 0n);
      }
    }
    let moePriceUsd = 0;
    let wmntPriceUsd = 0;
    const MOE_ADDR = "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9";
    if (this.lbQuoter && this.wmnt && this.usdt) {
      try {
        const [moeWmntQuote, wmntUsdtQuote] = await Promise.all([
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi2,
            functionName: "findBestPathFromAmountIn",
            args: [[MOE_ADDR, this.wmnt], 10n ** 18n]
          }),
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi2,
            functionName: "findBestPathFromAmountIn",
            args: [[this.wmnt, this.usdt], 10n ** 18n]
          })
        ]);
        const moeInWmnt = Number(moeWmntQuote.amounts.at(-1) ?? 0n) / 1e18;
        wmntPriceUsd = Number(wmntUsdtQuote.amounts.at(-1) ?? 0n) / 1e6;
        moePriceUsd = moeInWmnt * wmntPriceUsd;
      } catch {
      }
    }
    const binRequests = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const range = poolData[i].range;
      if (!range) continue;
      const minBin = Number(range[0]);
      const maxBin = Number(range[1]);
      for (let b = minBin; b <= maxBin; b++) {
        binRequests.push({ poolIdx: i, binId: b });
      }
    }
    const binReservesX = /* @__PURE__ */ new Map();
    const binReservesY = /* @__PURE__ */ new Map();
    if (binRequests.length > 0) {
      const batch7Calls = binRequests.map(({ poolIdx, binId }) => [
        rewardedPairs[poolIdx].pool,
        encodeFunctionData11({ abi: lbPairBinAbi, functionName: "getBin", args: [binId] })
      ]);
      const batch7Results = await multicallRead(rpcUrl, batch7Calls);
      for (let j = 0; j < binRequests.length; j++) {
        const { poolIdx, binId } = binRequests[j];
        const decoded = decodeBinResult(batch7Results[j] ?? null);
        if (!decoded) continue;
        if (!binReservesX.has(poolIdx)) {
          binReservesX.set(poolIdx, /* @__PURE__ */ new Map());
          binReservesY.set(poolIdx, /* @__PURE__ */ new Map());
        }
        binReservesX.get(poolIdx).set(binId, decoded[0]);
        binReservesY.get(poolIdx).set(binId, decoded[1]);
      }
    }
    const stableSymbols = /* @__PURE__ */ new Set(["USDT", "USDC", "MUSD", "AUSD", "USDY", "FDUSD"]);
    const mntSymbols = /* @__PURE__ */ new Set(["WMNT", "MNT"]);
    const moeSymbols = /* @__PURE__ */ new Set(["MOE"]);
    const sixDecimalStables = /* @__PURE__ */ new Set(["USDT", "USDC", "FDUSD"]);
    const getTokenPriceUsd = (sym) => {
      if (stableSymbols.has(sym)) return 1;
      if (mntSymbols.has(sym)) return wmntPriceUsd;
      if (moeSymbols.has(sym)) return moePriceUsd;
      return 0;
    };
    const getTokenDecimals = (sym) => {
      return sixDecimalStables.has(sym) ? 6 : 18;
    };
    const results = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const { pool, rewarder } = rewardedPairs[i];
      const data = poolData[i];
      const tokenX = tokenXAddresses[i] ?? "0x0000000000000000000000000000000000000000";
      const tokenY = tokenYAddresses[i] ?? "0x0000000000000000000000000000000000000000";
      const symX = symbolMap.get(tokenX) ?? "?";
      const symY = symbolMap.get(tokenY) ?? "?";
      const isTopPool = topPoolIds.has(data.pid);
      const weight = weightByPid.get(data.pid) ?? 0n;
      let poolMoePerDay = 0;
      if (isTopPool && totalWeightRaw > 0n && weight > 0n) {
        poolMoePerDay = moePerDay * (Number(weight) / Number(totalWeightRaw));
      }
      const rxMap = binReservesX.get(i);
      const ryMap = binReservesY.get(i);
      const range = data.range;
      let rangeTvlUsd = 0;
      let rewardedBins = 0;
      if (range) {
        const minBin = Number(range[0]);
        const maxBin = Number(range[1]);
        rewardedBins = maxBin - minBin + 1;
        if (rxMap && ryMap) {
          const priceX = getTokenPriceUsd(symX);
          const priceY = getTokenPriceUsd(symY);
          const decX = getTokenDecimals(symX);
          const decY = getTokenDecimals(symY);
          for (let b = minBin; b <= maxBin; b++) {
            const rx = rxMap.get(b) ?? 0n;
            const ry = ryMap.get(b) ?? 0n;
            rangeTvlUsd += Number(rx) / 10 ** decX * priceX;
            rangeTvlUsd += Number(ry) / 10 ** decY * priceY;
          }
        }
      }
      const aprPercent = rangeTvlUsd > 0 && moePriceUsd > 0 ? poolMoePerDay * moePriceUsd * 365 / rangeTvlUsd * 100 : 0;
      results.push({
        pool,
        rewarder,
        rewardToken: data.rewardToken ?? "0x0000000000000000000000000000000000000000",
        minBinId: range ? Number(range[0]) : 0,
        maxBinId: range ? Number(range[1]) : 0,
        pid: data.pid,
        stopped: data.stopped,
        tokenX,
        tokenY,
        symbolX: symX,
        symbolY: symY,
        isTopPool,
        moePerDay: poolMoePerDay,
        rangeTvlUsd,
        aprPercent,
        rewardedBins
      });
    }
    return results;
  }
  /**
   * Get a user's LB positions (bin balances) across a range of bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range (or active ± 50).
   */
  async getUserPositions(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient7({ transport: http7(rpcUrl) });
    const resolvedBinIds = binIds && binIds.length > 0 ? binIds : await this.autoDetectBins(pool);
    const accounts = resolvedBinIds.map(() => user);
    const ids = resolvedBinIds.map(BigInt);
    const balances = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "balanceOfBatch",
      args: [accounts, ids]
    });
    return resolvedBinIds.map((binId, i) => ({ binId, balance: balances[i] ?? 0n })).filter((p) => p.balance > 0n);
  }
};
var KITTEN_TOKEN = "0x618275f8efe54c2afa87bfb9f210a52f0ff89364";
var WHYPE_TOKEN = "0x5555555555555555555555555555555555555555";
var MULTICALL_BATCH = 50;
var farmingCenterAbi = parseAbi12([
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function enterFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function exitFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function collectRewards((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function claimReward(address rewardToken, address to, uint128 amountRequested) external returns (uint256 reward)"
]);
var positionManagerAbi2 = parseAbi12([
  "function approveForFarming(uint256 tokenId, bool approve, address farmingAddress) external",
  "function farmingApprovals(uint256 tokenId) external view returns (address)"
]);
var eternalFarmingAbi = parseAbi12([
  "function numOfIncentives() external view returns (uint256)",
  "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
  "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)"
]);
var multicall3Abi2 = parseAbi12([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData)"
]);
var MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
function incentiveId(key) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "rewardToken", type: "address" },
        { name: "bonusRewardToken", type: "address" },
        { name: "pool", type: "address" },
        { name: "nonce", type: "uint256" }
      ],
      [key.rewardToken, key.bonusRewardToken, key.pool, key.nonce]
    )
  );
}
function encodeEnterFarming(key, tokenId) {
  return encodeFunctionData12({
    abi: farmingCenterAbi,
    functionName: "enterFarming",
    args: [key, tokenId]
  });
}
function encodeExitFarming(key, tokenId) {
  return encodeFunctionData12({
    abi: farmingCenterAbi,
    functionName: "exitFarming",
    args: [key, tokenId]
  });
}
function encodeCollectRewards(key, tokenId) {
  return encodeFunctionData12({
    abi: farmingCenterAbi,
    functionName: "collectRewards",
    args: [key, tokenId]
  });
}
function encodeClaimReward(rewardToken, to) {
  return encodeFunctionData12({
    abi: farmingCenterAbi,
    functionName: "claimReward",
    args: [rewardToken, to, 2n ** 128n - 1n]
    // max uint128
  });
}
function encodeMulticall(calls) {
  return encodeFunctionData12({
    abi: farmingCenterAbi,
    functionName: "multicall",
    args: [calls]
  });
}
var nonceCache = {};
var KittenSwapFarmingAdapter = class {
  protocolName;
  farmingCenter;
  eternalFarming;
  positionManager;
  rpcUrl;
  constructor(protocolName, farmingCenter, eternalFarming, positionManager, rpcUrl) {
    this.protocolName = protocolName;
    this.farmingCenter = farmingCenter;
    this.eternalFarming = eternalFarming;
    this.positionManager = positionManager;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  /**
   * Discover the active IncentiveKey for a given pool.
   * 1. Check runtime cache
   * 2. Read numOfIncentives() for max nonce
   * 3. Batch-query via Multicall3 in reverse order (newest first)
   * 4. Return first active (non-deactivated, totalReward > 0) incentive
   */
  async discoverIncentiveKey(pool) {
    const poolLc = pool.toLowerCase();
    if (poolLc in nonceCache) {
      return {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: nonceCache[poolLc]
      };
    }
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const numIncentives = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "numOfIncentives"
    });
    const maxNonce = Number(numIncentives) - 1;
    if (maxNonce < 0) return null;
    const keys = [];
    for (let n = maxNonce; n >= 0; n--) {
      keys.push({
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: BigInt(n)
      });
    }
    for (let i = 0; i < keys.length; i += MULTICALL_BATCH) {
      const batch = keys.slice(i, i + MULTICALL_BATCH);
      const calls = batch.map((key) => ({
        target: this.eternalFarming,
        allowFailure: true,
        callData: encodeFunctionData12({
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)]
        })
      }));
      const results = await client.readContract({
        address: MULTICALL3,
        abi: multicall3Abi2,
        functionName: "aggregate3",
        args: [calls]
      });
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r.success || r.returnData.length < 66) continue;
        const decoded = decodeAbiParameters5(
          [
            { name: "totalReward", type: "uint256" },
            { name: "bonusReward", type: "uint256" },
            { name: "virtualPoolAddress", type: "address" },
            { name: "minimalPositionWidth", type: "uint24" },
            { name: "deactivated", type: "bool" },
            { name: "pluginAddress", type: "address" }
          ],
          r.returnData
        );
        const totalReward = decoded[0];
        const deactivated = decoded[4];
        if (totalReward > 0n && !deactivated) {
          const key = batch[j];
          nonceCache[poolLc] = key.nonce;
          return key;
        }
      }
    }
    return null;
  }
  /**
   * Build approveForFarming tx on the PositionManager.
   * Required before enterFarming if not already approved.
   */
  async buildApproveForFarming(tokenId) {
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const currentApproval = await client.readContract({
      address: this.positionManager,
      abi: positionManagerAbi2,
      functionName: "farmingApprovals",
      args: [tokenId]
    });
    if (currentApproval.toLowerCase() === this.farmingCenter.toLowerCase()) {
      return null;
    }
    return {
      description: `[${this.protocolName}] Approve NFT #${tokenId} for farming`,
      to: this.positionManager,
      data: encodeFunctionData12({
        abi: positionManagerAbi2,
        functionName: "approveForFarming",
        args: [tokenId, true, this.farmingCenter]
      }),
      value: 0n,
      gas_estimate: 6e4
    };
  }
  /**
   * Build enterFarming tx for a position NFT.
   * Checks farming approval first and returns pre_txs if needed.
   */
  async buildEnterFarming(tokenId, pool, _owner) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    const approveTx = await this.buildApproveForFarming(tokenId);
    return {
      description: `[${this.protocolName}] Enter farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeEnterFarming(key, tokenId),
      value: 0n,
      gas_estimate: 4e5,
      pre_txs: approveTx ? [approveTx] : void 0
    };
  }
  /**
   * Build a tx that exits farming for a position NFT (unstakes).
   */
  async buildExitFarming(tokenId, pool) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    return {
      description: `[${this.protocolName}] Exit farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeExitFarming(key, tokenId),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  /**
   * Build a multicall tx that collects rewards for a staked position and claims them.
   * Pattern: multicall([collectRewards(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
   */
  async buildCollectRewards(tokenId, pool, owner) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    const calls = [
      encodeCollectRewards(key, tokenId),
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner)
    ];
    return {
      description: `[${this.protocolName}] Collect + claim rewards for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 4e5
    };
  }
  /**
   * Build a tx that only claims already-accumulated rewards (no position change needed).
   */
  async buildClaimReward(owner) {
    const calls = [
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner)
    ];
    return {
      description: `[${this.protocolName}] Claim KITTEN + WHYPE farming rewards to ${owner}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Query pending rewards for a staked position NFT.
   */
  async getPendingRewards(tokenId, pool) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      return { reward: 0n, bonusReward: 0n };
    }
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const result = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "getRewardInfo",
      args: [key, tokenId]
    });
    return { reward: result[0], bonusReward: result[1] };
  }
  /**
   * Discover all pools with active farming incentives.
   * Dynamically scans all nonces (0..numOfIncentives) via Multicall3 and
   * groups results by pool. Only returns the latest active incentive per pool.
   */
  async discoverFarmingPools() {
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const numIncentives = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "numOfIncentives"
    });
    const maxNonce = Number(numIncentives) - 1;
    if (maxNonce < 0) return [];
    const knownPools = [
      "0x71d1fde797e1810711e4c9abcfca6ef04c266196",
      // WHYPE/KITTEN
      "0x3c1403335d0ca7d0a73c9e775b25514537c2b809",
      // WHYPE/USDT0
      "0x12df9913e9e08453440e3c4b1ae73819160b513e"
      // WHYPE/USDC
    ];
    const results = [];
    for (const pool of knownPools) {
      const key = await this.discoverIncentiveKey(pool);
      if (!key) continue;
      const iid = incentiveId(key);
      const incentive = await client.readContract({
        address: this.eternalFarming,
        abi: eternalFarmingAbi,
        functionName: "incentives",
        args: [iid]
      });
      results.push({
        pool,
        key,
        totalReward: incentive[0],
        bonusReward: incentive[1],
        active: !incentive[4] && incentive[0] > 0n
      });
    }
    return results;
  }
};
var POOL_ABI = parseAbi13([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)"
]);
var ERC20_ABI2 = parseAbi13([
  "function totalSupply() external view returns (uint256)"
]);
var INCENTIVES_ABI = parseAbi13([
  "function getIncentivesController() external view returns (address)"
]);
var REWARDS_CONTROLLER_ABI = parseAbi13([
  "function getRewardsByAsset(address asset) external view returns (address[])",
  "function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionsPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)"
]);
var POOL_PROVIDER_ABI = parseAbi13([
  "function ADDRESSES_PROVIDER() external view returns (address)"
]);
var ADDRESSES_PROVIDER_ABI = parseAbi13([
  "function getPriceOracle() external view returns (address)"
]);
var ORACLE_ABI = parseAbi13([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)"
]);
var ERC20_DECIMALS_ABI = parseAbi13([
  "function decimals() external view returns (uint8)"
]);
function u256ToF64(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
function decodeAddress(data) {
  if (!data || data.length < 66) return null;
  return `0x${data.slice(26, 66)}`;
}
function decodeAddressArray(data) {
  if (!data) return [];
  try {
    return decodeFunctionResult3({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsByAsset",
      data
    });
  } catch {
    return [];
  }
}
function decodeReserveData(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult3({
      abi: POOL_ABI,
      functionName: "getReserveData",
      data
    });
  } catch {
    return null;
  }
}
function decodeRewardsData(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult3({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsData",
      data
    });
  } catch {
    return null;
  }
}
var AaveV3Adapter = class {
  protocolName;
  pool;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData13({
      abi: POOL_ABI,
      functionName: "supply",
      args: [params.asset, params.amount, params.on_behalf_of, 0]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildBorrow(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData13({
      abi: POOL_ABI,
      functionName: "borrow",
      args: [params.asset, params.amount, rateMode, 0, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData13({
      abi: POOL_ABI,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData13({
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const reserveCallData = encodeFunctionData13({
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset]
    });
    const [reserveRaw] = await multicallRead(this.rpcUrl, [
      [this.pool, reserveCallData]
    ]).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const reserveDecoded = decodeReserveData(reserveRaw ?? null);
    if (!reserveDecoded) {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData returned no data`);
    }
    const result = reserveDecoded;
    const RAY = 1e27;
    const SECONDS_PER_YEAR4 = 31536e3;
    const toApy = (rayRate) => {
      const rate = Number(rayRate) / RAY;
      return (Math.pow(1 + rate / SECONDS_PER_YEAR4, SECONDS_PER_YEAR4) - 1) * 100;
    };
    const supplyRate = toApy(result[2]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);
    const aTokenAddress = result[8];
    const variableDebtTokenAddress = result[10];
    const [supplyRaw, borrowRaw] = await multicallRead(this.rpcUrl, [
      [aTokenAddress, encodeFunctionData13({ abi: ERC20_ABI2, functionName: "totalSupply" })],
      [variableDebtTokenAddress, encodeFunctionData13({ abi: ERC20_ABI2, functionName: "totalSupply" })]
    ]);
    const totalSupply = decodeU256(supplyRaw ?? null);
    const totalBorrow = decodeU256(borrowRaw ?? null);
    const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;
    const supplyRewardTokens = [];
    const borrowRewardTokens = [];
    const supplyEmissions = [];
    const borrowEmissions = [];
    try {
      const [controllerRaw] = await multicallRead(this.rpcUrl, [
        [aTokenAddress, encodeFunctionData13({ abi: INCENTIVES_ABI, functionName: "getIncentivesController" })]
      ]);
      const controllerAddr = decodeAddress(controllerRaw ?? null);
      if (controllerAddr && controllerAddr !== zeroAddress6) {
        const [supplyRewardsRaw, borrowRewardsRaw] = await multicallRead(this.rpcUrl, [
          [controllerAddr, encodeFunctionData13({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [aTokenAddress] })],
          [controllerAddr, encodeFunctionData13({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [variableDebtTokenAddress] })]
        ]);
        const supplyRewards = decodeAddressArray(supplyRewardsRaw ?? null);
        const borrowRewards = decodeAddressArray(borrowRewardsRaw ?? null);
        const rewardsDataCalls = [
          ...supplyRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData13({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [aTokenAddress, reward] })
          ]),
          ...borrowRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData13({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [variableDebtTokenAddress, reward] })
          ])
        ];
        if (rewardsDataCalls.length > 0) {
          const rewardsDataResults = await multicallRead(this.rpcUrl, rewardsDataCalls);
          const supplyDataResults = rewardsDataResults.slice(0, supplyRewards.length);
          const borrowDataResults = rewardsDataResults.slice(supplyRewards.length);
          for (let i = 0; i < supplyRewards.length; i++) {
            const data = decodeRewardsData(supplyDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              supplyRewardTokens.push(supplyRewards[i]);
              supplyEmissions.push(data[1].toString());
            }
          }
          for (let i = 0; i < borrowRewards.length; i++) {
            const data = decodeRewardsData(borrowDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              borrowRewardTokens.push(borrowRewards[i]);
              borrowEmissions.push(data[1].toString());
            }
          }
        }
      }
    } catch {
    }
    let supplyIncentiveApy;
    let borrowIncentiveApy;
    const hasSupplyRewards = supplyRewardTokens.length > 0;
    const hasBorrowRewards = borrowRewardTokens.length > 0;
    if ((hasSupplyRewards || hasBorrowRewards) && totalSupply > 0n) {
      try {
        const [providerRaw] = await multicallRead(this.rpcUrl, [
          [this.pool, encodeFunctionData13({ abi: POOL_PROVIDER_ABI, functionName: "ADDRESSES_PROVIDER" })]
        ]);
        const providerAddr = decodeAddress(providerRaw ?? null);
        if (!providerAddr) throw new Error("No provider address");
        const [oracleRaw] = await multicallRead(this.rpcUrl, [
          [providerAddr, encodeFunctionData13({ abi: ADDRESSES_PROVIDER_ABI, functionName: "getPriceOracle" })]
        ]);
        const oracleAddr = decodeAddress(oracleRaw ?? null);
        if (!oracleAddr) throw new Error("No oracle address");
        const [assetPriceRaw, baseCurrencyUnitRaw, assetDecimalsRaw] = await multicallRead(this.rpcUrl, [
          [oracleAddr, encodeFunctionData13({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [asset] })],
          [oracleAddr, encodeFunctionData13({ abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })],
          [asset, encodeFunctionData13({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const assetPrice = decodeU256(assetPriceRaw ?? null);
        const baseCurrencyUnit = decodeU256(baseCurrencyUnitRaw ?? null);
        const assetDecimals = assetDecimalsRaw ? Number(decodeU256(assetDecimalsRaw)) : 18;
        const priceUnit = Number(baseCurrencyUnit) || 1e8;
        const assetPriceF = Number(assetPrice) / priceUnit;
        const assetDecimalsDivisor = 10 ** assetDecimals;
        const allRewardTokens = Array.from(/* @__PURE__ */ new Set([...supplyRewardTokens, ...borrowRewardTokens]));
        const rewardPriceCalls = allRewardTokens.flatMap((token) => [
          [oracleAddr, encodeFunctionData13({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] })],
          [token, encodeFunctionData13({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const rewardPriceResults = rewardPriceCalls.length > 0 ? await multicallRead(this.rpcUrl, rewardPriceCalls) : [];
        const rewardPriceMap = /* @__PURE__ */ new Map();
        for (let i = 0; i < allRewardTokens.length; i++) {
          const priceRaw = rewardPriceResults[i * 2] ?? null;
          const decimalsRaw = rewardPriceResults[i * 2 + 1] ?? null;
          const price = decodeU256(priceRaw);
          const decimals = decimalsRaw ? Number(decodeU256(decimalsRaw)) : 18;
          rewardPriceMap.set(allRewardTokens[i].toLowerCase(), { price, decimals });
        }
        if (hasSupplyRewards) {
          let totalSupplyIncentiveUsdPerYear = 0;
          const totalSupplyUsd = Number(totalSupply) / assetDecimalsDivisor * assetPriceF;
          for (let i = 0; i < supplyRewardTokens.length; i++) {
            const emissionPerSec = BigInt(supplyEmissions[i]);
            const entry = rewardPriceMap.get(supplyRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = Number(emissionPerSec) / 10 ** rewardDecimals * SECONDS_PER_YEAR4;
              totalSupplyIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalSupplyUsd > 0) {
            supplyIncentiveApy = totalSupplyIncentiveUsdPerYear / totalSupplyUsd * 100;
          }
        }
        if (hasBorrowRewards && totalBorrow > 0n) {
          let totalBorrowIncentiveUsdPerYear = 0;
          const totalBorrowUsd = Number(totalBorrow) / assetDecimalsDivisor * assetPriceF;
          for (let i = 0; i < borrowRewardTokens.length; i++) {
            const emissionPerSec = BigInt(borrowEmissions[i]);
            const entry = rewardPriceMap.get(borrowRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = Number(emissionPerSec) / 10 ** rewardDecimals * SECONDS_PER_YEAR4;
              totalBorrowIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalBorrowUsd > 0) {
            borrowIncentiveApy = totalBorrowIncentiveUsdPerYear / totalBorrowUsd * 100;
          }
        }
      } catch {
      }
    }
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow,
      ...hasSupplyRewards && {
        supply_reward_tokens: supplyRewardTokens,
        supply_emissions_per_second: supplyEmissions
      },
      ...hasBorrowRewards && {
        borrow_reward_tokens: borrowRewardTokens,
        borrow_emissions_per_second: borrowEmissions
      },
      ...supplyIncentiveApy !== void 0 && { supply_incentive_apy: supplyIncentiveApy },
      ...borrowIncentiveApy !== void 0 && { borrow_incentive_apy: borrowIncentiveApy }
    };
  }
  async getUserPosition(user) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvBps = u256ToF64(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress6, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress6, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      net_apy: ltvBps / 100
    };
  }
};
var POOL_ABI2 = parseAbi14([
  "function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  // V2 getReserveData: 12 fields (no accruedToTreasury/unbacked/isolationModeTotalDebt)
  // positions: [0]=configuration, [1]=liquidityIndex, [2]=variableBorrowIndex,
  //            [3]=currentLiquidityRate, [4]=currentVariableBorrowRate, [5]=currentStableBorrowRate,
  //            [6]=lastUpdateTimestamp, [7]=aTokenAddress, [8]=stableDebtTokenAddress,
  //            [9]=variableDebtTokenAddress, [10]=interestRateStrategyAddress, [11]=id
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id)"
]);
var ERC20_ABI22 = parseAbi14([
  "function totalSupply() external view returns (uint256)"
]);
function u256ToF642(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
var AaveV2Adapter = class {
  protocolName;
  pool;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData14({
      abi: POOL_ABI2,
      functionName: "deposit",
      args: [params.asset, params.amount, params.on_behalf_of, 0]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildBorrow(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData14({
      abi: POOL_ABI2,
      functionName: "borrow",
      args: [params.asset, params.amount, rateMode, 0, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData14({
      abi: POOL_ABI2,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData14({
      abi: POOL_ABI2,
      functionName: "withdraw",
      args: [params.asset, params.amount, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getReserveData",
      args: [asset]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const RAY = 1e27;
    const SECONDS_PER_YEAR4 = 31536e3;
    const toApy = (rayRate) => {
      const rate = Number(rayRate) / RAY;
      return (Math.pow(1 + rate / SECONDS_PER_YEAR4, SECONDS_PER_YEAR4) - 1) * 100;
    };
    const supplyRate = toApy(result[3]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);
    const aTokenAddress = result[7];
    const variableDebtTokenAddress = result[9];
    const [totalSupply, totalBorrow] = await Promise.all([
      client.readContract({
        address: aTokenAddress,
        abi: ERC20_ABI22,
        functionName: "totalSupply"
      }).catch(() => 0n),
      client.readContract({
        address: variableDebtTokenAddress,
        abi: ERC20_ABI22,
        functionName: "totalSupply"
      }).catch(() => 0n)
    ]);
    const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow
    };
  }
  async getUserPosition(user) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF642(totalCollateralBase) / 1e18;
    const debtUsd = u256ToF642(totalDebtBase) / 1e18;
    const ltvBps = u256ToF642(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress7, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress7, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      net_apy: ltvBps / 100
    };
  }
};
var ORACLE_ABI2 = parseAbi15([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)"
]);
var AaveOracleAdapter = class {
  protocolName;
  oracle;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const oracle = entry.contracts?.["oracle"];
    if (!oracle) throw DefiError.contractError(`[${entry.name}] Missing 'oracle' contract address`);
    this.oracle = oracle;
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const priceVal = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetPrice",
      args: [asset]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getAssetPrice failed: ${e}`);
    });
    const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
    const priceUsd = baseUnit > 0n ? priceVal * 10n ** 18n / baseUnit : 0n;
    return {
      source: `${this.protocolName} Oracle`,
      source_type: "oracle",
      asset,
      price_usd: priceUsd,
      price_f64: priceF64
    };
  }
  async getPrices(assets) {
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const rawPrices = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetsPrices",
      args: [assets]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getAssetsPrices failed: ${e}`);
    });
    return rawPrices.map((priceVal, i) => {
      const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
      const priceUsd = baseUnit > 0n ? priceVal * 10n ** 18n / baseUnit : 0n;
      return {
        source: `${this.protocolName} Oracle`,
        source_type: "oracle",
        asset: assets[i],
        price_usd: priceUsd,
        price_f64: priceF64
      };
    });
  }
};
var CTOKEN_ABI = parseAbi16([
  "function supplyRatePerBlock() external view returns (uint256)",
  "function borrowRatePerBlock() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function mint(uint256 mintAmount) external returns (uint256)",
  "function redeem(uint256 redeemTokens) external returns (uint256)",
  "function borrow(uint256 borrowAmount) external returns (uint256)",
  "function repayBorrow(uint256 repayAmount) external returns (uint256)"
]);
var BSC_BLOCKS_PER_YEAR = 10512e3;
var CompoundV2Adapter = class {
  protocolName;
  defaultVtoken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const vtoken = contracts["vusdt"] ?? contracts["vusdc"] ?? contracts["vbnb"] ?? contracts["comptroller"];
    if (!vtoken) throw DefiError.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData15({
      abi: CTOKEN_ABI,
      functionName: "mint",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData15({
      abi: CTOKEN_ABI,
      functionName: "borrow",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData15({
      abi: CTOKEN_ABI,
      functionName: "repayBorrow",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData15({
      abi: CTOKEN_ABI,
      functionName: "redeem",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient12({ transport: http12(this.rpcUrl) });
    const [supplyRate, borrowRate, totalSupply, totalBorrows] = await Promise.all([
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "totalBorrows" }).catch(() => 0n)
    ]);
    const supplyPerBlock = Number(supplyRate) / 1e18;
    const borrowPerBlock = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const borrowApy = borrowPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? borrowF / supplyF * 100 : 0;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrows
    };
  }
  async getUserPosition(_user) {
    throw DefiError.unsupported(
      `[${this.protocolName}] User position requires querying individual vToken balances`
    );
  }
};
var COMET_ABI = parseAbi17([
  "function getUtilization() external view returns (uint256)",
  "function getSupplyRate(uint256 utilization) external view returns (uint64)",
  "function getBorrowRate(uint256 utilization) external view returns (uint64)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrow() external view returns (uint256)",
  "function supply(address asset, uint256 amount) external",
  "function withdraw(address asset, uint256 amount) external"
]);
var SECONDS_PER_YEAR = 365.25 * 24 * 3600;
var CompoundV3Adapter = class {
  protocolName;
  comet;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const comet = contracts["comet_usdc"] ?? contracts["comet"] ?? contracts["comet_weth"];
    if (!comet) throw DefiError.contractError("Missing 'comet_usdc' or 'comet' address");
    this.comet = comet;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData16({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData16({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData16({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData16({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    const utilization = await client.readContract({
      address: this.comet,
      abi: COMET_ABI,
      functionName: "getUtilization"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] getUtilization failed: ${e}`);
    });
    const [supplyRate, borrowRate, totalSupply, totalBorrow] = await Promise.all([
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [utilization] }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] getSupplyRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [utilization] }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] getBorrowRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalBorrow" }).catch(() => 0n)
    ]);
    const supplyPerSec = Number(supplyRate) / 1e18;
    const borrowPerSec = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerSec * SECONDS_PER_YEAR * 100;
    const borrowApy = borrowPerSec * SECONDS_PER_YEAR * 100;
    const utilPct = Number(utilization) / 1e18 * 100;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: utilPct,
      total_supply: totalSupply,
      total_borrow: totalBorrow
    };
  }
  async getUserPosition(_user) {
    throw DefiError.unsupported(
      `[${this.protocolName}] User position requires querying Comet balanceOf + borrowBalanceOf`
    );
  }
};
var EULER_VAULT_ABI = parseAbi18([
  "function deposit(uint256 amount, address receiver) external returns (uint256)",
  "function withdraw(uint256 amount, address receiver, address owner) external returns (uint256)",
  "function borrow(uint256 amount, address receiver) external returns (uint256)",
  "function repay(uint256 amount, address receiver) external returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function interestRate() external view returns (uint256)"
]);
var SECONDS_PER_YEAR2 = 365.25 * 24 * 3600;
var EulerV2Adapter = class {
  protocolName;
  euler;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const euler = contracts["evk_vault"] ?? contracts["euler"] ?? contracts["markets"];
    if (!euler) throw DefiError.contractError("Missing 'evk_vault' or 'euler' contract address");
    this.euler = euler;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData17({
      abi: EULER_VAULT_ABI,
      functionName: "deposit",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Deposit ${params.amount} into Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData17({
      abi: EULER_VAULT_ABI,
      functionName: "borrow",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData17({
      abi: EULER_VAULT_ABI,
      functionName: "repay",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData17({
      abi: EULER_VAULT_ABI,
      functionName: "withdraw",
      args: [params.amount, params.to, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient14({ transport: http14(this.rpcUrl) });
    const [totalSupply, totalBorrows, interestRate] = await Promise.all([
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalBorrows" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] totalBorrows failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "interestRate" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] interestRate failed: ${e}`);
      })
    ]);
    const rateF64 = Number(interestRate) / 1e27;
    const borrowApy = rateF64 * SECONDS_PER_YEAR2 * 100;
    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? borrowF / supplyF * 100 : 0;
    const supplyApy = borrowApy * (borrowF / Math.max(supplyF, 1));
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrows
    };
  }
  async getUserPosition(_user) {
    throw DefiError.unsupported(
      `[${this.protocolName}] Euler V2 user positions require querying individual vault balances. Use the vault address directly to check balanceOf(user) for supply positions.`
    );
  }
};
var MORPHO_ABI = parseAbi19([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)"
]);
var META_MORPHO_ABI = parseAbi19([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
]);
var IRM_ABI = parseAbi19([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)"
]);
var SECONDS_PER_YEAR3 = 365.25 * 24 * 3600;
function defaultMarketParams(loanToken = zeroAddress8) {
  return {
    loanToken,
    collateralToken: zeroAddress8,
    oracle: zeroAddress8,
    irm: zeroAddress8,
    lltv: 0n
  };
}
function decodeMarket(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({
      abi: MORPHO_ABI,
      functionName: "market",
      data
    });
  } catch {
    return null;
  }
}
function decodeMarketParams(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      data
    });
  } catch {
    return null;
  }
}
var MorphoBlueAdapter = class {
  protocolName;
  morpho;
  defaultVault;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const morpho = contracts["morpho_blue"];
    if (!morpho) throw DefiError.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault = contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData18({
      abi: MORPHO_ABI,
      functionName: "supply",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData18({
      abi: MORPHO_ABI,
      functionName: "borrow",
      args: [market, params.amount, 0n, params.on_behalf_of, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData18({
      abi: MORPHO_ABI,
      functionName: "repay",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData18({
      abi: MORPHO_ABI,
      functionName: "withdraw",
      args: [market, params.amount, 0n, params.to, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      throw DefiError.contractError(`[${this.protocolName}] No MetaMorpho vault configured for rate query`);
    }
    const [queueLenRaw] = await multicallRead(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData18({ abi: META_MORPHO_ABI, functionName: "supplyQueueLength" })]
    ]).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`);
    });
    const queueLen = decodeU256(queueLenRaw ?? null);
    if (queueLen === 0n) {
      return {
        protocol: this.protocolName,
        asset,
        supply_apy: 0,
        borrow_variable_apy: 0,
        utilization: 0,
        total_supply: 0n,
        total_borrow: 0n
      };
    }
    const [marketIdRaw] = await multicallRead(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData18({ abi: META_MORPHO_ABI, functionName: "supplyQueue", args: [0n] })]
    ]).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`);
    });
    if (!marketIdRaw || marketIdRaw.length < 66) {
      throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) returned no data`);
    }
    const marketId = marketIdRaw.slice(0, 66);
    const [marketRaw, paramsRaw] = await multicallRead(this.rpcUrl, [
      [this.morpho, encodeFunctionData18({ abi: MORPHO_ABI, functionName: "market", args: [marketId] })],
      [this.morpho, encodeFunctionData18({ abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] })]
    ]).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] market/idToMarketParams failed: ${e}`);
    });
    const mktDecoded = decodeMarket(marketRaw ?? null);
    if (!mktDecoded) throw DefiError.rpcError(`[${this.protocolName}] market() returned no data`);
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mktDecoded;
    const paramsDecoded = decodeMarketParams(paramsRaw ?? null);
    if (!paramsDecoded) throw DefiError.rpcError(`[${this.protocolName}] idToMarketParams returned no data`);
    const [loanToken, collateralToken, oracle, irm, lltv] = paramsDecoded;
    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;
    const irmMarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };
    const borrowRatePerSec = await (async () => {
      const [borrowRateRaw] = await multicallRead(this.rpcUrl, [
        [irm, encodeFunctionData18({ abi: IRM_ABI, functionName: "borrowRateView", args: [irmMarketParams, irmMarket] })]
      ]).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`);
      });
      return decodeU256(borrowRateRaw ?? null);
    })();
    const ratePerSec = Number(borrowRatePerSec) / 1e18;
    const borrowApy = ratePerSec * SECONDS_PER_YEAR3 * 100;
    const feePct = Number(fee) / 1e18;
    const supplyApy = borrowApy * util * (1 - feePct);
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: util * 100,
      total_supply: totalSupplyAssets,
      total_borrow: totalBorrowAssets
    };
  }
  async getUserPosition(_user) {
    throw DefiError.unsupported(
      `[${this.protocolName}] Morpho Blue user positions are per-market \u2014 use vault deposit/withdraw instead`
    );
  }
};
var BORROWER_OPS_ABI = parseAbi20([
  "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
  "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
  "function closeTrove(uint256 _troveId) external"
]);
var TROVE_MANAGER_ABI = parseAbi20([
  "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)"
]);
var HINT_HELPERS_ABI = parseAbi20([
  "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)"
]);
var SORTED_TROVES_ABI = parseAbi20([
  "function findInsertPosition(uint256 _annualInterestRate, uint256 _prevId, uint256 _nextId) external view returns (uint256 prevId, uint256 nextId)"
]);
var FelixCdpAdapter = class {
  protocolName;
  borrowerOperations;
  troveManager;
  hintHelpers;
  sortedTroves;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const bo = contracts["borrower_operations"];
    if (!bo) throw DefiError.contractError("Missing 'borrower_operations' contract");
    this.borrowerOperations = bo;
    this.troveManager = contracts["trove_manager"];
    this.hintHelpers = contracts["hint_helpers"];
    this.sortedTroves = contracts["sorted_troves"];
  }
  name() {
    return this.protocolName;
  }
  async getHints(interestRate) {
    if (!this.hintHelpers || !this.sortedTroves || !this.rpcUrl) {
      return [0n, 0n];
    }
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    const approxResult = await client.readContract({
      address: this.hintHelpers,
      abi: HINT_HELPERS_ABI,
      functionName: "getApproxHint",
      args: [0n, interestRate, 15n, 42n]
    }).catch(() => null);
    if (!approxResult) return [0n, 0n];
    const [hintId] = approxResult;
    const insertResult = await client.readContract({
      address: this.sortedTroves,
      abi: SORTED_TROVES_ABI,
      functionName: "findInsertPosition",
      args: [interestRate, hintId, hintId]
    }).catch(() => null);
    if (!insertResult) return [0n, 0n];
    const [prevId, nextId] = insertResult;
    return [prevId, nextId];
  }
  async buildOpen(params) {
    const interestRate = 50000000000000000n;
    const [upperHint, lowerHint] = await this.getHints(interestRate);
    const hasHints = upperHint !== 0n || lowerHint !== 0n;
    const data = encodeFunctionData19({
      abi: BORROWER_OPS_ABI,
      functionName: "openTrove",
      args: [
        params.recipient,
        0n,
        params.collateral_amount,
        params.debt_amount,
        upperHint,
        lowerHint,
        interestRate,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        // U256::MAX
        params.recipient,
        params.recipient,
        params.recipient
      ]
    });
    return {
      description: `[${this.protocolName}] Open trove: collateral=${params.collateral_amount}, debt=${params.debt_amount} (hints=${hasHints ? "optimized" : "none"})`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: hasHints ? 5e5 : 5e6
    };
  }
  async buildAdjust(params) {
    const collChange = params.collateral_delta ?? 0n;
    const debtChange = params.debt_delta ?? 0n;
    const data = encodeFunctionData19({
      abi: BORROWER_OPS_ABI,
      functionName: "adjustTrove",
      args: [
        params.cdp_id,
        collChange,
        params.add_collateral,
        debtChange,
        params.add_debt,
        0n,
        0n,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      ]
    });
    return {
      description: `[${this.protocolName}] Adjust trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 4e5
    };
  }
  async buildClose(params) {
    const data = encodeFunctionData19({
      abi: BORROWER_OPS_ABI,
      functionName: "closeTrove",
      args: [params.cdp_id]
    });
    return {
      description: `[${this.protocolName}] Close trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async getCdpInfo(cdpId) {
    if (!this.rpcUrl) throw DefiError.rpcError(`[${this.protocolName}] getCdpInfo requires RPC \u2014 set HYPEREVM_RPC_URL`);
    if (!this.troveManager) throw DefiError.contractError(`[${this.protocolName}] trove_manager contract not configured`);
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    const data = await client.readContract({
      address: this.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getLatestTroveData",
      args: [cdpId]
    }).catch((e) => {
      throw DefiError.invalidParam(`[${this.protocolName}] Trove ${cdpId} not found: ${e}`);
    });
    const [entireDebt, entireColl] = data;
    if (entireDebt === 0n && entireColl === 0n) {
      throw DefiError.invalidParam(`[${this.protocolName}] Trove ${cdpId} does not exist`);
    }
    const collRatio = entireDebt > 0n ? Number(entireColl) / Number(entireDebt) : 0;
    return {
      protocol: this.protocolName,
      cdp_id: cdpId,
      collateral: {
        token: zeroAddress9,
        symbol: "WHYPE",
        amount: entireColl,
        decimals: 18
      },
      debt: {
        token: zeroAddress9,
        symbol: "feUSD",
        amount: entireDebt,
        decimals: 18
      },
      collateral_ratio: collRatio
    };
  }
};
var PRICE_FEED_ABI = parseAbi21([
  "function fetchPrice() external view returns (uint256 price, bool isNewOracleFailureDetected)",
  "function lastGoodPrice() external view returns (uint256)"
]);
var FelixOracleAdapter = class {
  protocolName;
  priceFeed;
  asset;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const feed = contracts["price_feed"];
    if (!feed) throw DefiError.contractError(`[${entry.name}] Missing 'price_feed' contract address`);
    this.priceFeed = feed;
    this.asset = contracts["asset"] ?? "0x0000000000000000000000000000000000000000";
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    if (asset !== this.asset && this.asset !== "0x0000000000000000000000000000000000000000") {
      throw DefiError.unsupported(`[${this.protocolName}] Felix PriceFeed only supports asset ${this.asset}`);
    }
    const client = createPublicClient16({ transport: http16(this.rpcUrl) });
    let priceVal;
    try {
      const result = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice"
      });
      const [price] = result;
      priceVal = price;
    } catch {
      priceVal = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "lastGoodPrice"
      }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] lastGoodPrice failed: ${e}`);
      });
    }
    const priceF64 = Number(priceVal) / 1e18;
    return {
      source: "Felix PriceFeed",
      source_type: "oracle",
      asset,
      price_usd: priceVal,
      price_f64: priceF64
    };
  }
  async getPrices(assets) {
    const results = [];
    for (const asset of assets) {
      try {
        results.push(await this.getPrice(asset));
      } catch {
      }
    }
    return results;
  }
};
var ERC4626_ABI = parseAbi222([
  "function asset() external view returns (address)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)"
]);
var ERC4626VaultAdapter = class {
  protocolName;
  vaultAddress;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError.contractError("Missing 'vault' contract address");
    this.vaultAddress = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildDeposit(assets, receiver) {
    const data = encodeFunctionData20({
      abi: ERC4626_ABI,
      functionName: "deposit",
      args: [assets, receiver]
    });
    return {
      description: `[${this.protocolName}] Deposit ${assets} assets into vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildWithdraw(assets, receiver, owner) {
    const data = encodeFunctionData20({
      abi: ERC4626_ABI,
      functionName: "withdraw",
      args: [assets, receiver, owner]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${assets} assets from vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async totalAssets() {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
    });
  }
  async convertToShares(assets) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] convertToShares failed: ${e}`);
    });
  }
  async convertToAssets(shares) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares]
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] convertToAssets failed: ${e}`);
    });
  }
  async getVaultInfo() {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    const [totalAssets, totalSupply, asset] = await Promise.all([
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalAssets" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "asset" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] asset failed: ${e}`);
      })
    ]);
    return {
      protocol: this.protocolName,
      vault_address: this.vaultAddress,
      asset,
      total_assets: totalAssets,
      total_supply: totalSupply
    };
  }
};
var GENERIC_LST_ABI = parseAbi23([
  "function stake() external payable returns (uint256)",
  "function unstake(uint256 amount) external returns (uint256)"
]);
var GenericLstAdapter = class {
  protocolName;
  staking;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract");
    this.staking = staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData21({ abi: GENERIC_LST_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData21({
      abi: GENERIC_LST_ABI,
      functionName: "unstake",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Unstake ${params.amount}`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async getInfo() {
    throw DefiError.unsupported(`[${this.protocolName}] getInfo requires RPC`);
  }
};
var STHYPE_ABI = parseAbi24([
  "function submit(address referral) external payable returns (uint256)",
  "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)"
]);
var ERC20_ABI3 = parseAbi24([
  "function totalSupply() external view returns (uint256)"
]);
var StHypeAdapter = class {
  protocolName;
  staking;
  sthypeToken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract");
    this.staking = staking;
    this.sthypeToken = entry.contracts?.["sthype_token"];
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData222({
      abi: STHYPE_ABI,
      functionName: "submit",
      args: [zeroAddress10]
    });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for stHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData222({
      abi: STHYPE_ABI,
      functionName: "requestWithdrawals",
      args: [[params.amount], params.recipient]
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} stHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async getInfo() {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    const tokenAddr = this.sthypeToken ?? this.staking;
    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI3,
      functionName: "totalSupply"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
    });
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress10,
      liquid_token: tokenAddr,
      exchange_rate: 1,
      total_staked: totalSupply
    };
  }
};
var KINETIQ_ABI = parseAbi25([
  "function stake() external payable returns (uint256)",
  "function requestUnstake(uint256 amount) external returns (uint256)",
  "function totalStaked() external view returns (uint256)"
]);
var ORACLE_ABI3 = parseAbi25([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var WHYPE = "0x5555555555555555555555555555555555555555";
var HYPERLEND_ORACLE = "0xc9fb4fbe842d57ea1df3e641a281827493a63030";
var KinetiqAdapter = class {
  protocolName;
  staking;
  liquidToken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError.contractError("Missing 'staking' contract address");
    this.staking = staking;
    this.liquidToken = entry.contracts?.["khype_token"] ?? staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData23({ abi: KINETIQ_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 3e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData23({
      abi: KINETIQ_ABI,
      functionName: "requestUnstake",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} kHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async getInfo() {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient19({ transport: http19(this.rpcUrl) });
    const totalStaked = await client.readContract({
      address: this.staking,
      abi: KINETIQ_ABI,
      functionName: "totalStaked"
    }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] totalStaked failed: ${e}`);
    });
    const [khypePrice, hypePrice] = await Promise.all([
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [this.liquidToken] }).catch(() => 0n),
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [WHYPE] }).catch(() => 0n)
    ]);
    const rateF64 = hypePrice > 0n && khypePrice > 0n ? Number(khypePrice * 10n ** 18n / hypePrice) / 1e18 : 1;
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress11,
      liquid_token: this.liquidToken,
      exchange_rate: rateF64,
      total_staked: totalStaked
    };
  }
};
var HLP_ABI = parseAbi26([
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)"
]);
var RYSK_ABI = parseAbi27([
  "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
  "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)"
]);
var ERC721_ABI = parseAbi28([
  "function name() returns (string)",
  "function symbol() returns (string)",
  "function totalSupply() returns (uint256)",
  "function ownerOf(uint256 tokenId) returns (address)",
  "function balanceOf(address owner) returns (uint256)",
  "function tokenURI(uint256 tokenId) returns (string)"
]);
var ERC721Adapter = class {
  protocolName;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  async getCollectionInfo(collection) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient20({ transport: http20(this.rpcUrl) });
    const [collectionName, symbol, totalSupply] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "name" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] name failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "symbol" }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] symbol failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "totalSupply" }).catch(() => void 0)
    ]);
    return {
      address: collection,
      name: collectionName,
      symbol,
      total_supply: totalSupply
    };
  }
  async getTokenInfo(collection, tokenId) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient20({ transport: http20(this.rpcUrl) });
    const [owner, tokenUri] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] }).catch((e) => {
        throw DefiError.rpcError(`[${this.protocolName}] ownerOf failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "tokenURI", args: [tokenId] }).catch(() => void 0)
    ]);
    return {
      collection,
      token_id: tokenId,
      owner,
      token_uri: tokenUri
    };
  }
  async getBalance(owner, collection) {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient20({ transport: http20(this.rpcUrl) });
    return client.readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] }).catch((e) => {
      throw DefiError.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
    });
  }
};
function createDex(entry, rpcUrl) {
  switch (entry.interface) {
    case "uniswap_v3":
      return new UniswapV3Adapter(entry, rpcUrl);
    case "uniswap_v4":
      throw DefiError.unsupported(
        `[${entry.name}] Uniswap V4 (singleton PoolManager) is not yet supported \u2014 use HyperSwap V3 or another V3-compatible DEX for quotes`
      );
    case "algebra_v3":
      return new AlgebraV3Adapter(entry, rpcUrl);
    case "uniswap_v2":
      return new UniswapV2Adapter(entry, rpcUrl);
    case "solidly_v2":
    case "solidly_cl":
      return new SolidlyAdapter(entry, rpcUrl);
    case "hybra":
      return new ThenaCLAdapter(entry, rpcUrl);
    case "curve_stableswap":
      return new CurveStableSwapAdapter(entry);
    case "balancer_v3":
      return new BalancerV3Adapter(entry);
    case "woofi":
      return new WooFiAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`DEX interface '${entry.interface}' not yet implemented`);
  }
}
function createLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveV3Adapter(entry, rpcUrl);
    case "aave_v2":
      return new AaveV2Adapter(entry, rpcUrl);
    case "morpho_blue":
      return new MorphoBlueAdapter(entry, rpcUrl);
    case "euler_v2":
      return new EulerV2Adapter(entry, rpcUrl);
    case "compound_v2":
      return new CompoundV2Adapter(entry, rpcUrl);
    case "compound_v3":
      return new CompoundV3Adapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Lending interface '${entry.interface}' not yet implemented`);
  }
}
function createCdp(entry, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixCdpAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`CDP interface '${entry.interface}' not yet implemented`);
  }
}
function createVault(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc4626":
    case "beefy_vault":
      return new ERC4626VaultAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Vault interface '${entry.interface}' not yet implemented`);
  }
}
function createLiquidStaking(entry, rpcUrl) {
  switch (entry.interface) {
    case "kinetiq_staking":
      return new KinetiqAdapter(entry, rpcUrl);
    case "sthype_staking":
      return new StHypeAdapter(entry, rpcUrl);
    case "hyperbeat_lst":
    case "kintsu":
      return new GenericLstAdapter(entry, rpcUrl);
    default:
      return new GenericLstAdapter(entry, rpcUrl);
  }
}
function createGauge(entry, rpcUrl) {
  switch (entry.interface) {
    case "solidly_v2":
    case "solidly_cl":
    case "algebra_v3":
    case "hybra":
      return new HybraGaugeAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Gauge interface '${entry.interface}' not supported`);
  }
}
function createMasterChef(entry, rpcUrl) {
  return new MasterChefAdapter(entry, rpcUrl);
}
function createNft(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc721":
      return new ERC721Adapter(entry, rpcUrl);
    case "marketplace":
      throw DefiError.unsupported(`NFT marketplace '${entry.name}' is not queryable as ERC-721. Use a specific collection address.`);
    default:
      throw DefiError.unsupported(`NFT interface '${entry.interface}' not supported`);
  }
}
function createOracleFromLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Oracle not available for lending interface '${entry.interface}'`);
  }
}
function createOracleFromCdp(entry, _asset, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Oracle not available for CDP interface '${entry.interface}'`);
  }
}
function createMerchantMoeLB(entry, rpcUrl) {
  return new MerchantMoeLBAdapter(entry, rpcUrl);
}
function createKittenSwapFarming(entry, rpcUrl) {
  const farmingCenter = entry.contracts?.["farming_center"];
  if (!farmingCenter) {
    throw new DefiError("CONTRACT_ERROR", `[${entry.name}] Missing 'farming_center' contract address`);
  }
  const eternalFarming = entry.contracts?.["eternal_farming"];
  if (!eternalFarming) {
    throw new DefiError("CONTRACT_ERROR", `[${entry.name}] Missing 'eternal_farming' contract address`);
  }
  const positionManager = entry.contracts?.["position_manager"];
  if (!positionManager) {
    throw new DefiError("CONTRACT_ERROR", `[${entry.name}] Missing 'position_manager' contract address`);
  }
  return new KittenSwapFarmingAdapter(entry.name, farmingCenter, eternalFarming, positionManager, rpcUrl);
}
var gaugeAbi = parseAbi29([
  "function deposit(uint256 amount) external",
  "function depositFor(uint256 amount, uint256 tokenId) external",
  "function withdraw(uint256 amount) external",
  "function getReward() external",
  "function getReward(address account) external",
  "function getReward(address account, address[] tokens) external",
  "function getReward(uint256 tokenId) external",
  "function earned(address account) external view returns (uint256)",
  "function earned(address token, address account) external view returns (uint256)",
  "function earned(uint256 tokenId) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function rewardToken() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function rewardsListLength() external view returns (uint256)",
  "function rewardData(address token) external view returns (uint256 periodFinish, uint256 rewardRate, uint256 lastUpdateTime, uint256 rewardPerTokenStored)",
  "function nonfungiblePositionManager() external view returns (address)"
]);
var veAbi2 = parseAbi29([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
  "function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)"
]);
var voterAbi2 = parseAbi29([
  "function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external",
  "function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external",
  "function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external",
  "function gauges(address pool) external view returns (address)",
  "function gaugeForPool(address pool) external view returns (address)",
  "function poolToGauge(address pool) external view returns (address)"
]);
var DexSpotPrice = class {
  /**
   * Get the spot price for `token` denominated in `quoteToken` (e.g. USDC).
   *
   * `tokenDecimals` — decimals of the input token (to know how much "1 unit" is)
   * `quoteDecimals` — decimals of the quote token (to convert the output to number)
   */
  static async getPrice(dex, token, tokenDecimals, quoteToken, quoteDecimals) {
    const amountIn = 10n ** BigInt(tokenDecimals);
    const quoteParams = {
      protocol: "",
      token_in: token,
      token_out: quoteToken,
      amount_in: amountIn
    };
    const quote = await dex.quote(quoteParams);
    const priceF64 = Number(quote.amount_out) / 10 ** quoteDecimals;
    let priceUsd;
    if (quoteDecimals < 18) {
      priceUsd = quote.amount_out * 10n ** BigInt(18 - quoteDecimals);
    } else if (quoteDecimals > 18) {
      priceUsd = quote.amount_out / 10n ** BigInt(quoteDecimals - 18);
    } else {
      priceUsd = quote.amount_out;
    }
    return {
      source: `dex:${dex.name()}`,
      source_type: "dex_spot",
      asset: token,
      price_usd: priceUsd,
      price_f64: priceF64,
      block_number: void 0,
      timestamp: void 0
    };
  }
};

// src/commands/dex.ts
function registerDex(parent, getOpts, makeExecutor2) {
  const dex = parent.command("dex").description("DEX operations: swap, quote, compare");
  dex.command("quote").description("Get a swap quote without executing").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-in <token>", "Input token symbol or address").requiredOption("--token-out <token>", "Output token symbol or address").requiredOption("--amount <amount>", "Amount of input token in wei").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
  dex.command("lp-add").description("Add liquidity to a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-a <token>", "First token symbol or address").requiredOption("--token-b <token>", "Second token symbol or address").requiredOption("--amount-a <amount>", "Amount of token A in wei").requiredOption("--amount-b <amount>", "Amount of token B in wei").option("--recipient <address>", "Recipient address").option("--tick-lower <tick>", "Lower tick for concentrated LP (default: full range)").option("--tick-upper <tick>", "Upper tick for concentrated LP (default: full range)").option("--range <percent>", "\xB1N% concentrated range around current price (e.g. --range 2 for \xB12%)").option("--pool <name_or_address>", "Pool name (e.g. WHYPE/USDC) or address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createDex(protocol, chain.effectiveRpcUrl());
    const tokenA = opts.tokenA.startsWith("0x") ? opts.tokenA : registry.resolveToken(chainName, opts.tokenA).address;
    const tokenB = opts.tokenB.startsWith("0x") ? opts.tokenB : registry.resolveToken(chainName, opts.tokenB).address;
    const recipient = opts.recipient ?? process.env.DEFI_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";
    let poolAddr;
    if (opts.pool) {
      if (opts.pool.startsWith("0x")) {
        poolAddr = opts.pool;
      } else {
        const poolInfo = registry.resolvePool(opts.protocol, opts.pool);
        poolAddr = poolInfo.address;
      }
    }
    const tx = await adapter.buildAddLiquidity({
      protocol: protocol.name,
      token_a: tokenA,
      token_b: tokenB,
      amount_a: BigInt(opts.amountA),
      amount_b: BigInt(opts.amountB),
      recipient,
      tick_lower: opts.tickLower !== void 0 ? parseInt(opts.tickLower) : void 0,
      tick_upper: opts.tickUpper !== void 0 ? parseInt(opts.tickUpper) : void 0,
      range_pct: opts.range !== void 0 ? parseFloat(opts.range) : void 0,
      pool: poolAddr
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  dex.command("lp-remove").description("Remove liquidity from a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-a <token>", "First token symbol or address").requiredOption("--token-b <token>", "Second token symbol or address").requiredOption("--liquidity <amount>", "Liquidity amount to remove in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
import { privateKeyToAccount as privateKeyToAccount2 } from "viem/accounts";
function resolveAccount() {
  const walletAddr = process.env["DEFI_WALLET_ADDRESS"];
  if (walletAddr) return walletAddr;
  const privateKey = process.env["DEFI_PRIVATE_KEY"];
  if (privateKey) return privateKeyToAccount2(privateKey).address;
  return void 0;
}
function registerGauge(parent, getOpts, makeExecutor2) {
  const gauge = parent.command("gauge").description("Gauge operations: find, deposit, withdraw, claim, earned");
  gauge.command("find").description("Find gauge address for a pool via voter contract").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pool <address>", "Pool address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, chain.effectiveRpcUrl());
    if (!adapter.resolveGauge) throw new Error(`${protocol.name} does not support gauge lookup`);
    const gaugeAddr = await adapter.resolveGauge(opts.pool);
    printOutput({ pool: opts.pool, gauge: gaugeAddr, protocol: protocol.name }, getOpts());
  });
  gauge.command("earned").description("Check pending rewards for a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, chain.effectiveRpcUrl());
    if (opts.tokenId) {
      if (!adapter.getPendingRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT rewards`);
      const earned = await adapter.getPendingRewardsByTokenId(opts.gauge, BigInt(opts.tokenId));
      printOutput({ gauge: opts.gauge, token_id: opts.tokenId, earned: earned.toString() }, getOpts());
    } else {
      const account = resolveAccount();
      if (!account) throw new Error("DEFI_WALLET_ADDRESS or DEFI_PRIVATE_KEY required");
      const rewards = await adapter.getPendingRewards(opts.gauge, account);
      printOutput(rewards.map((r) => ({ token: r.token, amount: r.amount.toString() })), getOpts());
    }
  });
  gauge.command("deposit").description("Deposit LP tokens or NFT into a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").option("--amount <amount>", "LP token amount in wei (for V2 gauges)").option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, chain.effectiveRpcUrl());
    const amount = opts.amount ? BigInt(opts.amount) : 0n;
    const tokenId = opts.tokenId ? BigInt(opts.tokenId) : void 0;
    const tx = await adapter.buildDeposit(opts.gauge, amount, tokenId);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("withdraw").description("Withdraw LP tokens or NFT from a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").option("--amount <amount>", "LP token amount in wei (for V2 gauges)").option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, chain.effectiveRpcUrl());
    const amount = opts.amount ? BigInt(opts.amount) : 0n;
    const tokenId = opts.tokenId ? BigInt(opts.tokenId) : void 0;
    const tx = await adapter.buildWithdraw(opts.gauge, amount, tokenId);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  gauge.command("claim").description("Claim earned rewards from a gauge").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--gauge <address>", "Gauge contract address").option("--token-id <id>", "NFT tokenId (for CL gauges like Hybra)").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createGauge(protocol, chain.effectiveRpcUrl());
    if (opts.tokenId) {
      if (!adapter.buildClaimRewardsByTokenId) throw new Error(`${protocol.name} does not support NFT claim`);
      const tx = await adapter.buildClaimRewardsByTokenId(opts.gauge, BigInt(opts.tokenId));
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    } else {
      const account = resolveAccount();
      const tx = await adapter.buildClaimRewards(opts.gauge, account);
      const result = await executor.execute(tx);
      printOutput(result, getOpts());
    }
  });
}

// src/commands/lending.ts
function registerLending(parent, getOpts, makeExecutor2) {
  const lending = parent.command("lending").description("Lending operations: supply, borrow, repay, withdraw, rates, position");
  lending.command("rates").description("Show current lending rates").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const asset = opts.asset.startsWith("0x") ? opts.asset : registry.resolveToken(chainName, opts.asset).address;
    const rates = await adapter.getRates(asset);
    printOutput(rates, getOpts());
  });
  lending.command("position").description("Show current lending position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLending(protocol, chain.effectiveRpcUrl());
    const position = await adapter.getUserPosition(opts.address);
    printOutput(position, getOpts());
  });
  lending.command("supply").description("Supply an asset to a lending protocol").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--asset <token>", "Token symbol or address").requiredOption("--amount <amount>", "Amount to supply in wei").option("--on-behalf-of <address>", "On behalf of address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
function registerCdp(parent, getOpts, makeExecutor2) {
  const cdp = parent.command("cdp").description("CDP operations: open, adjust, close, info");
  cdp.command("open").description("Open a new CDP position").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--collateral <token>", "Collateral token address").requiredOption("--amount <amount>", "Collateral amount in wei").requiredOption("--mint <amount>", "Stablecoin to mint in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createCdp(protocol, chain.effectiveRpcUrl());
    const tx = await adapter.buildClose({ protocol: protocol.name, cdp_id: BigInt(opts.position) });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/staking.ts
function registerStaking(parent, getOpts, makeExecutor2) {
  const staking = parent.command("staking").description("Liquid staking: stake, unstake, info");
  staking.command("stake").description("Stake tokens via liquid staking").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createLiquidStaking(protocol, chain.effectiveRpcUrl());
    const info = await adapter.getInfo();
    printOutput(info, getOpts());
  });
}

// src/commands/vault.ts
function registerVault(parent, getOpts, makeExecutor2) {
  const vault = parent.command("vault").description("Vault operations: deposit, withdraw, info");
  vault.command("deposit").description("Deposit assets into a vault").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--amount <amount>", "Amount in wei").option("--receiver <address>", "Receiver address for vault shares").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createVault(protocol, chain.effectiveRpcUrl());
    const info = await adapter.getVaultInfo();
    printOutput(info, getOpts());
  });
}

// src/commands/yield.ts
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
      const lending = createLending(proto, rpc);
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
        const lending = createLending(proto, rpc);
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
        const vault = createVault(proto, rpc);
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
          const lending = createLending(proto, rpc);
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
          const lending = createLending(proto, rpc);
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
      const registry = Registry.loadEmbedded();
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
      const registry = Registry.loadEmbedded();
      await runYieldScan(registry, opts.asset, getOpts());
    } catch (err) {
      printOutput({ error: String(err) }, getOpts());
      process.exit(1);
    }
  });
  yieldCmd.command("execute").description("Find the best yield opportunity and execute supply (or show cross-chain plan)").requiredOption("--asset <token>", "Token symbol or address (e.g. USDC)").requiredOption("--amount <amount>", "Human-readable amount to supply (e.g. 1000)").option("--min-spread <percent>", "Minimum spread % required to execute cross-chain arb", "1.0").option("--target-chain <chain>", "Override auto-detected best chain").option("--target-protocol <protocol>", "Override auto-detected best protocol slug").action(async (opts) => {
    try {
      const registry = Registry.loadEmbedded();
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
            const lending = createLending(c, rpc);
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
      const adapter = createLending(proto, rpc);
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
      const registry = Registry.loadEmbedded();
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
import { encodeFunctionData as encodeFunctionData28, parseAbi as parseAbi31 } from "viem";

// src/portfolio-tracker.ts
import { mkdirSync, writeFileSync, readdirSync as readdirSync2, readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { homedir } from "os";
import { resolve as resolve2 } from "path";
import { encodeFunctionData as encodeFunctionData27, parseAbi as parseAbi30 } from "viem";
var ERC20_ABI4 = parseAbi30([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var ORACLE_ABI4 = parseAbi30([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var POOL_ABI3 = parseAbi30([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
function decodeU256Word(data, wordOffset = 0) {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}
function snapshotDir() {
  return resolve2(homedir(), ".defi-cli", "snapshots");
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
      encodeFunctionData27({ abi: ERC20_ABI4, functionName: "balanceOf", args: [user] })
    ]);
    callLabels.push(`balance:${t.symbol}`);
  }
  const lendingProtocols = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3").filter((p) => p.contracts?.["pool"]);
  for (const p of lendingProtocols) {
    calls.push([
      p.contracts["pool"],
      encodeFunctionData27({ abi: POOL_ABI3, functionName: "getUserAccountData", args: [user] })
    ]);
    callLabels.push(`lending:${p.name}`);
  }
  const oracleEntry = registry.getProtocolsForChain(chainName).find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
  const oracleAddr = oracleEntry?.contracts?.["oracle"];
  const wrappedNative = chain.wrapped_native ?? "0x5555555555555555555555555555555555555555";
  if (oracleAddr) {
    calls.push([
      oracleAddr,
      encodeFunctionData27({ abi: ORACLE_ABI4, functionName: "getAssetPrice", args: [wrappedNative] })
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
  const filepath = resolve2(dir, filename);
  writeFileSync(filepath, JSON.stringify(snapshot, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  return filepath;
}
function loadSnapshots(chain, wallet, limit = 10) {
  const dir = snapshotDir();
  if (!existsSync2(dir)) return [];
  const prefix = `${chain}_${wallet}_`;
  const files = readdirSync2(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort().reverse().slice(0, limit);
  return files.map((f) => {
    const raw = JSON.parse(readFileSync2(resolve2(dir, f), "utf-8"));
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
var ERC20_ABI5 = parseAbi31([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var POOL_ABI4 = parseAbi31([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
var ORACLE_ABI5 = parseAbi31([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
function decodeU2562(data, wordOffset = 0) {
  if (!data || data.length < 2 + (wordOffset + 1) * 64) return 0n;
  const hex = data.slice(2 + wordOffset * 64, 2 + wordOffset * 64 + 64);
  return BigInt("0x" + hex);
}
function registerPortfolio(parent, getOpts) {
  const portfolio = parent.command("portfolio").description("Aggregate positions across all protocols");
  portfolio.command("show").description("Show current portfolio positions").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const mode = getOpts();
    const registry = Registry.loadEmbedded();
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
        encodeFunctionData28({ abi: ERC20_ABI5, functionName: "balanceOf", args: [user] })
      ]);
      callLabels.push(`balance:${symbol}`);
    }
    const lendingProtocols = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3").filter((p) => p.contracts?.["pool"]);
    for (const p of lendingProtocols) {
      calls.push([
        p.contracts["pool"],
        encodeFunctionData28({ abi: POOL_ABI4, functionName: "getUserAccountData", args: [user] })
      ]);
      callLabels.push(`lending:${p.name}`);
    }
    const oracleEntry = registry.getProtocolsForChain(chainName).find((p) => p.interface === "aave_v3" && p.contracts?.["oracle"]);
    const oracleAddr = oracleEntry?.contracts?.["oracle"];
    const wrappedNative = chain.wrapped_native ?? "0x5555555555555555555555555555555555555555";
    if (oracleAddr) {
      calls.push([
        oracleAddr,
        encodeFunctionData28({ abi: ORACLE_ABI5, functionName: "getAssetPrice", args: [wrappedNative] })
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
      results = await multicallRead(rpc, calls);
    } catch (e) {
      printOutput({ error: `Multicall failed: ${e instanceof Error ? e.message : String(e)}` }, mode);
      return;
    }
    let nativePriceUsd = 0;
    if (oracleAddr) {
      const priceData = results[results.length - 1] ?? null;
      nativePriceUsd = Number(decodeU2562(priceData)) / 1e8;
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
      const balance = decodeU2562(results[idx] ?? null);
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
        const collateral = Number(decodeU2562(data, 0)) / 1e8;
        const debt = Number(decodeU2562(data, 1)) / 1e8;
        const hfRaw = decodeU2562(data, 5);
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    (p) => p.category === ProtocolCategory.Lending
  );
  const results = await Promise.all(
    protocols.map(async (proto) => {
      try {
        const adapter = createLending(proto, rpc);
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
      const registry = Registry.loadEmbedded();
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
      const registry = Registry.loadEmbedded();
      const chain = registry.getChain(chainName);
      const protocol = registry.getProtocol(opts.protocol);
      const adapter = createLending(protocol, chain.effectiveRpcUrl());
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
function registerAlert(parent, getOpts) {
  parent.command("alert").description("Alert on DEX vs Oracle price deviation").option("--threshold <pct>", "Deviation threshold in percent", "5.0").option("--once", "Run once instead of continuously").option("--interval <secs>", "Polling interval in seconds", "60").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const rpcUrl = chain.effectiveRpcUrl();
    const threshold = parseFloat(opts.threshold);
    const dexProtocols = registry.getProtocolsByCategory("dex").filter((p) => p.chain === chainName);
    const lendingProtocols = registry.getProtocolsByCategory("lending").filter((p) => p.chain === chainName);
    const poll = async () => {
      const alerts = [];
      for (const p of dexProtocols) {
        try {
          const dex = createDex(p, rpcUrl);
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
import { encodeFunctionData as encodeFunctionData29, parseAbi as parseAbi33 } from "viem";
var AAVE_ORACLE_ABI = parseAbi33([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var UNIV2_ROUTER_ABI = parseAbi33([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)"
]);
var VTOKEN_ABI = parseAbi33([
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
      const registry = Registry.loadEmbedded();
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
        (p) => p.category === ProtocolCategory.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated")
      ).flatMap((p) => {
        const oracleAddr = p.contracts?.["oracle"];
        if (!oracleAddr) return [];
        const decimals = p.interface === "aave_v2" ? 18 : 8;
        return [{ name: p.name, addr: oracleAddr, decimals }];
      });
      const dexProto = registry.getProtocolsForChain(chainName).find((p) => p.category === ProtocolCategory.Dex && p.interface === "uniswap_v2");
      const dexRouter = dexProto?.contracts?.["router"];
      const compoundForks = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "compound_v2").map((p) => ({
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
                encodeFunctionData29({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] })
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
                encodeFunctionData29({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] })
              ]);
            }
          }
        }
        if (doStable && usdc && usdt && dexRouter) {
          callTypes.push({ kind: "stable", from: "USDC", to: "USDT", outDecimals: usdt.decimals });
          calls.push([
            dexRouter,
            encodeFunctionData29({
              abi: UNIV2_ROUTER_ABI,
              functionName: "getAmountsOut",
              args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]]
            })
          ]);
          callTypes.push({ kind: "stable", from: "USDT", to: "USDC", outDecimals: usdc.decimals });
          calls.push([
            dexRouter,
            encodeFunctionData29({
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
              calls.push([addr, encodeFunctionData29({ abi: VTOKEN_ABI, functionName: "exchangeRateStored", args: [] })]);
            }
          }
        }
        if (calls.length === 0) {
          printOutput({ error: `No scannable resources found on ${chainName}` }, getOpts());
          return;
        }
        const results = await multicallRead(rpc, calls);
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
        (p) => p.category === ProtocolCategory.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2" || p.interface === "aave_v3_isolated")
      ).flatMap((p) => {
        const oracleAddr = p.contracts?.["oracle"];
        if (!oracleAddr) return [];
        return [{ name: p.name, addr: oracleAddr, decimals: p.interface === "aave_v2" ? 18 : 8 }];
      });
      const dexProto = registry.getProtocolsForChain(chainName).find((p) => p.category === ProtocolCategory.Dex && p.interface === "uniswap_v2");
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
            calls.push([oracle.addr, encodeFunctionData29({ abi: AAVE_ORACLE_ABI, functionName: "getAssetPrice", args: [token.address] })]);
          }
        }
        if (dexRouter) {
          for (const token of scanTokens) {
            const path = wrappedNative && token.address.toLowerCase() === wrappedNative.toLowerCase() ? [token.address, quoteStable.address] : wrappedNative ? [token.address, wrappedNative, quoteStable.address] : [token.address, quoteStable.address];
            cts.push({ kind: "dex", token: token.symbol, dec: quoteStable.decimals });
            calls.push([dexRouter, encodeFunctionData29({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(token.decimals), path] })]);
          }
        }
      }
      if (doStable && usdc && usdt && dexRouter) {
        cts.push({ kind: "stable", from: "USDC", to: "USDT", dec: usdt.decimals });
        calls.push([dexRouter, encodeFunctionData29({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdc.decimals), [usdc.address, usdt.address]] })]);
        cts.push({ kind: "stable", from: "USDT", to: "USDC", dec: usdc.decimals });
        calls.push([dexRouter, encodeFunctionData29({ abi: UNIV2_ROUTER_ABI, functionName: "getAmountsOut", args: [BigInt(10) ** BigInt(usdt.decimals), [usdt.address, usdc.address]] })]);
      }
      if (calls.length === 0) return null;
      const ct0 = Date.now();
      const results = await multicallRead(rpc, calls);
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
function registerArb(parent, getOpts, makeExecutor2) {
  parent.command("arb").description("Detect arbitrage opportunities across DEXes").option("--token-in <token>", "Base token (default: WHYPE)", "WHYPE").option("--token-out <token>", "Quote token (default: USDC)", "USDC").option("--amount <amount>", "Test amount in wei", "1000000000000000000").option("--execute", "Execute best arb (default: analysis only)").option("--min-profit <bps>", "Min profit in bps to execute", "10").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const rpcUrl = chain.effectiveRpcUrl();
    const tokenIn = opts.tokenIn.startsWith("0x") ? opts.tokenIn : registry.resolveToken(chainName, opts.tokenIn).address;
    const tokenOut = opts.tokenOut.startsWith("0x") ? opts.tokenOut : registry.resolveToken(chainName, opts.tokenOut).address;
    const amountIn = BigInt(opts.amount);
    const dexProtocols = registry.getProtocolsByCategory("dex").filter((p) => p.chain === chainName);
    const quotes = [];
    for (const p of dexProtocols) {
      try {
        const adapter = createDex(p, rpcUrl);
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
import { encodeFunctionData as encodeFunctionData30, parseAbi as parseAbi34 } from "viem";
var ERC20_ABI6 = parseAbi34([
  "function balanceOf(address owner) external view returns (uint256)"
]);
var POOL_ABI5 = parseAbi34([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
var ORACLE_ABI6 = parseAbi34([
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
function decodeU2563(data, offset = 0) {
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
        encodeFunctionData30({ abi: ERC20_ABI6, functionName: "balanceOf", args: [user] })
      ]);
    }
  }
  for (const { name, pool, iface } of lendingPools) {
    callTypes.push({ kind: "lending", protocol: name, iface });
    calls.push([
      pool,
      encodeFunctionData30({ abi: POOL_ABI5, functionName: "getUserAccountData", args: [user] })
    ]);
  }
  if (oracleAddr) {
    callTypes.push({ kind: "native_price" });
    calls.push([
      oracleAddr,
      encodeFunctionData30({ abi: ORACLE_ABI6, functionName: "getAssetPrice", args: [wrappedNative] })
    ]);
  }
  if (calls.length === 0) return null;
  let results;
  try {
    results = await multicallRead(rpc, calls);
  } catch {
    return null;
  }
  const nativePrice = oracleAddr ? Number(decodeU2563(results[results.length - 1])) / 1e8 : 0;
  const tokenBalances = [];
  const lendingPositions = [];
  let chainValue = 0;
  let totalColl = 0;
  let totalDebt = 0;
  for (let i = 0; i < callTypes.length; i++) {
    const ct = callTypes[i];
    const data = results[i] ?? null;
    if (ct.kind === "token") {
      const balance = decodeU2563(data);
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
        const collateral = Number(decodeU2563(data, 0)) / divisor;
        const debt = Number(decodeU2563(data, 1)) / divisor;
        const hfRaw = decodeU2563(data, 5);
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
    const registry = Registry.loadEmbedded();
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
        (p) => p.category === ProtocolCategory.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2")
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
    const registry = Registry.loadEmbedded();
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
      const lendingProtocols = registry.getProtocolsByCategory(ProtocolCategory.Lending).filter((p) => p.chain.toLowerCase() === chainName);
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
        const cdpProtocols = registry.getProtocolsByCategory(ProtocolCategory.Cdp).filter((p) => p.chain.toLowerCase() === chainName);
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
        const dexProtocols = registry.getProtocolsByCategory(ProtocolCategory.Dex).filter((p) => p.chain.toLowerCase() === chainName);
        await Promise.all(
          dexProtocols.map(async (entry) => {
            try {
              const dex = createDex(entry, rpcUrl);
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
import { createPublicClient as createPublicClient23, http as http23, formatEther } from "viem";
function registerWallet(parent, getOpts) {
  const wallet = parent.command("wallet").description("Wallet management");
  wallet.command("balance").description("Show native token balance").requiredOption("--address <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient23({ transport: http23(chain.effectiveRpcUrl()) });
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
import { createPublicClient as createPublicClient24, http as http24, maxUint256 } from "viem";
function registerToken(parent, getOpts, makeExecutor2) {
  const token = parent.command("token").description("Token operations: approve, allowance, transfer, balance");
  token.command("balance").description("Query token balance for an address").requiredOption("--token <token>", "Token symbol or address").requiredOption("--owner <address>", "Wallet address to query").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient24({ transport: http24(chain.effectiveRpcUrl()) });
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
    const registry = Registry.loadEmbedded();
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const amount = opts.amount === "max" ? maxUint256 : BigInt(opts.amount);
    const tx = buildApprove(tokenAddr, opts.spender, amount);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  token.command("allowance").description("Check token allowance").requiredOption("--token <token>", "Token symbol or address").requiredOption("--owner <address>", "Owner address").requiredOption("--spender <address>", "Spender address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
    const chain = registry.getChain(chainName);
    const client = createPublicClient24({ transport: http24(chain.effectiveRpcUrl()) });
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
    const registry = Registry.loadEmbedded();
    const tokenAddr = opts.token.startsWith("0x") ? opts.token : registry.resolveToken(chainName, opts.token).address;
    const tx = buildTransfer(tokenAddr, opts.to, BigInt(opts.amount));
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
}

// src/commands/whales.ts
import { encodeFunctionData as encodeFunctionData31, parseAbi as parseAbi35 } from "viem";
var POOL_ABI6 = parseAbi35([
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
]);
function round24(x) {
  return Math.round(x * 100) / 100;
}
function round43(x) {
  return Math.round(x * 1e4) / 1e4;
}
function decodeU2564(data, wordOffset = 0) {
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
    const registry = Registry.loadEmbedded();
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
        (p) => p.category === ProtocolCategory.Lending && (p.interface === "aave_v3" || p.interface === "aave_v2")
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
            encodeFunctionData31({ abi: POOL_ABI6, functionName: "getUserAccountData", args: [whale.address] })
          ]);
        }
      }
      let results = [];
      if (calls.length > 0) {
        try {
          results = await multicallRead(rpc, calls);
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
            const collateral = Number(decodeU2564(data, 0)) / divisor;
            const debt = Number(decodeU2564(data, 1)) / divisor;
            const hfRaw = decodeU2564(data, 5);
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
      const protos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory.Lending && p.interface === "aave_v3");
      if (protos.length === 0) return [];
      const rpc = chain.effectiveRpcUrl();
      const rates = [];
      for (const proto of protos) {
        try {
          const lending = createLending(proto, rpc);
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
      const registry = Registry.loadEmbedded();
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
var ODOS_API = "https://api.odos.xyz";
function registerSwap(parent, getOpts, makeExecutor2) {
  parent.command("swap").description("Aggregator swap: best price across all DEXes (ODOS)").requiredOption("--token-in <token>", "Input token symbol or address").requiredOption("--token-out <token>", "Output token symbol or address").requiredOption("--amount <amount>", "Amount of input token in wei").option("--slippage <bps>", "Slippage tolerance in basis points", "50").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
        const { encodeFunctionData: encodeFunctionData34, parseAbi: parseAbi37 } = await import("viem");
        const tokenMessengerAbi = parseAbi37([
          "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)"
        ]);
        const data = encodeFunctionData34({
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
function registerNft(parent, getOpts) {
  const nft = parent.command("nft").description("NFT operations: collection info, ownership, balance");
  nft.command("info").description("Get NFT collection info (name, symbol, total supply)").requiredOption("--collection <address>", "NFT collection contract address").action(async (opts) => {
    const chainName = parent.opts().chain ?? "hyperevm";
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
function registerFarm(parent, getOpts, makeExecutor2) {
  const farm = parent.command("farm").description("LP farm operations: deposit, withdraw, claim rewards (MasterChef)");
  farm.command("deposit").description("Deposit LP tokens into a MasterChef farm").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pid <pid>", "Farm pool ID").requiredOption("--amount <amount>", "LP token amount in wei").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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
    const registry = Registry.loadEmbedded();
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

// src/commands/farming.ts
import { privateKeyToAccount as privateKeyToAccount3 } from "viem/accounts";
function registerFarming(parent, getOpts, makeExecutor2) {
  const farming = parent.command("farming").description("Algebra eternal farming operations (KittenSwap): enter, exit, collect rewards, claim, discover");
  farming.command("enter").description("Enter farming: stake an NFT position to start earning rewards").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").requiredOption("--pool <address>", "Pool address").requiredOption("--token-id <id>", "NFT position token ID").option("--owner <address>", "Owner address to receive claimed rewards (defaults to DEFI_WALLET_ADDRESS or private key address)").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const owner = resolveOwner(opts.owner);
    const tx = await adapter.buildEnterFarming(
      BigInt(opts.tokenId),
      opts.pool,
      owner
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farming.command("exit").description("Exit farming: unstake an NFT position").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").requiredOption("--pool <address>", "Pool address").requiredOption("--token-id <id>", "NFT position token ID").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const tx = await adapter.buildExitFarming(
      BigInt(opts.tokenId),
      opts.pool
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farming.command("rewards").description("Collect + claim farming rewards for a staked position (collectRewards + claimReward multicall)").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").requiredOption("--pool <address>", "Pool address").requiredOption("--token-id <id>", "NFT position token ID").option("--owner <address>", "Owner address to receive claimed rewards (defaults to DEFI_WALLET_ADDRESS or private key address)").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const owner = resolveOwner(opts.owner);
    const tx = await adapter.buildCollectRewards(
      BigInt(opts.tokenId),
      opts.pool,
      owner
    );
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farming.command("claim").description("Claim accumulated farming rewards (KITTEN + WHYPE) without changing position").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").option("--owner <address>", "Owner address to receive rewards (defaults to DEFI_WALLET_ADDRESS or private key address)").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const owner = resolveOwner(opts.owner);
    const tx = await adapter.buildClaimReward(owner);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  farming.command("pending").description("Query pending farming rewards for a position (read-only)").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").requiredOption("--pool <address>", "Pool address").requiredOption("--token-id <id>", "NFT position token ID").action(async (opts) => {
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const rewards = await adapter.getPendingRewards(
      BigInt(opts.tokenId),
      opts.pool
    );
    printOutput(
      {
        tokenId: opts.tokenId,
        pool: opts.pool,
        reward_kitten: rewards.reward.toString(),
        bonus_reward_whype: rewards.bonusReward.toString()
      },
      getOpts()
    );
  });
  farming.command("discover").description("Discover all pools with active KittenSwap farming incentives").requiredOption("--protocol <protocol>", "Protocol slug (e.g. kittenswap)").action(async (opts) => {
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "hyperevm");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createKittenSwapFarming(protocol, rpcUrl);
    const pools = await adapter.discoverFarmingPools();
    const output = pools.map((p) => ({
      pool: p.pool,
      nonce: p.key.nonce.toString(),
      total_reward: p.totalReward.toString(),
      bonus_reward: p.bonusReward.toString(),
      active: p.active
    }));
    printOutput(output, getOpts());
  });
}
function resolveOwner(optOwner) {
  if (optOwner) return optOwner;
  const walletAddr = process.env["DEFI_WALLET_ADDRESS"];
  if (walletAddr) return walletAddr;
  const privateKey = process.env["DEFI_PRIVATE_KEY"];
  if (privateKey) {
    return privateKeyToAccount3(privateKey).address;
  }
  throw new Error(
    "--owner, DEFI_WALLET_ADDRESS, or DEFI_PRIVATE_KEY is required to resolve reward recipient"
  );
}

// src/commands/setup.ts
import pc2 from "picocolors";
import { createInterface } from "readline";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve3 } from "path";
var DEFI_DIR = resolve3(process.env.HOME || "~", ".defi");
var ENV_FILE = resolve3(DEFI_DIR, ".env");
function ensureDefiDir() {
  if (!existsSync3(DEFI_DIR)) mkdirSync2(DEFI_DIR, { recursive: true, mode: 448 });
}
function loadEnvFile() {
  if (!existsSync3(ENV_FILE)) return {};
  const lines = readFileSync3(ENV_FILE, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
  return env;
}
function writeEnvFile(env) {
  ensureDefiDir();
  const lines = [
    "# defi-cli configuration",
    "# Generated by 'defi setup' \u2014 edit freely",
    ""
  ];
  for (const [key, value] of Object.entries(env)) {
    lines.push(`${key}=${value}`);
  }
  lines.push("");
  writeFileSync2(ENV_FILE, lines.join("\n"), { mode: 384 });
}
function ask(rl, question) {
  return new Promise((res) => rl.question(question, (answer) => res(answer.trim())));
}
function isValidAddress(s) {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}
function isValidPrivateKey(s) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}
async function deriveAddress(privateKey) {
  try {
    const { privateKeyToAccount: privateKeyToAccount4 } = await import("viem/accounts");
    const account = privateKeyToAccount4(privateKey);
    return account.address;
  } catch {
    return null;
  }
}
function registerSetup(program2) {
  program2.command("setup").alias("init").description("Interactive setup wizard \u2014 configure wallet & RPC URLs").action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(pc2.cyan(pc2.bold("\n  defi-cli Setup Wizard\n")));
      const existing = loadEnvFile();
      if (Object.keys(existing).length > 0) {
        console.log(pc2.white("  Current configuration:"));
        for (const [key, value] of Object.entries(existing)) {
          const masked = key.toLowerCase().includes("key") ? value.slice(0, 6) + "..." + value.slice(-4) : value;
          console.log(`    ${pc2.cyan(key.padEnd(24))} ${pc2.gray(masked)}`);
        }
        console.log();
        const overwrite = await ask(rl, "  Overwrite existing config? (y/N): ");
        if (overwrite.toLowerCase() !== "y" && overwrite.toLowerCase() !== "yes") {
          console.log(pc2.gray("\n  Keeping existing configuration.\n"));
          rl.close();
          return;
        }
        console.log();
      }
      const newEnv = {};
      console.log(pc2.cyan(pc2.bold("  Wallet")));
      const privateKey = await ask(rl, "  Private key (optional, for --broadcast, 0x...): ");
      if (privateKey) {
        const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
        if (!isValidPrivateKey(normalized)) {
          console.log(pc2.red("  Invalid private key (must be 0x + 64 hex chars). Skipped."));
        } else {
          newEnv.DEFI_PRIVATE_KEY = normalized;
          const derived = await deriveAddress(normalized);
          if (derived) {
            newEnv.DEFI_WALLET_ADDRESS = derived;
            console.log(`  ${pc2.green("OK")} derived address: ${pc2.gray(derived)}`);
          }
        }
      }
      if (!newEnv.DEFI_WALLET_ADDRESS) {
        const address = await ask(rl, "  Wallet address (0x...): ");
        if (address) {
          if (!isValidAddress(address)) {
            console.log(pc2.yellow("  Invalid address format. Skipping."));
          } else {
            newEnv.DEFI_WALLET_ADDRESS = address;
            console.log(`  ${pc2.green("OK")} ${pc2.gray(address)}`);
          }
        }
      }
      console.log(pc2.cyan(pc2.bold("\n  RPC URLs")) + pc2.gray(" (press Enter to use public defaults)"));
      const hyperevmRpc = await ask(rl, "  HyperEVM RPC URL: ");
      if (hyperevmRpc) {
        newEnv.HYPEREVM_RPC_URL = hyperevmRpc;
        console.log(`  ${pc2.green("OK")} HyperEVM RPC set`);
      }
      const mantleRpc = await ask(rl, "  Mantle RPC URL: ");
      if (mantleRpc) {
        newEnv.MANTLE_RPC_URL = mantleRpc;
        console.log(`  ${pc2.green("OK")} Mantle RPC set`);
      }
      const finalEnv = { ...existing, ...newEnv };
      writeEnvFile(finalEnv);
      console.log(pc2.cyan(pc2.bold("\n  Setup Complete!\n")));
      console.log(`  Config:  ${pc2.gray(ENV_FILE)}`);
      if (finalEnv.DEFI_WALLET_ADDRESS) {
        console.log(`  Wallet:  ${pc2.gray(finalEnv.DEFI_WALLET_ADDRESS)}`);
      }
      if (finalEnv.DEFI_PRIVATE_KEY) {
        console.log(`  Key:     ${pc2.green("configured")}`);
      }
      if (finalEnv.HYPEREVM_RPC_URL) {
        console.log(`  HyperEVM RPC: ${pc2.gray(finalEnv.HYPEREVM_RPC_URL)}`);
      }
      if (finalEnv.MANTLE_RPC_URL) {
        console.log(`  Mantle RPC:   ${pc2.gray(finalEnv.MANTLE_RPC_URL)}`);
      }
      console.log(pc2.bold(pc2.white("\n  Next steps:")));
      console.log(`    ${pc2.green("defi portfolio")}          view balances & positions`);
      console.log(`    ${pc2.green("defi scan")}               scan for exploits`);
      console.log(`    ${pc2.green("defi dex quote")}          get a swap quote`);
      console.log(`    ${pc2.green("defi --help")}             browse all commands
`);
      rl.close();
    } catch (err) {
      rl.close();
      throw err;
    }
  });
}

// src/commands/lb.ts
function registerLB(parent, getOpts, makeExecutor2) {
  const lb = parent.command("lb").description("Merchant Moe Liquidity Book: add/remove liquidity, rewards, positions");
  lb.command("add").description("Add liquidity to a Liquidity Book pair").requiredOption("--protocol <protocol>", "Protocol slug (e.g. merchantmoe-mantle)").requiredOption("--pool <address>", "LB pair address").requiredOption("--token-x <address>", "Token X address").requiredOption("--token-y <address>", "Token Y address").requiredOption("--bin-step <step>", "Bin step of the pair").option("--amount-x <wei>", "Amount of token X in wei", "0").option("--amount-y <wei>", "Amount of token Y in wei", "0").option("--bins <N>", "Number of bins on each side of active bin", "5").option("--active-id <id>", "Active bin id (defaults to on-chain query)").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "mantle");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMerchantMoeLB(protocol, rpcUrl);
    const recipient = opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
    const tx = await adapter.buildAddLiquidity({
      pool: opts.pool,
      tokenX: opts.tokenX,
      tokenY: opts.tokenY,
      binStep: parseInt(opts.binStep),
      amountX: BigInt(opts.amountX),
      amountY: BigInt(opts.amountY),
      numBins: parseInt(opts.bins),
      activeIdDesired: opts.activeId ? parseInt(opts.activeId) : void 0,
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lb.command("remove").description("Remove liquidity from Liquidity Book bins").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--token-x <address>", "Token X address").requiredOption("--token-y <address>", "Token Y address").requiredOption("--bin-step <step>", "Bin step of the pair").requiredOption("--bins <binIds>", "Comma-separated bin IDs to remove from").requiredOption("--amounts <amounts>", "Comma-separated LB token amounts to remove per bin (wei)").option("--recipient <address>", "Recipient address").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const adapter = createMerchantMoeLB(protocol);
    const recipient = opts.recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
    const binIds = opts.bins.split(",").map((s) => parseInt(s.trim()));
    const amounts = opts.amounts.split(",").map((s) => BigInt(s.trim()));
    const tx = await adapter.buildRemoveLiquidity({
      tokenX: opts.tokenX,
      tokenY: opts.tokenY,
      binStep: parseInt(opts.binStep),
      binIds,
      amounts,
      recipient
    });
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lb.command("rewards").description("Show pending MOE rewards for a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pool <address>", "LB pair address").option("--bins <binIds>", "Comma-separated bin IDs to check (auto-detected from rewarder range if omitted)").option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)").action(async (opts) => {
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "mantle");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMerchantMoeLB(protocol, rpcUrl);
    const user = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
    if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
    const binIds = opts.bins ? opts.bins.split(",").map((s) => parseInt(s.trim())) : void 0;
    const rewards = await adapter.getPendingRewards(user, opts.pool, binIds);
    printOutput(rewards, getOpts());
  });
  lb.command("claim").description("Claim pending MOE rewards from a pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pool <address>", "LB pair address").option("--bins <binIds>", "Comma-separated bin IDs to claim from (auto-detected from rewarder range if omitted)").option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)").action(async (opts) => {
    const executor = makeExecutor2();
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "mantle");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMerchantMoeLB(protocol, rpcUrl);
    const user = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
    if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
    const binIds = opts.bins ? opts.bins.split(",").map((s) => parseInt(s.trim())) : void 0;
    const tx = await adapter.buildClaimRewards(user, opts.pool, binIds);
    const result = await executor.execute(tx);
    printOutput(result, getOpts());
  });
  lb.command("discover").description("Find all rewarded LB pools on chain").requiredOption("--protocol <protocol>", "Protocol slug").option("--active-only", "Only show non-stopped pools").action(async (opts) => {
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "mantle");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMerchantMoeLB(protocol, rpcUrl);
    let pools = await adapter.discoverRewardedPools();
    if (opts.activeOnly) {
      pools = pools.filter((p) => !p.stopped);
    }
    printOutput(pools, getOpts());
  });
  lb.command("positions").description("Show user positions per bin in a LB pool").requiredOption("--protocol <protocol>", "Protocol slug").requiredOption("--pool <address>", "LB pair address").option("--bins <binIds>", "Comma-separated bin IDs to query (auto-detected from rewarder range or active \xB1 50 if omitted)").option("--address <address>", "Wallet address (defaults to DEFI_WALLET_ADDRESS)").action(async (opts) => {
    const registry = Registry.loadEmbedded();
    const protocol = registry.getProtocol(opts.protocol);
    const chainName = parent.opts().chain;
    const chain = registry.getChain(chainName ?? "mantle");
    const rpcUrl = chain.effectiveRpcUrl();
    const adapter = createMerchantMoeLB(protocol, rpcUrl);
    const user = opts.address ?? process.env["DEFI_WALLET_ADDRESS"];
    if (!user) throw new Error("--address or DEFI_WALLET_ADDRESS required");
    const binIds = opts.bins ? opts.bins.split(",").map((s) => parseInt(s.trim())) : void 0;
    const positions = await adapter.getUserPositions(user, opts.pool, binIds);
    printOutput(positions, getOpts());
  });
}

// src/cli.ts
var _require = createRequire(import.meta.url);
var _pkg = _require("../package.json");
var BANNER = `
  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2557
  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551    \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551    \u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551
  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2588\u2588\u2551    \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D     \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D

  2 chains \xB7 23 protocols \xB7 by HypurrQuant

  Scan exploits, swap tokens, bridge assets, track whales,
  compare yields \u2014 all from your terminal.
`;
var program = new Command().name("defi").description("DeFi CLI \u2014 Multi-chain DeFi toolkit").version(_pkg.version).addHelpText("before", BANNER).option("--json", "Output as JSON").option("--ndjson", "Output as newline-delimited JSON").option("--fields <fields>", "Select specific output fields (comma-separated)").option("--chain <chain>", "Target chain", "hyperevm").option("--dry-run", "Dry-run mode (default, no broadcast)", true).option("--broadcast", "Actually broadcast the transaction");
function getOutputMode() {
  const opts = program.opts();
  return parseOutputMode(opts);
}
function makeExecutor() {
  const opts = program.opts();
  const registry = Registry.loadEmbedded();
  const chain = registry.getChain(opts.chain ?? "hyperevm");
  return new Executor(!!opts.broadcast, chain.effectiveRpcUrl(), chain.explorer_url);
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
registerFarming(program, getOutputMode, makeExecutor);
registerLB(program, getOutputMode, makeExecutor);
registerSetup(program);
program.command("agent").description("Agent mode: read JSON commands from stdin (for AI agents)").action(async () => {
  const executor = makeExecutor();
  process.stderr.write("Agent mode: reading JSON commands from stdin...\n");
  process.stderr.write("Agent mode not yet fully implemented in TS port.\n");
  process.exit(1);
});

// src/landing.ts
import pc3 from "picocolors";
import { encodeFunctionData as encodeFunctionData33, parseAbi as parseAbi36, formatUnits } from "viem";
var HYPEREVM_DISPLAY = ["HYPE", "WHYPE", "USDC", "USDT0", "USDe", "kHYPE", "wstHYPE"];
var MANTLE_DISPLAY = ["MNT", "WMNT", "USDC", "USDT", "WETH", "mETH"];
var balanceOfAbi = parseAbi36([
  "function balanceOf(address account) view returns (uint256)"
]);
var getEthBalanceAbi = parseAbi36([
  "function getEthBalance(address addr) view returns (uint256)"
]);
async function fetchBalances(rpcUrl, wallet, tokens) {
  const calls = tokens.map((t) => {
    const isNative = t.tags?.includes("native") || t.address === "0x0000000000000000000000000000000000000000";
    if (isNative) {
      return [
        MULTICALL3_ADDRESS,
        encodeFunctionData33({
          abi: getEthBalanceAbi,
          functionName: "getEthBalance",
          args: [wallet]
        })
      ];
    }
    return [
      t.address,
      encodeFunctionData33({
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [wallet]
      })
    ];
  });
  let results;
  try {
    results = await multicallRead(rpcUrl, calls);
  } catch {
    results = tokens.map(() => null);
  }
  return tokens.map((t, i) => {
    const raw = decodeU256(results[i]);
    const formatted = formatUnits(raw, t.decimals);
    const num = parseFloat(formatted);
    const display = num === 0 ? "0.00" : num >= 1e3 ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    return { symbol: t.symbol, balance: display, decimals: t.decimals };
  });
}
function shortenAddress(addr) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function padRight(s, len) {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}
function padLeft(s, len) {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}
function formatBalanceLine(sym, bal) {
  const symPad = padRight(sym, 10);
  const balPad = padLeft(bal, 12);
  return `  ${symPad}${balPad}`;
}
async function showLandingPage(isJson) {
  const registry = Registry.loadEmbedded();
  const wallet = process.env.DEFI_WALLET_ADDRESS;
  if (isJson) {
    if (!wallet) {
      console.log(JSON.stringify({ error: "DEFI_WALLET_ADDRESS not set" }, null, 2));
      return;
    }
    const heChain2 = registry.getChain("hyperevm");
    const mantleChain2 = registry.getChain("mantle");
    const heTokens2 = (registry.tokens.get("hyperevm") ?? []).filter((t) => HYPEREVM_DISPLAY.includes(t.symbol));
    const mantleTokens2 = (registry.tokens.get("mantle") ?? []).filter((t) => MANTLE_DISPLAY.includes(t.symbol));
    const heSorted2 = HYPEREVM_DISPLAY.map((s) => heTokens2.find((t) => t.symbol === s)).filter(Boolean);
    const mantleSorted2 = MANTLE_DISPLAY.map((s) => mantleTokens2.find((t) => t.symbol === s)).filter(Boolean);
    const [heBalances2, mantleBalances2] = await Promise.all([
      fetchBalances(heChain2.effectiveRpcUrl(), wallet, heSorted2),
      fetchBalances(mantleChain2.effectiveRpcUrl(), wallet, mantleSorted2)
    ]);
    console.log(JSON.stringify({
      wallet,
      chains: {
        hyperevm: { name: heChain2.name, balances: heBalances2 },
        mantle: { name: mantleChain2.name, balances: mantleBalances2 }
      }
    }, null, 2));
    return;
  }
  const { createRequire: createRequire2 } = await import("module");
  const _require2 = createRequire2(import.meta.url);
  const pkg = _require2("../package.json");
  const version = pkg.version;
  if (!wallet) {
    console.log("");
    console.log(pc3.bold(pc3.cyan("  DeFi CLI v" + version)));
    console.log("");
    console.log(pc3.yellow("  Wallet not configured."));
    console.log("  Set DEFI_WALLET_ADDRESS to see your balances:");
    console.log("");
    console.log(pc3.dim("    export DEFI_WALLET_ADDRESS=0x..."));
    console.log("");
    console.log("  Commands:");
    console.log(pc3.dim("    defi status              Protocol overview"));
    console.log(pc3.dim("    defi lending rates       Compare lending APYs"));
    console.log(pc3.dim("    defi dex quote           Get swap quotes"));
    console.log(pc3.dim("    defi portfolio           View all positions"));
    console.log(pc3.dim("    defi scan                Exploit detection"));
    console.log(pc3.dim("    defi --help              Full command list"));
    console.log("");
    return;
  }
  const heChain = registry.getChain("hyperevm");
  const mantleChain = registry.getChain("mantle");
  const heTokens = (registry.tokens.get("hyperevm") ?? []).filter((t) => HYPEREVM_DISPLAY.includes(t.symbol));
  const mantleTokens = (registry.tokens.get("mantle") ?? []).filter((t) => MANTLE_DISPLAY.includes(t.symbol));
  const heSorted = HYPEREVM_DISPLAY.map((s) => heTokens.find((t) => t.symbol === s)).filter(Boolean);
  const mantleSorted = MANTLE_DISPLAY.map((s) => mantleTokens.find((t) => t.symbol === s)).filter(Boolean);
  const [heBalances, mantleBalances] = await Promise.all([
    fetchBalances(heChain.effectiveRpcUrl(), wallet, heSorted).catch(
      () => heSorted.map((t) => ({ symbol: t.symbol, balance: "?", decimals: t.decimals }))
    ),
    fetchBalances(mantleChain.effectiveRpcUrl(), wallet, mantleSorted).catch(
      () => mantleSorted.map((t) => ({ symbol: t.symbol, balance: "?", decimals: t.decimals }))
    )
  ]);
  const colWidth = 38;
  const divider = "\u2500".repeat(colWidth - 2);
  console.log("");
  console.log(
    pc3.bold(pc3.cyan("  DeFi CLI v" + version)) + pc3.dim("  \u2014  ") + pc3.bold(heChain.name) + pc3.dim(" \xB7 ") + pc3.bold(mantleChain.name)
  );
  console.log("");
  console.log("  Wallet: " + pc3.yellow(shortenAddress(wallet)));
  console.log("");
  const heHeader = padRight(
    "  " + pc3.bold(heChain.name),
    colWidth + 10
    /* account for ANSI */
  );
  const mantleHeader = pc3.bold(mantleChain.name);
  console.log(heHeader + "  " + mantleHeader);
  const heDivider = padRight("  " + pc3.dim(divider), colWidth + 10);
  const mantleDivider = pc3.dim(divider);
  console.log(heDivider + "  " + mantleDivider);
  const maxRows = Math.max(heBalances.length, mantleBalances.length);
  for (let i = 0; i < maxRows; i++) {
    const heEntry = heBalances[i];
    const mantleEntry = mantleBalances[i];
    const heText = heEntry ? formatBalanceLine(heEntry.symbol, heEntry.balance) : "";
    const mantleText = mantleEntry ? formatBalanceLine(mantleEntry.symbol, mantleEntry.balance) : "";
    const heColored = heEntry ? heEntry.balance === "0.00" || heEntry.balance === "?" ? pc3.dim(heText) : heText : "";
    const mantleColored = mantleEntry ? mantleEntry.balance === "0.00" || mantleEntry.balance === "?" ? pc3.dim(mantleText) : mantleText : "";
    const visibleLen = heText.length;
    const padNeeded = colWidth - visibleLen;
    const paddedHe = heColored + (padNeeded > 0 ? " ".repeat(padNeeded) : "");
    console.log(paddedHe + "  " + mantleColored);
  }
  console.log("");
  console.log("  " + pc3.bold("Commands:"));
  console.log("    " + pc3.cyan("defi status") + "              Protocol overview");
  console.log("    " + pc3.cyan("defi lending rates") + "       Compare lending APYs");
  console.log("    " + pc3.cyan("defi dex quote") + "           Get swap quotes");
  console.log("    " + pc3.cyan("defi portfolio") + "           View all positions");
  console.log("    " + pc3.cyan("defi scan") + "                Exploit detection");
  console.log("    " + pc3.cyan("defi --help") + "              Full command list");
  console.log("");
}

// src/main.ts
config({ path: resolve4(process.env.HOME || "~", ".defi", ".env"), quiet: true });
config({ quiet: true });
async function main() {
  try {
    const rawArgs = process.argv.slice(2);
    const knownSubcommands = /* @__PURE__ */ new Set([
      "status",
      "schema",
      "dex",
      "gauge",
      "lending",
      "cdp",
      "staking",
      "vault",
      "yield",
      "portfolio",
      "monitor",
      "alert",
      "scan",
      "arb",
      "positions",
      "price",
      "wallet",
      "token",
      "whales",
      "compare",
      "swap",
      "bridge",
      "nft",
      "farm",
      "farming",
      "lb",
      "agent",
      "setup",
      "init"
    ]);
    const hasSubcommand = rawArgs.some((a) => !a.startsWith("-") && knownSubcommands.has(a));
    const isJson = rawArgs.includes("--json") || rawArgs.includes("--ndjson");
    const isHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
    const isVersion = rawArgs.includes("--version") || rawArgs.includes("-V");
    if (!isHelp && !isVersion && (rawArgs.length === 0 || !hasSubcommand)) {
      await showLandingPage(isJson);
      return;
    }
    await program.parseAsync(process.argv);
  } catch (error) {
    const isJsonMode = process.argv.includes("--json") || process.argv.includes("--ndjson");
    if (isJsonMode) {
      const errorObj = {
        error: error instanceof Error ? error.message : String(error)
      };
      process.stderr.write(JSON.stringify(errorObj, null, 2) + "\n");
    } else {
      process.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}
`
      );
    }
    process.exit(1);
  }
}
main();
/*! Bundled license information:

smol-toml/dist/error.js:
smol-toml/dist/util.js:
smol-toml/dist/date.js:
smol-toml/dist/primitive.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
//# sourceMappingURL=main.js.map