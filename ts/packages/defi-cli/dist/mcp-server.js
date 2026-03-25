#!/usr/bin/env node
#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
var TomlError;
var init_error = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/error.js"() {
    "use strict";
    TomlError = class extends Error {
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
  }
});

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
var init_util = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/util.js"() {
    "use strict";
    init_error();
  }
});

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/date.js
var DATE_TIME_RE, TomlDate;
var init_date = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/date.js"() {
    "use strict";
    DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
    TomlDate = class _TomlDate extends Date {
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
  }
});

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/primitive.js
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
var INT_REGEX, FLOAT_REGEX, LEADING_ZERO, ESCAPE_REGEX, ESC_MAP;
var init_primitive = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/primitive.js"() {
    "use strict";
    init_util();
    init_date();
    init_error();
    INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
    FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
    LEADING_ZERO = /^[+-]?0[0-9_]/;
    ESCAPE_REGEX = /^[0-9a-f]{2,8}$/i;
    ESC_MAP = {
      b: "\b",
      t: "	",
      n: "\n",
      f: "\f",
      r: "\r",
      e: "\x1B",
      '"': '"',
      "\\": "\\"
    };
  }
});

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
var init_extract = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/extract.js"() {
    "use strict";
    init_primitive();
    init_struct();
    init_util();
    init_error();
  }
});

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/struct.js
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
var KEY_PART_RE;
var init_struct = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/struct.js"() {
    "use strict";
    init_primitive();
    init_extract();
    init_util();
    init_error();
    KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
  }
});

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
var init_parse = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/parse.js"() {
    "use strict";
    init_struct();
    init_extract();
    init_util();
    init_error();
  }
});

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/stringify.js
var init_stringify = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/stringify.js"() {
    "use strict";
  }
});

// ../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/index.js
var init_dist = __esm({
  "../../node_modules/.pnpm/smol-toml@1.6.0/node_modules/smol-toml/dist/index.js"() {
    "use strict";
    init_parse();
    init_stringify();
    init_date();
    init_error();
  }
});

// ../defi-core/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  ChainConfig: () => ChainConfig,
  DefiError: () => DefiError,
  InterestRateMode: () => InterestRateMode,
  MULTICALL3_ADDRESS: () => MULTICALL3_ADDRESS,
  ProtocolCategory: () => ProtocolCategory,
  Registry: () => Registry,
  TxStatus: () => TxStatus,
  applyMinSlippage: () => applyMinSlippage,
  buildApprove: () => buildApprove,
  buildMulticall: () => buildMulticall,
  buildTransfer: () => buildTransfer,
  clearProviderCache: () => clearProviderCache,
  decodeU128: () => decodeU128,
  decodeU256: () => decodeU256,
  defaultSwapSlippage: () => defaultSwapSlippage,
  erc20Abi: () => erc20Abi,
  formatHuman: () => formatHuman,
  getProvider: () => getProvider,
  jsonReplacer: () => jsonReplacer,
  jsonReplacerDecimal: () => jsonReplacerDecimal,
  jsonStringify: () => jsonStringify,
  multicallRead: () => multicallRead,
  newSlippage: () => newSlippage,
  parseBigInt: () => parseBigInt,
  protocolCategoryLabel: () => protocolCategoryLabel
});
import { encodeFunctionData, parseAbi } from "viem";
import { createPublicClient, http } from "viem";
import { encodeFunctionData as encodeFunctionData2, decodeFunctionResult, parseAbi as parseAbi2 } from "viem";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
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
function protocolCategoryLabel(category) {
  switch (category) {
    case "dex":
      return "DEX";
    case "lending":
      return "Lending";
    case "cdp":
      return "CDP";
    case "bridge":
      return "Bridge";
    case "liquid_staking":
      return "Liquid Staking";
    case "yield_source":
      return "Yield Source";
    case "yield_aggregator":
      return "Yield Aggregator";
    case "vault":
      return "Vault";
    case "derivatives":
      return "Derivatives";
    case "options":
      return "Options";
    case "liquidity_manager":
      return "Liquidity Manager";
    case "nft":
      return "NFT";
    case "other":
      return "Other";
  }
}
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
function readToml(relPath) {
  return readFileSync(resolve(CONFIG_DIR, relPath), "utf-8");
}
var TxStatus, InterestRateMode, DefiError, erc20Abi, providerCache, MULTICALL3_ADDRESS, multicall3Abi, ChainConfig, ProtocolCategory, __dirname, CONFIG_DIR, Registry;
var init_dist2 = __esm({
  "../defi-core/dist/index.js"() {
    "use strict";
    init_dist();
    TxStatus = /* @__PURE__ */ ((TxStatus2) => {
      TxStatus2["DryRun"] = "dry_run";
      TxStatus2["Simulated"] = "simulated";
      TxStatus2["SimulationFailed"] = "simulation_failed";
      TxStatus2["NeedsApproval"] = "needs_approval";
      TxStatus2["Pending"] = "pending";
      TxStatus2["Confirmed"] = "confirmed";
      TxStatus2["Failed"] = "failed";
      return TxStatus2;
    })(TxStatus || {});
    InterestRateMode = /* @__PURE__ */ ((InterestRateMode22) => {
      InterestRateMode22["Variable"] = "variable";
      InterestRateMode22["Stable"] = "stable";
      return InterestRateMode22;
    })(InterestRateMode || {});
    DefiError = class _DefiError extends Error {
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
    erc20Abi = parseAbi([
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
    providerCache = /* @__PURE__ */ new Map();
    MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
    multicall3Abi = parseAbi2([
      "struct Call3 { address target; bool allowFailure; bytes callData; }",
      "struct Result { bool success; bytes returnData; }",
      "function aggregate3(Call3[] calls) returns (Result[] returnData)"
    ]);
    ChainConfig = class {
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
    ProtocolCategory = /* @__PURE__ */ ((ProtocolCategory2) => {
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
    __dirname = fileURLToPath(new URL(".", import.meta.url));
    CONFIG_DIR = findConfigDir();
    Registry = class _Registry {
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
  }
});

// ../defi-protocols/dist/index.js
var dist_exports2 = {};
__export(dist_exports2, {
  AaveOracleAdapter: () => AaveOracleAdapter,
  AaveV2Adapter: () => AaveV2Adapter,
  AaveV3Adapter: () => AaveV3Adapter,
  AlgebraV3Adapter: () => AlgebraV3Adapter,
  BalancerV3Adapter: () => BalancerV3Adapter,
  CompoundV2Adapter: () => CompoundV2Adapter,
  CompoundV3Adapter: () => CompoundV3Adapter,
  CurveStableSwapAdapter: () => CurveStableSwapAdapter,
  DexSpotPrice: () => DexSpotPrice,
  ERC4626VaultAdapter: () => ERC4626VaultAdapter,
  ERC721Adapter: () => ERC721Adapter,
  EulerV2Adapter: () => EulerV2Adapter,
  FelixCdpAdapter: () => FelixCdpAdapter,
  FelixOracleAdapter: () => FelixOracleAdapter,
  GenericDerivativesAdapter: () => GenericDerivativesAdapter,
  GenericLstAdapter: () => GenericLstAdapter,
  GenericOptionsAdapter: () => GenericOptionsAdapter,
  GenericYieldAdapter: () => GenericYieldAdapter,
  HlpVaultAdapter: () => HlpVaultAdapter,
  KinetiqAdapter: () => KinetiqAdapter,
  KittenSwapFarmingAdapter: () => KittenSwapFarmingAdapter,
  MasterChefAdapter: () => MasterChefAdapter,
  MerchantMoeLBAdapter: () => MerchantMoeLBAdapter,
  MorphoBlueAdapter: () => MorphoBlueAdapter,
  PendleAdapter: () => PendleAdapter,
  RyskAdapter: () => RyskAdapter,
  SolidlyAdapter: () => SolidlyAdapter,
  SolidlyGaugeAdapter: () => SolidlyGaugeAdapter,
  StHypeAdapter: () => StHypeAdapter,
  UniswapV2Adapter: () => UniswapV2Adapter,
  UniswapV3Adapter: () => UniswapV3Adapter,
  WooFiAdapter: () => WooFiAdapter,
  createCdp: () => createCdp,
  createDerivatives: () => createDerivatives,
  createDex: () => createDex,
  createGauge: () => createGauge,
  createKittenSwapFarming: () => createKittenSwapFarming,
  createLending: () => createLending,
  createLiquidStaking: () => createLiquidStaking,
  createMasterChef: () => createMasterChef,
  createMerchantMoeLB: () => createMerchantMoeLB,
  createNft: () => createNft,
  createOptions: () => createOptions,
  createOracleFromCdp: () => createOracleFromCdp,
  createOracleFromLending: () => createOracleFromLending,
  createVault: () => createVault,
  createYieldSource: () => createYieldSource
});
import { encodeFunctionData as encodeFunctionData3, parseAbi as parseAbi3, createPublicClient as createPublicClient2, http as http2, decodeAbiParameters } from "viem";
import { encodeFunctionData as encodeFunctionData22, parseAbi as parseAbi22, createPublicClient as createPublicClient22, http as http22, decodeFunctionResult as decodeFunctionResult2, decodeAbiParameters as decodeAbiParameters2 } from "viem";
import { encodeFunctionData as encodeFunctionData32, parseAbi as parseAbi32, createPublicClient as createPublicClient3, http as http3, decodeAbiParameters as decodeAbiParameters3, concatHex, zeroAddress } from "viem";
import { encodeFunctionData as encodeFunctionData4, parseAbi as parseAbi4, zeroAddress as zeroAddress2 } from "viem";
import { encodeFunctionData as encodeFunctionData5, parseAbi as parseAbi5 } from "viem";
import { encodeFunctionData as encodeFunctionData6, parseAbi as parseAbi6, decodeAbiParameters as decodeAbiParameters4 } from "viem";
import { encodeFunctionData as encodeFunctionData7, parseAbi as parseAbi7, zeroAddress as zeroAddress3 } from "viem";
import { createPublicClient as createPublicClient4, encodeFunctionData as encodeFunctionData8, http as http4, parseAbi as parseAbi8, zeroAddress as zeroAddress4 } from "viem";
import { encodeFunctionData as encodeFunctionData9, parseAbi as parseAbi9, createPublicClient as createPublicClient5, http as http5 } from "viem";
import {
  encodeFunctionData as encodeFunctionData10,
  decodeFunctionResult as decodeFunctionResult22,
  parseAbi as parseAbi10,
  createPublicClient as createPublicClient6,
  http as http6
} from "viem";
import {
  createPublicClient as createPublicClient7,
  encodeFunctionData as encodeFunctionData11,
  encodeAbiParameters,
  http as http7,
  keccak256,
  parseAbi as parseAbi11
} from "viem";
import { createPublicClient as createPublicClient8, http as http8, parseAbi as parseAbi12, encodeFunctionData as encodeFunctionData12, decodeFunctionResult as decodeFunctionResult3, zeroAddress as zeroAddress5 } from "viem";
import { createPublicClient as createPublicClient9, http as http9, parseAbi as parseAbi13, encodeFunctionData as encodeFunctionData13, zeroAddress as zeroAddress6 } from "viem";
import { createPublicClient as createPublicClient10, http as http10, parseAbi as parseAbi14 } from "viem";
import { createPublicClient as createPublicClient11, http as http11, parseAbi as parseAbi15, encodeFunctionData as encodeFunctionData14 } from "viem";
import { createPublicClient as createPublicClient12, http as http12, parseAbi as parseAbi16, encodeFunctionData as encodeFunctionData15 } from "viem";
import { createPublicClient as createPublicClient13, http as http13, parseAbi as parseAbi17, encodeFunctionData as encodeFunctionData16 } from "viem";
import { parseAbi as parseAbi18, encodeFunctionData as encodeFunctionData17, decodeFunctionResult as decodeFunctionResult4, zeroAddress as zeroAddress7 } from "viem";
import { createPublicClient as createPublicClient14, http as http14, parseAbi as parseAbi19, encodeFunctionData as encodeFunctionData18, zeroAddress as zeroAddress8 } from "viem";
import { createPublicClient as createPublicClient15, http as http15, parseAbi as parseAbi20 } from "viem";
import { createPublicClient as createPublicClient16, http as http16, parseAbi as parseAbi21, encodeFunctionData as encodeFunctionData19 } from "viem";
import { parseAbi as parseAbi222, encodeFunctionData as encodeFunctionData20 } from "viem";
import { createPublicClient as createPublicClient17, http as http17, parseAbi as parseAbi23, encodeFunctionData as encodeFunctionData21, zeroAddress as zeroAddress9 } from "viem";
import { createPublicClient as createPublicClient18, http as http18, parseAbi as parseAbi24, encodeFunctionData as encodeFunctionData222, zeroAddress as zeroAddress10 } from "viem";
import { parseAbi as parseAbi25, encodeFunctionData as encodeFunctionData23 } from "viem";
import { parseAbi as parseAbi26, encodeFunctionData as encodeFunctionData24 } from "viem";
import { createPublicClient as createPublicClient19, http as http19, parseAbi as parseAbi27 } from "viem";
function decodeAddressResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _addressAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function decodeUint256Result(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _uint256Abi, functionName: "f", data });
  } catch {
    return null;
  }
}
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
function decodeRangeResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _rangeAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function decodeBinResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult22({ abi: _binAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
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
  return encodeFunctionData11({
    abi: farmingCenterAbi,
    functionName: "enterFarming",
    args: [key, tokenId]
  });
}
function encodeExitFarming(key, tokenId) {
  return encodeFunctionData11({
    abi: farmingCenterAbi,
    functionName: "exitFarming",
    args: [key, tokenId]
  });
}
function encodeCollectRewards(key, tokenId) {
  return encodeFunctionData11({
    abi: farmingCenterAbi,
    functionName: "collectRewards",
    args: [key, tokenId]
  });
}
function encodeClaimReward(rewardToken, to) {
  return encodeFunctionData11({
    abi: farmingCenterAbi,
    functionName: "claimReward",
    args: [rewardToken, to, 2n ** 128n - 1n]
    // max uint128
  });
}
function encodeMulticall(calls) {
  return encodeFunctionData11({
    abi: farmingCenterAbi,
    functionName: "multicall",
    args: [calls]
  });
}
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
function u256ToF642(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
function defaultMarketParams(loanToken = zeroAddress7) {
  return {
    loanToken,
    collateralToken: zeroAddress7,
    oracle: zeroAddress7,
    irm: zeroAddress7,
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
      return new SolidlyGaugeAdapter(entry, rpcUrl);
    default:
      throw DefiError.unsupported(`Gauge interface '${entry.interface}' not supported`);
  }
}
function createMasterChef(entry, rpcUrl) {
  return new MasterChefAdapter(entry, rpcUrl);
}
function createYieldSource(entry, rpcUrl) {
  switch (entry.interface) {
    case "pendle_v2":
      return new PendleAdapter(entry, rpcUrl);
    default:
      return new GenericYieldAdapter(entry, rpcUrl);
  }
}
function createDerivatives(entry, rpcUrl) {
  switch (entry.interface) {
    case "hlp_vault":
      return new HlpVaultAdapter(entry, rpcUrl);
    default:
      return new GenericDerivativesAdapter(entry, rpcUrl);
  }
}
function createOptions(entry, rpcUrl) {
  switch (entry.interface) {
    case "rysk":
      return new RyskAdapter(entry, rpcUrl);
    default:
      return new GenericOptionsAdapter(entry, rpcUrl);
  }
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
  return new KittenSwapFarmingAdapter(entry.name, farmingCenter, eternalFarming, rpcUrl);
}
var DEFAULT_FEE, swapRouterAbi, quoterAbi, ramsesQuoterAbi, positionManagerAbi, UniswapV3Adapter, abi, lbQuoterAbi, UniswapV2Adapter, abi2, algebraQuoterAbi, algebraSingleQuoterAbi, algebraPositionManagerAbi, AlgebraV3Adapter, abi3, BalancerV3Adapter, poolAbi, CurveStableSwapAdapter, abi4, abiV2, SolidlyAdapter, abi5, WooFiAdapter, gaugeAbi, veAbi, voterAbi, SolidlyGaugeAdapter, masterchefAbi, MasterChefAdapter, lbRouterAbi, lbFactoryAbi, lbPairAbi, lbRewarderAbi, masterChefAbi, veMoeAbi, lbPairBinAbi, lbQuoterAbi2, erc20Abi2, _addressAbi, _uint256Abi, _boolAbi, _rangeAbi, _binAbi, _uint256ArrayAbi, MerchantMoeLBAdapter, KITTEN_TOKEN, WHYPE_TOKEN, MAX_NONCE_SCAN, farmingCenterAbi, eternalFarmingAbi, KNOWN_NONCES, KittenSwapFarmingAdapter, POOL_ABI, ERC20_ABI, INCENTIVES_ABI, REWARDS_CONTROLLER_ABI, POOL_PROVIDER_ABI, ADDRESSES_PROVIDER_ABI, ORACLE_ABI, ERC20_DECIMALS_ABI, AaveV3Adapter, POOL_ABI2, ERC20_ABI2, AaveV2Adapter, ORACLE_ABI2, AaveOracleAdapter, CTOKEN_ABI, BSC_BLOCKS_PER_YEAR, CompoundV2Adapter, COMET_ABI, SECONDS_PER_YEAR, CompoundV3Adapter, EULER_VAULT_ABI, SECONDS_PER_YEAR2, EulerV2Adapter, MORPHO_ABI, META_MORPHO_ABI, IRM_ABI, SECONDS_PER_YEAR3, MorphoBlueAdapter, BORROWER_OPS_ABI, TROVE_MANAGER_ABI, HINT_HELPERS_ABI, SORTED_TROVES_ABI, FelixCdpAdapter, PRICE_FEED_ABI, FelixOracleAdapter, ERC4626_ABI, ERC4626VaultAdapter, GENERIC_LST_ABI, GenericLstAdapter, STHYPE_ABI, ERC20_ABI3, StHypeAdapter, KINETIQ_ABI, ORACLE_ABI3, WHYPE, HYPERLEND_ORACLE, KinetiqAdapter, PendleAdapter, GenericYieldAdapter, HLP_ABI, HlpVaultAdapter, GenericDerivativesAdapter, RYSK_ABI, RyskAdapter, GenericOptionsAdapter, ERC721_ABI, ERC721Adapter, DexSpotPrice;
var init_dist3 = __esm({
  "../defi-protocols/dist/index.js"() {
    "use strict";
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    init_dist2();
    DEFAULT_FEE = 3e3;
    swapRouterAbi = parseAbi3([
      "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
      "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
    ]);
    quoterAbi = parseAbi3([
      "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
      "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ]);
    ramsesQuoterAbi = parseAbi3([
      "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; int24 tickSpacing; uint160 sqrtPriceLimitX96; }",
      "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ]);
    positionManagerAbi = parseAbi3([
      "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
      "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
    ]);
    UniswapV3Adapter = class {
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
        const data = encodeFunctionData3({
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
          const client2 = createPublicClient2({ transport: http2(this.rpcUrl) });
          if (this.useTickSpacingQuoter) {
            const tickSpacings = [1, 10, 50, 100, 200];
            const tsResults = await Promise.allSettled(
              tickSpacings.map(async (ts) => {
                const result = await client2.call({
                  to: this.quoter,
                  data: encodeFunctionData3({
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
                data: encodeFunctionData3({
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
        const client = createPublicClient2({ transport: http2(this.rpcUrl) });
        const callData = encodeFunctionData3({
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
        const data = encodeFunctionData3({
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
    abi = parseAbi22([
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
      "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
      "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
      "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)"
    ]);
    lbQuoterAbi = parseAbi22([
      "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
    ]);
    UniswapV2Adapter = class {
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
    abi2 = parseAbi32([
      "struct ExactInputSingleParams { address tokenIn; address tokenOut; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 limitSqrtPrice; }",
      "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
    ]);
    algebraQuoterAbi = parseAbi32([
      "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256[] memory amountOutList, uint256[] memory amountInList, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate, uint16[] memory feeList)"
    ]);
    algebraSingleQuoterAbi = parseAbi32([
      "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) params) external returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After)"
    ]);
    algebraPositionManagerAbi = parseAbi32([
      "struct MintParams { address token0; address token1; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
      "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
    ]);
    AlgebraV3Adapter = class {
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
        const client = createPublicClient3({ transport: http3(this.rpcUrl) });
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
        const amount0 = rawAmount0 === 0n && rawAmount1 > 0n ? 1n : rawAmount0;
        const amount1 = rawAmount1 === 0n && rawAmount0 > 0n ? 1n : rawAmount1;
        const data = encodeFunctionData32({
          abi: algebraPositionManagerAbi,
          functionName: "mint",
          args: [
            {
              token0,
              token1,
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
    abi3 = parseAbi4([
      "function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes calldata userData) external returns (uint256 amountOut)"
    ]);
    BalancerV3Adapter = class {
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
        const data = encodeFunctionData4({
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
    poolAbi = parseAbi5([
      "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
      "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
      "function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) external returns (uint256)",
      "function remove_liquidity(uint256 amount, uint256[2] min_amounts) external returns (uint256[2])"
    ]);
    CurveStableSwapAdapter = class {
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
    abi4 = parseAbi6([
      "struct Route { address from; address to; bool stable; }",
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
      "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] calldata routes) external view returns (uint256[] memory amounts)",
      "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
      "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)"
    ]);
    abiV2 = parseAbi6([
      "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] calldata routes) external view returns (uint256[] memory amounts)"
    ]);
    SolidlyAdapter = class {
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
    abi5 = parseAbi7([
      "function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) external payable returns (uint256 realToAmount)"
    ]);
    WooFiAdapter = class {
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
        const data = encodeFunctionData7({
          abi: abi5,
          functionName: "swap",
          args: [
            params.token_in,
            params.token_out,
            params.amount_in,
            minToAmount,
            params.recipient,
            zeroAddress3
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
    gaugeAbi = parseAbi8([
      "function deposit(uint256 amount) external",
      "function depositFor(uint256 amount, uint256 tokenId) external",
      "function withdraw(uint256 amount) external",
      "function getReward(address account) external",
      "function getReward(address account, address[] tokens) external",
      "function earned(address account) external view returns (uint256)",
      "function earned(address token, address account) external view returns (uint256)",
      "function rewardRate() external view returns (uint256)",
      "function totalSupply() external view returns (uint256)",
      "function rewardsListLength() external view returns (uint256)",
      "function isReward(address token) external view returns (bool)"
    ]);
    veAbi = parseAbi8([
      "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
      "function increase_amount(uint256 tokenId, uint256 value) external",
      "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
      "function withdraw(uint256 tokenId) external",
      "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
      "function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)"
    ]);
    voterAbi = parseAbi8([
      "function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external",
      "function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external",
      "function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external",
      "function gauges(address pool) external view returns (address)"
    ]);
    SolidlyGaugeAdapter = class {
      protocolName;
      voter;
      veToken;
      rpcUrl;
      constructor(entry, rpcUrl) {
        this.protocolName = entry.name;
        const voter = entry.contracts?.["voter"];
        if (!voter) {
          throw new DefiError("CONTRACT_ERROR", "Missing 'voter' contract");
        }
        const veToken = entry.contracts?.["ve_token"];
        if (!veToken) {
          throw new DefiError("CONTRACT_ERROR", "Missing 've_token' contract");
        }
        this.voter = voter;
        this.veToken = veToken;
        this.rpcUrl = rpcUrl;
      }
      name() {
        return this.protocolName;
      }
      // IGauge
      async buildDeposit(gauge, amount, tokenId, lpToken) {
        if (tokenId !== void 0) {
          const data2 = encodeFunctionData8({
            abi: gaugeAbi,
            functionName: "depositFor",
            args: [amount, tokenId]
          });
          return {
            description: `[${this.protocolName}] Deposit ${amount} LP to gauge (boost veNFT #${tokenId})`,
            to: gauge,
            data: data2,
            value: 0n,
            gas_estimate: 2e5,
            approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : void 0
          };
        }
        const data = encodeFunctionData8({
          abi: gaugeAbi,
          functionName: "deposit",
          args: [amount]
        });
        return {
          description: `[${this.protocolName}] Deposit ${amount} LP to gauge`,
          to: gauge,
          data,
          value: 0n,
          gas_estimate: 2e5,
          approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : void 0
        };
      }
      async buildWithdraw(gauge, amount) {
        const data = encodeFunctionData8({
          abi: gaugeAbi,
          functionName: "withdraw",
          args: [amount]
        });
        return {
          description: `[${this.protocolName}] Withdraw ${amount} LP from gauge`,
          to: gauge,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      async buildClaimRewards(gauge, account) {
        if (account && this.rpcUrl) {
          try {
            const client = createPublicClient4({ transport: http4(this.rpcUrl) });
            const listLen = await client.readContract({
              address: gauge,
              abi: gaugeAbi,
              functionName: "rewardsListLength"
            });
            if (listLen > 0n) {
              const data2 = encodeFunctionData8({
                abi: gaugeAbi,
                functionName: "getReward",
                args: [account, []]
              });
              return {
                description: `[${this.protocolName}] Claim gauge rewards`,
                to: gauge,
                data: data2,
                value: 0n,
                gas_estimate: 3e5
              };
            }
          } catch {
          }
        }
        const data = encodeFunctionData8({
          abi: gaugeAbi,
          functionName: "getReward",
          args: [account ?? zeroAddress4]
        });
        return {
          description: `[${this.protocolName}] Claim gauge rewards`,
          to: gauge,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      async getPendingRewards(_gauge, _user) {
        throw DefiError.unsupported(`[${this.protocolName}] get_pending_rewards requires RPC`);
      }
      // IVoteEscrow
      async buildCreateLock(amount, lockDuration) {
        const data = encodeFunctionData8({
          abi: veAbi,
          functionName: "create_lock",
          args: [amount, BigInt(lockDuration)]
        });
        return {
          description: `[${this.protocolName}] Create veNFT lock: ${amount} tokens for ${lockDuration}s`,
          to: this.veToken,
          data,
          value: 0n,
          gas_estimate: 3e5
        };
      }
      async buildIncreaseAmount(tokenId, amount) {
        const data = encodeFunctionData8({
          abi: veAbi,
          functionName: "increase_amount",
          args: [tokenId, amount]
        });
        return {
          description: `[${this.protocolName}] Increase veNFT #${tokenId} by ${amount}`,
          to: this.veToken,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      async buildIncreaseUnlockTime(tokenId, lockDuration) {
        const data = encodeFunctionData8({
          abi: veAbi,
          functionName: "increase_unlock_time",
          args: [tokenId, BigInt(lockDuration)]
        });
        return {
          description: `[${this.protocolName}] Extend veNFT #${tokenId} lock by ${lockDuration}s`,
          to: this.veToken,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      async buildWithdrawExpired(tokenId) {
        const data = encodeFunctionData8({
          abi: veAbi,
          functionName: "withdraw",
          args: [tokenId]
        });
        return {
          description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
          to: this.veToken,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      // IVoter
      async buildVote(tokenId, pools, weights) {
        const data = encodeFunctionData8({
          abi: voterAbi,
          functionName: "vote",
          args: [tokenId, pools, weights]
        });
        return {
          description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
          to: this.voter,
          data,
          value: 0n,
          gas_estimate: 5e5
        };
      }
      async buildClaimBribes(bribes, tokenId) {
        const tokensPerBribe = bribes.map(() => []);
        const data = encodeFunctionData8({
          abi: voterAbi,
          functionName: "claimBribes",
          args: [bribes, tokensPerBribe, tokenId]
        });
        return {
          description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
          to: this.voter,
          data,
          value: 0n,
          gas_estimate: 3e5
        };
      }
      async buildClaimFees(fees, tokenId) {
        const tokensPerFee = fees.map(() => []);
        const data = encodeFunctionData8({
          abi: voterAbi,
          functionName: "claimFees",
          args: [fees, tokensPerFee, tokenId]
        });
        return {
          description: `[${this.protocolName}] Claim trading fees for veNFT #${tokenId}`,
          to: this.voter,
          data,
          value: 0n,
          gas_estimate: 3e5
        };
      }
    };
    masterchefAbi = parseAbi9([
      "function deposit(uint256 pid, uint256 amount) external",
      "function withdraw(uint256 pid, uint256 amount) external",
      "function claim(uint256[] calldata pids) external",
      "function pendingRewards(address account, uint256[] calldata pids) view returns (uint256[] memory moeRewards)",
      "function getNumberOfFarms() view returns (uint256)",
      "function getPidByPool(address pool) view returns (uint256)"
    ]);
    MasterChefAdapter = class {
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
        const data = encodeFunctionData9({
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
        const data = encodeFunctionData9({
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
        const data = encodeFunctionData9({
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
        const data = encodeFunctionData9({
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
        const data = encodeFunctionData9({
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
        const client = createPublicClient5({ transport: http5(this.rpcUrl) });
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
    lbRouterAbi = parseAbi10([
      "struct LiquidityParameters { address tokenX; address tokenY; uint256 binStep; uint256 amountX; uint256 amountY; uint256 amountXMin; uint256 amountYMin; uint256 activeIdDesired; uint256 idSlippage; int256[] deltaIds; uint256[] distributionX; uint256[] distributionY; address to; address refundTo; uint256 deadline; }",
      "function addLiquidity(LiquidityParameters calldata liquidityParameters) external returns (uint256 amountXAdded, uint256 amountYAdded, uint256 amountXLeft, uint256 amountYLeft, uint256[] memory depositIds, uint256[] memory liquidityMinted)",
      "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] memory ids, uint256[] memory amounts, address to, uint256 deadline) external returns (uint256 amountX, uint256 amountY)"
    ]);
    lbFactoryAbi = parseAbi10([
      "function getNumberOfLBPairs() external view returns (uint256)",
      "function getLBPairAtIndex(uint256 index) external view returns (address)"
    ]);
    lbPairAbi = parseAbi10([
      "function getLBHooksParameters() external view returns (bytes32)",
      "function getActiveId() external view returns (uint24)",
      "function getBinStep() external view returns (uint16)",
      "function getTokenX() external view returns (address)",
      "function getTokenY() external view returns (address)",
      "function balanceOf(address account, uint256 id) external view returns (uint256)",
      "function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)"
    ]);
    lbRewarderAbi = parseAbi10([
      "function getRewardToken() external view returns (address)",
      "function getRewardedRange() external view returns (uint256 minBinId, uint256 maxBinId)",
      "function getPendingRewards(address user, uint256[] calldata ids) external view returns (uint256 pendingRewards)",
      "function claim(address user, uint256[] calldata ids) external",
      "function getPid() external view returns (uint256)",
      "function isStopped() external view returns (bool)",
      "function getLBPair() external view returns (address)",
      "function getMasterChef() external view returns (address)"
    ]);
    masterChefAbi = parseAbi10([
      "function getMoePerSecond() external view returns (uint256)",
      "function getTreasuryShare() external view returns (uint256)",
      "function getStaticShare() external view returns (uint256)",
      "function getVeMoe() external view returns (address)"
    ]);
    veMoeAbi = parseAbi10([
      "function getWeight(uint256 pid) external view returns (uint256)",
      "function getTotalWeight() external view returns (uint256)",
      "function getTopPoolIds() external view returns (uint256[] memory)"
    ]);
    lbPairBinAbi = parseAbi10([
      "function getBin(uint24 id) external view returns (uint128 reserveX, uint128 reserveY)",
      "function getActiveId() external view returns (uint24)"
    ]);
    lbQuoterAbi2 = parseAbi10([
      "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
    ]);
    erc20Abi2 = parseAbi10([
      "function symbol() external view returns (string)"
    ]);
    _addressAbi = parseAbi10(["function f() external view returns (address)"]);
    _uint256Abi = parseAbi10(["function f() external view returns (uint256)"]);
    _boolAbi = parseAbi10(["function f() external view returns (bool)"]);
    _rangeAbi = parseAbi10(["function f() external view returns (uint256 minBinId, uint256 maxBinId)"]);
    _binAbi = parseAbi10(["function f() external view returns (uint128 reserveX, uint128 reserveY)"]);
    _uint256ArrayAbi = parseAbi10(["function f() external view returns (uint256[] memory)"]);
    MerchantMoeLBAdapter = class {
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
          const client = createPublicClient6({ transport: http6(rpcUrl) });
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
        const data = encodeFunctionData10({
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
        const data = encodeFunctionData10({
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
        const client = createPublicClient6({ transport: http6(rpcUrl) });
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
        const client = createPublicClient6({ transport: http6(rpcUrl) });
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
        const client = createPublicClient6({ transport: http6(rpcUrl) });
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
        const data = encodeFunctionData10({
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
        const client = createPublicClient6({ transport: http6(rpcUrl) });
        const pairCount = await client.readContract({
          address: this.lbFactory,
          abi: lbFactoryAbi,
          functionName: "getNumberOfLBPairs"
        });
        const count = Number(pairCount);
        if (count === 0) return [];
        const batch1Calls = Array.from({ length: count }, (_, i) => [
          this.lbFactory,
          encodeFunctionData10({ abi: lbFactoryAbi, functionName: "getLBPairAtIndex", args: [BigInt(i)] })
        ]);
        const batch1Results = await multicallRead(rpcUrl, batch1Calls);
        const pairAddresses = batch1Results.map((r) => decodeAddressResult(r)).filter((a) => a !== null);
        if (pairAddresses.length === 0) return [];
        const batch2Calls = pairAddresses.map((pair) => [
          pair,
          encodeFunctionData10({ abi: lbPairAbi, functionName: "getLBHooksParameters" })
        ]);
        const batch2Results = await multicallRead(rpcUrl, batch2Calls);
        const rewardedPairs = [];
        for (let i = 0; i < pairAddresses.length; i++) {
          const raw = batch2Results[i];
          if (!raw) continue;
          let hooksBytes;
          try {
            const _bytes32Abi = parseAbi10(["function f() external view returns (bytes32)"]);
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
          batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "isStopped" })]);
          batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getRewardedRange" })]);
          batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getRewardToken" })]);
          batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getPid" })]);
          batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getMasterChef" })]);
        }
        const batch3Results = await multicallRead(rpcUrl, batch3Calls);
        const batch4aCalls = [];
        for (const { pool } of rewardedPairs) {
          batch4aCalls.push([pool, encodeFunctionData10({ abi: lbPairAbi, functionName: "getTokenX" })]);
          batch4aCalls.push([pool, encodeFunctionData10({ abi: lbPairAbi, functionName: "getTokenY" })]);
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
          encodeFunctionData10({ abi: erc20Abi2, functionName: "symbol" })
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
            [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getMoePerSecond" })],
            [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getTreasuryShare" })],
            [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getStaticShare" })],
            [veMoeAddr, encodeFunctionData10({ abi: veMoeAbi, functionName: "getTotalWeight" })],
            [veMoeAddr, encodeFunctionData10({ abi: veMoeAbi, functionName: "getTopPoolIds" })]
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
            encodeFunctionData10({ abi: veMoeAbi, functionName: "getWeight", args: [BigInt(d.pid)] })
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
            encodeFunctionData10({ abi: lbPairBinAbi, functionName: "getBin", args: [binId] })
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
        const client = createPublicClient6({ transport: http6(rpcUrl) });
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
    KITTEN_TOKEN = "0x618275f8efe54c2afa87bfb9f210a52f0ff89364";
    WHYPE_TOKEN = "0x5555555555555555555555555555555555555555";
    MAX_NONCE_SCAN = 60;
    farmingCenterAbi = parseAbi11([
      "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
      "function enterFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
      "function exitFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
      "function collectRewards((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
      "function claimReward(address rewardToken, address to, uint128 amountRequested) external returns (uint256 reward)"
    ]);
    eternalFarmingAbi = parseAbi11([
      "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
      "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)"
    ]);
    KNOWN_NONCES = {
      // WHYPE/KITTEN pool
      "0x71d1fde797e1810711e4c9abcfca6ef04c266196": 33,
      // WHYPE/USDT0 pool
      "0x3c1403335d0ca7d0a73c9e775b25514537c2b809": 1,
      // WHYPE/USDC pool
      "0x12df9913e9e08453440e3c4b1ae73819160b513e": 43
    };
    KittenSwapFarmingAdapter = class {
      protocolName;
      farmingCenter;
      eternalFarming;
      rpcUrl;
      constructor(protocolName, farmingCenter, eternalFarming, rpcUrl) {
        this.protocolName = protocolName;
        this.farmingCenter = farmingCenter;
        this.eternalFarming = eternalFarming;
        this.rpcUrl = rpcUrl;
      }
      name() {
        return this.protocolName;
      }
      /**
       * Discover the active IncentiveKey for a given pool by scanning nonces 0–MAX_NONCE_SCAN.
       * Checks KNOWN_NONCES first for instant resolution.
       */
      async discoverIncentiveKey(pool) {
        const poolLc = pool.toLowerCase();
        if (poolLc in KNOWN_NONCES) {
          const nonce = KNOWN_NONCES[poolLc];
          return {
            rewardToken: KITTEN_TOKEN,
            bonusRewardToken: WHYPE_TOKEN,
            pool,
            nonce: BigInt(nonce)
          };
        }
        const client = createPublicClient7({ transport: http7(this.rpcUrl) });
        for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
          const key = {
            rewardToken: KITTEN_TOKEN,
            bonusRewardToken: WHYPE_TOKEN,
            pool,
            nonce: BigInt(n)
          };
          try {
            const result = await client.readContract({
              address: this.eternalFarming,
              abi: eternalFarmingAbi,
              functionName: "incentives",
              args: [incentiveId(key)]
            });
            const totalReward = result[0];
            const deactivated = result[4];
            if (totalReward > 0n && !deactivated) {
              return key;
            }
          } catch {
          }
        }
        return null;
      }
      /**
       * Build a multicall tx that enters farming for a position NFT.
       * Pattern: multicall([enterFarming(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
       */
      async buildEnterFarming(tokenId, pool, owner) {
        const key = await this.discoverIncentiveKey(pool);
        if (!key) {
          throw new DefiError(
            "CONTRACT_ERROR",
            `[${this.protocolName}] No active incentive found for pool ${pool}`
          );
        }
        const calls = [
          encodeEnterFarming(key, tokenId),
          encodeClaimReward(KITTEN_TOKEN, owner),
          encodeClaimReward(WHYPE_TOKEN, owner)
        ];
        return {
          description: `[${this.protocolName}] Enter farming for NFT #${tokenId} in pool ${pool}`,
          to: this.farmingCenter,
          data: encodeMulticall(calls),
          value: 0n,
          gas_estimate: 4e5
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
        const client = createPublicClient7({ transport: http7(this.rpcUrl) });
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
       * Iterates KNOWN_NONCES pools and verifies each against the on-chain incentives mapping.
       */
      async discoverFarmingPools() {
        const client = createPublicClient7({ transport: http7(this.rpcUrl) });
        const results = [];
        for (const [poolAddr, nonce] of Object.entries(KNOWN_NONCES)) {
          const pool = poolAddr;
          const key = {
            rewardToken: KITTEN_TOKEN,
            bonusRewardToken: WHYPE_TOKEN,
            pool,
            nonce: BigInt(nonce)
          };
          try {
            const incentive = await client.readContract({
              address: this.eternalFarming,
              abi: eternalFarmingAbi,
              functionName: "incentives",
              args: [incentiveId(key)]
            });
            const totalReward = incentive[0];
            const bonusReward = incentive[1];
            const deactivated = incentive[4];
            results.push({
              pool,
              key,
              totalReward,
              bonusReward,
              active: !deactivated && totalReward > 0n
            });
          } catch {
          }
        }
        return results;
      }
    };
    POOL_ABI = parseAbi12([
      "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
      "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
      "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
      "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
      "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
      "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)"
    ]);
    ERC20_ABI = parseAbi12([
      "function totalSupply() external view returns (uint256)"
    ]);
    INCENTIVES_ABI = parseAbi12([
      "function getIncentivesController() external view returns (address)"
    ]);
    REWARDS_CONTROLLER_ABI = parseAbi12([
      "function getRewardsByAsset(address asset) external view returns (address[])",
      "function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionsPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)"
    ]);
    POOL_PROVIDER_ABI = parseAbi12([
      "function ADDRESSES_PROVIDER() external view returns (address)"
    ]);
    ADDRESSES_PROVIDER_ABI = parseAbi12([
      "function getPriceOracle() external view returns (address)"
    ]);
    ORACLE_ABI = parseAbi12([
      "function getAssetPrice(address asset) external view returns (uint256)",
      "function BASE_CURRENCY_UNIT() external view returns (uint256)"
    ]);
    ERC20_DECIMALS_ABI = parseAbi12([
      "function decimals() external view returns (uint8)"
    ]);
    AaveV3Adapter = class {
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
        const data = encodeFunctionData12({
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
        const data = encodeFunctionData12({
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
        const data = encodeFunctionData12({
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
        const data = encodeFunctionData12({
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
        const reserveCallData = encodeFunctionData12({
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
          [aTokenAddress, encodeFunctionData12({ abi: ERC20_ABI, functionName: "totalSupply" })],
          [variableDebtTokenAddress, encodeFunctionData12({ abi: ERC20_ABI, functionName: "totalSupply" })]
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
            [aTokenAddress, encodeFunctionData12({ abi: INCENTIVES_ABI, functionName: "getIncentivesController" })]
          ]);
          const controllerAddr = decodeAddress(controllerRaw ?? null);
          if (controllerAddr && controllerAddr !== zeroAddress5) {
            const [supplyRewardsRaw, borrowRewardsRaw] = await multicallRead(this.rpcUrl, [
              [controllerAddr, encodeFunctionData12({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [aTokenAddress] })],
              [controllerAddr, encodeFunctionData12({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [variableDebtTokenAddress] })]
            ]);
            const supplyRewards = decodeAddressArray(supplyRewardsRaw ?? null);
            const borrowRewards = decodeAddressArray(borrowRewardsRaw ?? null);
            const rewardsDataCalls = [
              ...supplyRewards.map((reward) => [
                controllerAddr,
                encodeFunctionData12({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [aTokenAddress, reward] })
              ]),
              ...borrowRewards.map((reward) => [
                controllerAddr,
                encodeFunctionData12({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [variableDebtTokenAddress, reward] })
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
              [this.pool, encodeFunctionData12({ abi: POOL_PROVIDER_ABI, functionName: "ADDRESSES_PROVIDER" })]
            ]);
            const providerAddr = decodeAddress(providerRaw ?? null);
            if (!providerAddr) throw new Error("No provider address");
            const [oracleRaw] = await multicallRead(this.rpcUrl, [
              [providerAddr, encodeFunctionData12({ abi: ADDRESSES_PROVIDER_ABI, functionName: "getPriceOracle" })]
            ]);
            const oracleAddr = decodeAddress(oracleRaw ?? null);
            if (!oracleAddr) throw new Error("No oracle address");
            const [assetPriceRaw, baseCurrencyUnitRaw, assetDecimalsRaw] = await multicallRead(this.rpcUrl, [
              [oracleAddr, encodeFunctionData12({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [asset] })],
              [oracleAddr, encodeFunctionData12({ abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })],
              [asset, encodeFunctionData12({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
            ]);
            const assetPrice = decodeU256(assetPriceRaw ?? null);
            const baseCurrencyUnit = decodeU256(baseCurrencyUnitRaw ?? null);
            const assetDecimals = assetDecimalsRaw ? Number(decodeU256(assetDecimalsRaw)) : 18;
            const priceUnit = Number(baseCurrencyUnit) || 1e8;
            const assetPriceF = Number(assetPrice) / priceUnit;
            const assetDecimalsDivisor = 10 ** assetDecimals;
            const allRewardTokens = Array.from(/* @__PURE__ */ new Set([...supplyRewardTokens, ...borrowRewardTokens]));
            const rewardPriceCalls = allRewardTokens.flatMap((token) => [
              [oracleAddr, encodeFunctionData12({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] })],
              [token, encodeFunctionData12({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
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
        const client = createPublicClient8({ transport: http8(this.rpcUrl) });
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
        const supplies = collateralUsd > 0 ? [{ asset: zeroAddress5, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
        const borrows = debtUsd > 0 ? [{ asset: zeroAddress5, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
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
    POOL_ABI2 = parseAbi13([
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
    ERC20_ABI2 = parseAbi13([
      "function totalSupply() external view returns (uint256)"
    ]);
    AaveV2Adapter = class {
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
        const data = encodeFunctionData13({
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
        const data = encodeFunctionData13({
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
        const data = encodeFunctionData13({
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
        const client = createPublicClient9({ transport: http9(this.rpcUrl) });
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
            abi: ERC20_ABI2,
            functionName: "totalSupply"
          }).catch(() => 0n),
          client.readContract({
            address: variableDebtTokenAddress,
            abi: ERC20_ABI2,
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
        const client = createPublicClient9({ transport: http9(this.rpcUrl) });
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
    ORACLE_ABI2 = parseAbi14([
      "function getAssetPrice(address asset) external view returns (uint256)",
      "function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)",
      "function BASE_CURRENCY_UNIT() external view returns (uint256)"
    ]);
    AaveOracleAdapter = class {
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
        const client = createPublicClient10({ transport: http10(this.rpcUrl) });
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
        const client = createPublicClient10({ transport: http10(this.rpcUrl) });
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
    CTOKEN_ABI = parseAbi15([
      "function supplyRatePerBlock() external view returns (uint256)",
      "function borrowRatePerBlock() external view returns (uint256)",
      "function totalSupply() external view returns (uint256)",
      "function totalBorrows() external view returns (uint256)",
      "function mint(uint256 mintAmount) external returns (uint256)",
      "function redeem(uint256 redeemTokens) external returns (uint256)",
      "function borrow(uint256 borrowAmount) external returns (uint256)",
      "function repayBorrow(uint256 repayAmount) external returns (uint256)"
    ]);
    BSC_BLOCKS_PER_YEAR = 10512e3;
    CompoundV2Adapter = class {
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
        const data = encodeFunctionData14({
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
        const data = encodeFunctionData14({
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
        const data = encodeFunctionData14({
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
        const data = encodeFunctionData14({
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
        const client = createPublicClient11({ transport: http11(this.rpcUrl) });
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
    COMET_ABI = parseAbi16([
      "function getUtilization() external view returns (uint256)",
      "function getSupplyRate(uint256 utilization) external view returns (uint64)",
      "function getBorrowRate(uint256 utilization) external view returns (uint64)",
      "function totalSupply() external view returns (uint256)",
      "function totalBorrow() external view returns (uint256)",
      "function supply(address asset, uint256 amount) external",
      "function withdraw(address asset, uint256 amount) external"
    ]);
    SECONDS_PER_YEAR = 365.25 * 24 * 3600;
    CompoundV3Adapter = class {
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
        const data = encodeFunctionData15({
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
        const data = encodeFunctionData15({
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
        const data = encodeFunctionData15({
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
        const data = encodeFunctionData15({
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
        const client = createPublicClient12({ transport: http12(this.rpcUrl) });
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
    EULER_VAULT_ABI = parseAbi17([
      "function deposit(uint256 amount, address receiver) external returns (uint256)",
      "function withdraw(uint256 amount, address receiver, address owner) external returns (uint256)",
      "function borrow(uint256 amount, address receiver) external returns (uint256)",
      "function repay(uint256 amount, address receiver) external returns (uint256)",
      "function totalSupply() external view returns (uint256)",
      "function totalBorrows() external view returns (uint256)",
      "function interestRate() external view returns (uint256)"
    ]);
    SECONDS_PER_YEAR2 = 365.25 * 24 * 3600;
    EulerV2Adapter = class {
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
        const data = encodeFunctionData16({
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
        const data = encodeFunctionData16({
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
        const data = encodeFunctionData16({
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
        const data = encodeFunctionData16({
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
        const client = createPublicClient13({ transport: http13(this.rpcUrl) });
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
    MORPHO_ABI = parseAbi18([
      "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
      "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
      "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
      "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
      "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
      "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)"
    ]);
    META_MORPHO_ABI = parseAbi18([
      "function supplyQueueLength() external view returns (uint256)",
      "function supplyQueue(uint256 index) external view returns (bytes32)",
      "function totalAssets() external view returns (uint256)",
      "function totalSupply() external view returns (uint256)"
    ]);
    IRM_ABI = parseAbi18([
      "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)"
    ]);
    SECONDS_PER_YEAR3 = 365.25 * 24 * 3600;
    MorphoBlueAdapter = class {
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
        const data = encodeFunctionData17({
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
        const data = encodeFunctionData17({
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
        const data = encodeFunctionData17({
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
        const data = encodeFunctionData17({
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
          [this.defaultVault, encodeFunctionData17({ abi: META_MORPHO_ABI, functionName: "supplyQueueLength" })]
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
          [this.defaultVault, encodeFunctionData17({ abi: META_MORPHO_ABI, functionName: "supplyQueue", args: [0n] })]
        ]).catch((e) => {
          throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`);
        });
        if (!marketIdRaw || marketIdRaw.length < 66) {
          throw DefiError.rpcError(`[${this.protocolName}] supplyQueue(0) returned no data`);
        }
        const marketId = marketIdRaw.slice(0, 66);
        const [marketRaw, paramsRaw] = await multicallRead(this.rpcUrl, [
          [this.morpho, encodeFunctionData17({ abi: MORPHO_ABI, functionName: "market", args: [marketId] })],
          [this.morpho, encodeFunctionData17({ abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] })]
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
            [irm, encodeFunctionData17({ abi: IRM_ABI, functionName: "borrowRateView", args: [irmMarketParams, irmMarket] })]
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
    BORROWER_OPS_ABI = parseAbi19([
      "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
      "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
      "function closeTrove(uint256 _troveId) external"
    ]);
    TROVE_MANAGER_ABI = parseAbi19([
      "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)"
    ]);
    HINT_HELPERS_ABI = parseAbi19([
      "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)"
    ]);
    SORTED_TROVES_ABI = parseAbi19([
      "function findInsertPosition(uint256 _annualInterestRate, uint256 _prevId, uint256 _nextId) external view returns (uint256 prevId, uint256 nextId)"
    ]);
    FelixCdpAdapter = class {
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
        const client = createPublicClient14({ transport: http14(this.rpcUrl) });
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
        const data = encodeFunctionData18({
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
        const data = encodeFunctionData18({
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
        const data = encodeFunctionData18({
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
        const client = createPublicClient14({ transport: http14(this.rpcUrl) });
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
            token: zeroAddress8,
            symbol: "WHYPE",
            amount: entireColl,
            decimals: 18
          },
          debt: {
            token: zeroAddress8,
            symbol: "feUSD",
            amount: entireDebt,
            decimals: 18
          },
          collateral_ratio: collRatio
        };
      }
    };
    PRICE_FEED_ABI = parseAbi20([
      "function fetchPrice() external view returns (uint256 price, bool isNewOracleFailureDetected)",
      "function lastGoodPrice() external view returns (uint256)"
    ]);
    FelixOracleAdapter = class {
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
        const client = createPublicClient15({ transport: http15(this.rpcUrl) });
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
    ERC4626_ABI = parseAbi21([
      "function asset() external view returns (address)",
      "function totalAssets() external view returns (uint256)",
      "function totalSupply() external view returns (uint256)",
      "function convertToShares(uint256 assets) external view returns (uint256)",
      "function convertToAssets(uint256 shares) external view returns (uint256)",
      "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
      "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)"
    ]);
    ERC4626VaultAdapter = class {
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
        const data = encodeFunctionData19({
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
        const data = encodeFunctionData19({
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
        const client = createPublicClient16({ transport: http16(this.rpcUrl) });
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
        const client = createPublicClient16({ transport: http16(this.rpcUrl) });
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
        const client = createPublicClient16({ transport: http16(this.rpcUrl) });
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
        const client = createPublicClient16({ transport: http16(this.rpcUrl) });
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
    GENERIC_LST_ABI = parseAbi222([
      "function stake() external payable returns (uint256)",
      "function unstake(uint256 amount) external returns (uint256)"
    ]);
    GenericLstAdapter = class {
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
        const data = encodeFunctionData20({ abi: GENERIC_LST_ABI, functionName: "stake" });
        return {
          description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
          to: this.staking,
          data,
          value: params.amount,
          gas_estimate: 2e5
        };
      }
      async buildUnstake(params) {
        const data = encodeFunctionData20({
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
    STHYPE_ABI = parseAbi23([
      "function submit(address referral) external payable returns (uint256)",
      "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)"
    ]);
    ERC20_ABI3 = parseAbi23([
      "function totalSupply() external view returns (uint256)"
    ]);
    StHypeAdapter = class {
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
        const data = encodeFunctionData21({
          abi: STHYPE_ABI,
          functionName: "submit",
          args: [zeroAddress9]
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
        const data = encodeFunctionData21({
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
        const client = createPublicClient17({ transport: http17(this.rpcUrl) });
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
          staked_token: zeroAddress9,
          liquid_token: tokenAddr,
          exchange_rate: 1,
          total_staked: totalSupply
        };
      }
    };
    KINETIQ_ABI = parseAbi24([
      "function stake() external payable returns (uint256)",
      "function requestUnstake(uint256 amount) external returns (uint256)",
      "function totalStaked() external view returns (uint256)"
    ]);
    ORACLE_ABI3 = parseAbi24([
      "function getAssetPrice(address asset) external view returns (uint256)"
    ]);
    WHYPE = "0x5555555555555555555555555555555555555555";
    HYPERLEND_ORACLE = "0xc9fb4fbe842d57ea1df3e641a281827493a63030";
    KinetiqAdapter = class {
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
        const data = encodeFunctionData222({ abi: KINETIQ_ABI, functionName: "stake" });
        return {
          description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
          to: this.staking,
          data,
          value: params.amount,
          gas_estimate: 3e5
        };
      }
      async buildUnstake(params) {
        const data = encodeFunctionData222({
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
        const client = createPublicClient18({ transport: http18(this.rpcUrl) });
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
          staked_token: zeroAddress10,
          liquid_token: this.liquidToken,
          exchange_rate: rateF64,
          total_staked: totalStaked
        };
      }
    };
    PendleAdapter = class {
      protocolName;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        if (!entry.contracts?.["router"]) {
          throw DefiError.contractError("Missing 'router' contract");
        }
      }
      name() {
        return this.protocolName;
      }
      async getYields() {
        throw DefiError.unsupported(`[${this.protocolName}] getYields requires RPC`);
      }
      async buildDeposit(_pool, _amount, _recipient) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.`
        );
      }
      async buildWithdraw(_pool, _amount, _recipient) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Pendle withdraw requires market-specific params`
        );
      }
    };
    GenericYieldAdapter = class {
      protocolName;
      interfaceName;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        this.interfaceName = entry.interface;
      }
      name() {
        return this.protocolName;
      }
      async getYields() {
        throw DefiError.unsupported(`[${this.protocolName}] getYields requires RPC`);
      }
      async buildDeposit(_pool, _amount, _recipient) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.`
        );
      }
      async buildWithdraw(_pool, _amount, _recipient) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.`
        );
      }
    };
    HLP_ABI = parseAbi25([
      "function deposit(uint256 amount) external returns (uint256)",
      "function withdraw(uint256 shares) external returns (uint256)"
    ]);
    HlpVaultAdapter = class {
      protocolName;
      vault;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        const vault = entry.contracts?.["vault"];
        if (!vault) throw DefiError.contractError("Missing 'vault' contract");
        this.vault = vault;
      }
      name() {
        return this.protocolName;
      }
      async buildOpenPosition(params) {
        const data = encodeFunctionData23({
          abi: HLP_ABI,
          functionName: "deposit",
          args: [params.collateral]
        });
        return {
          description: `[${this.protocolName}] Deposit ${params.collateral} into HLP vault`,
          to: this.vault,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
      async buildClosePosition(params) {
        const data = encodeFunctionData23({
          abi: HLP_ABI,
          functionName: "withdraw",
          args: [params.size]
        });
        return {
          description: `[${this.protocolName}] Withdraw ${params.size} from HLP vault`,
          to: this.vault,
          data,
          value: 0n,
          gas_estimate: 2e5
        };
      }
    };
    GenericDerivativesAdapter = class {
      protocolName;
      interfaceName;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        this.interfaceName = entry.interface;
      }
      name() {
        return this.protocolName;
      }
      async buildOpenPosition(_params) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
        );
      }
      async buildClosePosition(_params) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
        );
      }
    };
    RYSK_ABI = parseAbi26([
      "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
      "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)"
    ]);
    RyskAdapter = class {
      protocolName;
      controller;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        const controller = entry.contracts?.["controller"];
        if (!controller) throw DefiError.contractError("Missing 'controller' contract");
        this.controller = controller;
      }
      name() {
        return this.protocolName;
      }
      async buildBuy(params) {
        const data = encodeFunctionData24({
          abi: RYSK_ABI,
          functionName: "openOption",
          args: [
            params.underlying,
            params.strike_price,
            BigInt(params.expiry),
            params.is_call,
            params.amount
          ]
        });
        return {
          description: `[${this.protocolName}] Buy ${params.is_call ? "call" : "put"} ${params.amount} option, strike=${params.strike_price}, expiry=${params.expiry}`,
          to: this.controller,
          data,
          value: 0n,
          gas_estimate: 3e5
        };
      }
      async buildSell(params) {
        const data = encodeFunctionData24({
          abi: RYSK_ABI,
          functionName: "closeOption",
          args: [
            params.underlying,
            params.strike_price,
            BigInt(params.expiry),
            params.is_call,
            params.amount
          ]
        });
        return {
          description: `[${this.protocolName}] Sell/close ${params.is_call ? "call" : "put"} ${params.amount} option`,
          to: this.controller,
          data,
          value: 0n,
          gas_estimate: 3e5
        };
      }
    };
    GenericOptionsAdapter = class {
      protocolName;
      interfaceName;
      constructor(entry, _rpcUrl) {
        this.protocolName = entry.name;
        this.interfaceName = entry.interface;
      }
      name() {
        return this.protocolName;
      }
      async buildBuy(_params) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
        );
      }
      async buildSell(_params) {
        throw DefiError.unsupported(
          `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
        );
      }
    };
    ERC721_ABI = parseAbi27([
      "function name() returns (string)",
      "function symbol() returns (string)",
      "function totalSupply() returns (uint256)",
      "function ownerOf(uint256 tokenId) returns (address)",
      "function balanceOf(address owner) returns (uint256)",
      "function tokenURI(uint256 tokenId) returns (string)"
    ]);
    ERC721Adapter = class {
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
        const client = createPublicClient19({ transport: http19(this.rpcUrl) });
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
        const client = createPublicClient19({ transport: http19(this.rpcUrl) });
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
        const client = createPublicClient19({ transport: http19(this.rpcUrl) });
        return client.readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] }).catch((e) => {
          throw DefiError.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
        });
      }
    };
    DexSpotPrice = class {
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
  }
});

// src/mcp-server.ts
init_dist2();
init_dist3();
import "dotenv/config";
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// src/executor.ts
init_dist2();
init_dist2();
import { createPublicClient as createPublicClient20, createWalletClient, http as http20, parseAbi as parseAbi28, encodeFunctionData as encodeFunctionData25 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
var ERC20_ABI4 = parseAbi28([
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
      abi: ERC20_ABI4,
      functionName: "allowance",
      args: [owner, spender]
    });
    if (allowance >= amount) return;
    process.stderr.write(
      `  Approving ${amount} of ${token} for ${spender}...
`
    );
    const approveData = encodeFunctionData25({
      abi: ERC20_ABI4,
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
      const client = createPublicClient20({ transport: http20(rpcUrl) });
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
      const client = createPublicClient20({ transport: http20(rpcUrl) });
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
    }
    return tx.gas_estimate ? BigInt(tx.gas_estimate) : 0n;
  }
  /** Simulate a transaction via eth_call + eth_estimateGas */
  async simulate(tx) {
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL \u2014 cannot simulate. Set HYPEREVM_RPC_URL.");
    }
    const client = createPublicClient20({ transport: http20(rpcUrl) });
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    const from = privateKey ? privateKeyToAccount(privateKey).address : "0x0000000000000000000000000000000000000001";
    if (tx.approvals && tx.approvals.length > 0) {
      const pendingApprovals = [];
      for (const approval of tx.approvals) {
        try {
          const allowance = await client.readContract({
            address: approval.token,
            abi: ERC20_ABI4,
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
    const publicClient = createPublicClient20({ transport: http20(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http20(rpcUrl) });
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
        explorer_url: txUrl,
        mode: "broadcast"
      }
    };
  }
};
function extractRevertReason(err2) {
  for (const marker of ["execution reverted:", "revert:", "Error("]) {
    const pos = err2.indexOf(marker);
    if (pos !== -1) return err2.slice(pos);
  }
  return err2.length > 200 ? err2.slice(0, 200) + "..." : err2;
}

// src/mcp-server.ts
function ok(data, meta) {
  return JSON.stringify({ ok: true, data, meta }, null, 2);
}
function err(error, meta) {
  return JSON.stringify({ ok: false, error, meta }, null, 2);
}
function getRegistry() {
  return Registry.loadEmbedded();
}
function resolveToken(registry, chainName, token) {
  if (token.startsWith("0x")) return token;
  return registry.resolveToken(chainName, token).address;
}
function makeExecutor(broadcast, rpcUrl, explorerUrl) {
  return new Executor(broadcast, rpcUrl, explorerUrl);
}
var _require = createRequire(import.meta.url);
var _pkg = _require("../package.json");
var server = new McpServer(
  { name: "defi-cli", version: _pkg.version },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);
server.tool(
  "defi_status",
  "Show chain and protocol status: lists all protocols deployed on a chain with contract addresses and categories",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm). E.g. hyperevm, ethereum, arbitrum, base")
  },
  async ({ chain }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocols = registry.getProtocolsForChain(chainName);
      const data = {
        chain: chainName,
        chain_id: chainConfig.chain_id,
        rpc_url: chainConfig.effectiveRpcUrl(),
        protocols: protocols.map((p) => ({
          slug: p.slug,
          name: p.name,
          category: p.category,
          interface: p.interface,
          contracts: p.contracts ?? {}
        })),
        summary: {
          total_protocols: protocols.length
        }
      };
      return { content: [{ type: "text", text: ok(data, { chain: chainName }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e)) }], isError: true };
    }
  }
);
server.tool(
  "defi_lending_rates",
  "Get current supply and borrow rates for an asset on a lending protocol (e.g. Aave V3)",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3, felix"),
    asset: z.string().describe("Token symbol (e.g. USDC) or address (0x...)")
  },
  async ({ chain, protocol, asset }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const rates = await adapter.getRates(assetAddr);
      return { content: [{ type: "text", text: ok(rates, { chain: chainName, protocol, asset }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  }
);
server.tool(
  "defi_lending_supply",
  "Supply an asset to a lending protocol. Defaults to dry-run (no broadcast). Set broadcast=true to send transaction (requires DEFI_PRIVATE_KEY env var)",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3"),
    asset: z.string().describe("Token symbol or address"),
    amount: z.string().describe("Amount in wei (as string to avoid precision loss)"),
    on_behalf_of: z.string().optional().describe("Supply on behalf of this address (default: DEFI_WALLET_ADDRESS env var)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast the transaction (default: false = dry run)")
  },
  async ({ chain, protocol, asset, amount, on_behalf_of, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const onBehalfOf = on_behalf_of ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const tx = await adapter.buildSupply({ protocol: protocolConfig.name, asset: assetAddr, amount: BigInt(amount), on_behalf_of: onBehalfOf });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, asset, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  }
);
server.tool(
  "defi_lending_withdraw",
  "Withdraw a supplied asset from a lending protocol. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. aave-v3"),
    asset: z.string().describe("Token symbol or address"),
    amount: z.string().describe("Amount in wei to withdraw"),
    to: z.string().optional().describe("Recipient address (default: DEFI_WALLET_ADDRESS)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)")
  },
  async ({ chain, protocol, asset, amount, to, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLending(protocolConfig, chainConfig.effectiveRpcUrl());
      const assetAddr = resolveToken(registry, chainName, asset);
      const toAddr = to ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const tx = await adapter.buildWithdraw({ protocol: protocolConfig.name, asset: assetAddr, amount: BigInt(amount), to: toAddr });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, asset, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, asset }) }], isError: true };
    }
  }
);
server.tool(
  "defi_dex_quote",
  "Get a DEX swap quote without executing. Returns expected output amount and price impact",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3, algebra-v3"),
    token_in: z.string().describe("Input token symbol or address"),
    token_out: z.string().describe("Output token symbol or address"),
    amount_in: z.string().describe("Amount of input token in wei")
  },
  async ({ chain, protocol, token_in, token_out, amount_in }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenIn = resolveToken(registry, chainName, token_in);
      const tokenOut = resolveToken(registry, chainName, token_out);
      const result = await adapter.quote({ protocol: protocolConfig.name, token_in: tokenIn, token_out: tokenOut, amount_in: BigInt(amount_in) });
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_in, token_out }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, token_in, token_out }) }], isError: true };
    }
  }
);
server.tool(
  "defi_dex_swap",
  "Execute a token swap on a DEX. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_in: z.string().describe("Input token symbol or address"),
    token_out: z.string().describe("Output token symbol or address"),
    amount_in: z.string().describe("Amount of input token in wei"),
    slippage_bps: z.number().optional().describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    recipient: z.string().optional().describe("Recipient address (default: DEFI_WALLET_ADDRESS)"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)")
  },
  async ({ chain, protocol, token_in, token_out, amount_in, slippage_bps, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenIn = resolveToken(registry, chainName, token_in);
      const tokenOut = resolveToken(registry, chainName, token_out);
      const recipientAddr = recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const tx = await adapter.buildSwap({
        protocol: protocolConfig.name,
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: BigInt(amount_in),
        slippage: { bps: slippage_bps ?? 50 },
        recipient: recipientAddr
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_in, token_out, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol, token_in, token_out }) }], isError: true };
    }
  }
);
server.tool(
  "defi_dex_lp_add",
  "Add liquidity to a DEX pool. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_a: z.string().describe("First token symbol or address"),
    token_b: z.string().describe("Second token symbol or address"),
    amount_a: z.string().describe("Amount of token A in wei"),
    amount_b: z.string().describe("Amount of token B in wei"),
    recipient: z.string().optional().describe("Recipient address for LP tokens"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)")
  },
  async ({ chain, protocol, token_a, token_b, amount_a, amount_b, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenA = resolveToken(registry, chainName, token_a);
      const tokenB = resolveToken(registry, chainName, token_b);
      const recipientAddr = recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const tx = await adapter.buildAddLiquidity({
        protocol: protocolConfig.name,
        token_a: tokenA,
        token_b: tokenB,
        amount_a: BigInt(amount_a),
        amount_b: BigInt(amount_b),
        recipient: recipientAddr
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_a, token_b, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  }
);
server.tool(
  "defi_dex_lp_remove",
  "Remove liquidity from a DEX pool. Defaults to dry-run. Set broadcast=true to send transaction",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug, e.g. uniswap-v3"),
    token_a: z.string().describe("First token symbol or address"),
    token_b: z.string().describe("Second token symbol or address"),
    liquidity: z.string().describe("Liquidity amount to remove in wei"),
    recipient: z.string().optional().describe("Recipient address for returned tokens"),
    broadcast: z.boolean().optional().describe("Set true to broadcast (default: false)")
  },
  async ({ chain, protocol, token_a, token_b, liquidity, recipient, broadcast }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createDex(protocolConfig, chainConfig.effectiveRpcUrl());
      const tokenA = resolveToken(registry, chainName, token_a);
      const tokenB = resolveToken(registry, chainName, token_b);
      const recipientAddr = recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const tx = await adapter.buildRemoveLiquidity({
        protocol: protocolConfig.name,
        token_a: tokenA,
        token_b: tokenB,
        liquidity: BigInt(liquidity),
        recipient: recipientAddr
      });
      const executor = makeExecutor(broadcast ?? false, chainConfig.effectiveRpcUrl(), chainConfig.explorer_url);
      const result = await executor.execute(tx);
      return { content: [{ type: "text", text: ok(result, { chain: chainName, protocol, token_a, token_b, broadcast: broadcast ?? false }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  }
);
server.tool(
  "defi_bridge",
  "Get a cross-chain bridge quote via LI.FI, deBridge DLN, or Circle CCTP. Returns estimated output amount and fees",
  {
    from_chain: z.string().describe("Source chain name, e.g. ethereum, arbitrum, base"),
    to_chain: z.string().describe("Destination chain name, e.g. hyperevm, arbitrum"),
    token: z.string().optional().describe("Token symbol to bridge (default: USDC). Use native for native token"),
    amount: z.string().describe("Amount in human-readable units, e.g. '100' for 100 USDC"),
    recipient: z.string().optional().describe("Recipient address on destination chain")
  },
  async ({ from_chain, to_chain, token, amount, recipient }) => {
    try {
      const tokenSymbol = token ?? "USDC";
      const recipientAddr = recipient ?? process.env["DEFI_WALLET_ADDRESS"] ?? "0x0000000000000000000000000000000000000001";
      const LIFI_API = "https://li.quest/v1";
      const registry = getRegistry();
      let fromChainId;
      let toChainId;
      try {
        fromChainId = registry.getChain(from_chain).chain_id;
      } catch {
      }
      try {
        toChainId = registry.getChain(to_chain).chain_id;
      } catch {
      }
      const params = new URLSearchParams({
        fromChain: fromChainId ? String(fromChainId) : from_chain,
        toChain: toChainId ? String(toChainId) : to_chain,
        fromToken: tokenSymbol,
        toToken: tokenSymbol,
        fromAmount: String(Math.round(parseFloat(amount) * 1e6)),
        // USDC decimals
        toAddress: recipientAddr
      });
      const res = await fetch(`${LIFI_API}/quote?${params}`, {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LI.FI quote failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const estimate = data.estimate;
      const quote = {
        from_chain,
        to_chain,
        token: tokenSymbol,
        amount_in: amount,
        amount_out: estimate?.toAmount ? String(Number(estimate.toAmount) / 1e6) : "unknown",
        fee_costs: estimate?.feeCosts ?? [],
        gas_costs: estimate?.gasCosts ?? [],
        execution_duration_seconds: estimate?.executionDuration ?? "unknown",
        tool: data.tool ?? "unknown",
        raw: data
      };
      return { content: [{ type: "text", text: ok(quote, { from_chain, to_chain, token: tokenSymbol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { from_chain, to_chain }) }], isError: true };
    }
  }
);
server.tool(
  "defi_vault_info",
  "Get vault information: TVL, APY, total shares, and underlying asset details",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug for the vault")
  },
  async ({ chain, protocol }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createVault(protocolConfig, chainConfig.effectiveRpcUrl());
      const info = await adapter.getVaultInfo();
      return { content: [{ type: "text", text: ok(info, { chain: chainName, protocol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  }
);
server.tool(
  "defi_staking_info",
  "Get liquid staking protocol info: exchange rate, APY, total staked",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    protocol: z.string().describe("Protocol slug for the staking protocol")
  },
  async ({ chain, protocol }) => {
    try {
      const chainName = chain ?? "hyperevm";
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const protocolConfig = registry.getProtocol(protocol);
      const adapter = createLiquidStaking(protocolConfig, chainConfig.effectiveRpcUrl());
      const info = await adapter.getInfo();
      return { content: [{ type: "text", text: ok(info, { chain: chainName, protocol }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { protocol }) }], isError: true };
    }
  }
);
server.tool(
  "defi_price",
  "Query asset price from on-chain oracles (Aave V3) and/or DEX spot prices",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    asset: z.string().describe("Token symbol (e.g. WBTC) or address (0x...)"),
    source: z.enum(["oracle", "dex", "all"]).optional().describe("Price source: oracle, dex, or all (default: all)")
  },
  async ({ chain, asset, source }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const srcMode = source ?? "all";
      let assetAddr;
      let assetSymbol;
      try {
        if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
          assetAddr = asset;
          assetSymbol = asset;
        } else {
          const token = registry.resolveToken(chainName, asset);
          assetAddr = token.address;
          assetSymbol = token.symbol;
        }
      } catch (e) {
        return { content: [{ type: "text", text: err(`Could not resolve asset: ${asset}`) }], isError: true };
      }
      const { ProtocolCategory: ProtocolCategory2 } = await Promise.resolve().then(() => (init_dist2(), dist_exports));
      const { createOracleFromLending: createOracleFromLending2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
      const prices = [];
      if (srcMode === "all" || srcMode === "oracle") {
        const lendingProtos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Lending);
        await Promise.all(lendingProtos.map(async (p) => {
          try {
            const oracle = createOracleFromLending2(p, rpcUrl);
            const price = await oracle.getPrice(assetAddr);
            if (price.price_f64 > 0) prices.push({ source: p.slug, source_type: "oracle", price: price.price_f64 });
          } catch {
          }
        }));
      }
      if (srcMode === "all" || srcMode === "dex") {
        const { DexSpotPrice: DexSpotPrice2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
        const USDC_SYMBOL = "USDC";
        let usdcAddr;
        let usdcDecimals = 6;
        try {
          const usdcToken = registry.resolveToken(chainName, USDC_SYMBOL);
          usdcAddr = usdcToken.address;
          usdcDecimals = usdcToken.decimals;
        } catch {
        }
        let assetDecimals = 18;
        if (!/^0x[0-9a-fA-F]{40}$/.test(asset)) {
          try {
            assetDecimals = registry.resolveToken(chainName, asset).decimals;
          } catch {
          }
        }
        if (usdcAddr && assetAddr.toLowerCase() !== usdcAddr.toLowerCase()) {
          const dexProtos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Dex);
          await Promise.all(dexProtos.map(async (p) => {
            try {
              const dex = createDex(p, rpcUrl);
              const priceData = await DexSpotPrice2.getPrice(dex, assetAddr, assetDecimals, usdcAddr, usdcDecimals);
              if (priceData.price_f64 > 0) prices.push({ source: p.slug, source_type: "dex", price: priceData.price_f64 });
            } catch {
            }
          }));
        }
      }
      if (prices.length === 0) {
        return { content: [{ type: "text", text: err(`No price data found for ${assetSymbol} on ${chainName}`) }], isError: true };
      }
      const priceValues = prices.map((p) => p.price);
      const avg = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
      const min = Math.min(...priceValues);
      const max = Math.max(...priceValues);
      const spread = max > 0 ? (max - min) / max * 100 : 0;
      const report = {
        asset: assetSymbol,
        asset_address: assetAddr,
        prices,
        average_price: Math.round(avg * 100) / 100,
        max_spread_pct: Math.round(spread * 100) / 100
      };
      return { content: [{ type: "text", text: ok(report, { chain: chainName, asset: assetSymbol, source: srcMode }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { asset }) }], isError: true };
    }
  }
);
server.tool(
  "defi_scan",
  "Scan for potential price manipulation or exploit opportunities by comparing oracle prices vs DEX spot prices across lending protocols",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    min_spread_pct: z.number().optional().describe("Minimum oracle-vs-dex spread % to flag (default: 5)")
  },
  async ({ chain, min_spread_pct }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();
      const minSpread = min_spread_pct ?? 5;
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const { ProtocolCategory: ProtocolCategory2 } = await Promise.resolve().then(() => (init_dist2(), dist_exports));
      const { createOracleFromLending: createOracleFromLending2, DexSpotPrice: DexSpotPrice2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
      const tokens = registry.tokens.get(chainName) ?? [];
      const lendingProtos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Lending);
      const dexProtos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Dex);
      let usdcAddr;
      try {
        usdcAddr = registry.resolveToken(chainName, "USDC").address;
      } catch {
      }
      const findings = [];
      for (const token of tokens.slice(0, 20)) {
        const addr = token.address;
        if (!usdcAddr || addr.toLowerCase() === usdcAddr.toLowerCase()) continue;
        let oraclePrice = 0;
        let dexPrice = 0;
        for (const p of lendingProtos) {
          try {
            const oracle = createOracleFromLending2(p, rpcUrl);
            const priceData = await oracle.getPrice(addr);
            if (priceData.price_f64 > 0) {
              oraclePrice = priceData.price_f64;
              break;
            }
          } catch {
          }
        }
        for (const p of dexProtos) {
          try {
            const dex = createDex(p, rpcUrl);
            const priceData = await DexSpotPrice2.getPrice(dex, addr, token.decimals, usdcAddr, 6);
            if (priceData.price_f64 > 0) {
              dexPrice = priceData.price_f64;
              break;
            }
          } catch {
          }
        }
        if (oraclePrice > 0 && dexPrice > 0) {
          const spread = Math.abs(oraclePrice - dexPrice) / Math.max(oraclePrice, dexPrice) * 100;
          if (spread >= minSpread) {
            findings.push({
              token: token.symbol,
              address: addr,
              oracle_price: Math.round(oraclePrice * 1e4) / 1e4,
              dex_price: Math.round(dexPrice * 1e4) / 1e4,
              spread_pct: Math.round(spread * 100) / 100,
              verdict: spread >= 20 ? "HIGH_RISK" : spread >= 10 ? "MEDIUM_RISK" : "LOW_RISK"
            });
          }
        }
      }
      findings.sort((a, b) => b.spread_pct - a.spread_pct);
      return {
        content: [{
          type: "text",
          text: ok(
            { chain: chainName, findings, scanned_tokens: Math.min(tokens.length, 20), min_spread_pct: minSpread },
            { finding_count: findings.length }
          )
        }]
      };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e)) }], isError: true };
    }
  }
);
server.tool(
  "defi_portfolio",
  "Get a portfolio overview for a wallet address: lending positions, token balances, and health factors across all protocols on a chain",
  {
    chain: z.string().optional().describe("Chain name (default: hyperevm)"),
    address: z.string().describe("Wallet address to query (0x...)")
  },
  async ({ chain, address }) => {
    try {
      const chainName = (chain ?? "hyperevm").toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return { content: [{ type: "text", text: err(`Invalid address: ${address}`) }], isError: true };
      }
      const registry = getRegistry();
      const chainConfig = registry.getChain(chainName);
      const rpcUrl = chainConfig.effectiveRpcUrl();
      const user = address;
      const { ProtocolCategory: ProtocolCategory2, multicallRead: multicallRead2 } = await Promise.resolve().then(() => (init_dist2(), dist_exports));
      const { createLending: _createLending } = await Promise.resolve().then(() => (init_dist3(), dist_exports2));
      const { encodeFunctionData: encodeFunctionData26, parseAbi: parseAbi29 } = await import("viem");
      const POOL_ABI3 = parseAbi29([
        "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
      ]);
      const lendingProtos = registry.getProtocolsForChain(chainName).filter((p) => p.category === ProtocolCategory2.Lending);
      const lendingPositions = [];
      for (const p of lendingProtos) {
        const poolAddr = p.contracts?.pool;
        if (!poolAddr) continue;
        try {
          const callData = encodeFunctionData26({ abi: POOL_ABI3, functionName: "getUserAccountData", args: [user] });
          const results = await multicallRead2(rpcUrl, [[poolAddr, callData]]);
          const raw = results[0];
          if (!raw || raw.length < 2 + 6 * 64) continue;
          const hex = raw.slice(2);
          const decodeU2562 = (offset) => BigInt("0x" + hex.slice(offset * 64, offset * 64 + 64));
          const totalCollateral = Number(decodeU2562(0)) / 1e8;
          const totalDebt = Number(decodeU2562(1)) / 1e8;
          const availableBorrows = Number(decodeU2562(2)) / 1e8;
          const ltv = Number(decodeU2562(4)) / 100;
          const hfRaw = decodeU2562(5);
          const healthFactor = hfRaw >= BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") / 2n ? 999999 : Math.round(Number(hfRaw) / 1e16) / 100;
          if (totalCollateral > 0 || totalDebt > 0) {
            lendingPositions.push({
              protocol: p.slug,
              total_collateral_usd: Math.round(totalCollateral * 100) / 100,
              total_debt_usd: Math.round(totalDebt * 100) / 100,
              available_borrows_usd: Math.round(availableBorrows * 100) / 100,
              health_factor: healthFactor,
              ltv
            });
          }
        } catch {
        }
      }
      const totalCollateralUsd = lendingPositions.reduce((s, p) => s + p.total_collateral_usd, 0);
      const totalDebtUsd = lendingPositions.reduce((s, p) => s + p.total_debt_usd, 0);
      const portfolio = {
        address,
        chain: chainName,
        lending_positions: lendingPositions,
        summary: {
          total_collateral_usd: Math.round(totalCollateralUsd * 100) / 100,
          total_debt_usd: Math.round(totalDebtUsd * 100) / 100,
          net_position_usd: Math.round((totalCollateralUsd - totalDebtUsd) * 100) / 100,
          active_protocols: lendingPositions.length
        }
      };
      return { content: [{ type: "text", text: ok(portfolio, { chain: chainName, address }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: err(e instanceof Error ? e.message : String(e), { address }) }], isError: true };
    }
  }
);
var transport = new StdioServerTransport();
await server.connect(transport);
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
//# sourceMappingURL=mcp-server.js.map