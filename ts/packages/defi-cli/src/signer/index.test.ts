// Unit tests for signer/index.ts — the public barrel for OWS signer entry
// points. Verifies the re-exports stay wired so consumers importing from
// "@hypurrquant/defi-cli/signer" (via `OwsEvmSigner` / `loadOws`) don't break
// silently when one of the source modules is renamed.
import { describe, expect, it } from "vitest";

import { OwsEvmSigner, loadOws } from "./index.js";

describe("signer barrel re-exports", () => {
  it("OwsEvmSigner is exported as a class (function constructor)", () => {
    expect(typeof OwsEvmSigner).toBe("function");
    expect(OwsEvmSigner.name).toBe("OwsEvmSigner");
  });

  it("loadOws is exported as a function", () => {
    expect(typeof loadOws).toBe("function");
  });
});
