import { describe, it, expect } from "vitest";
import { DefiError } from "./error.js";

describe("DefiError", () => {
  it("creates error with code and message", () => {
    const err = DefiError.protocolNotFound("Aave");
    expect(err.code).toBe("PROTOCOL_NOT_FOUND");
    expect(err.message).toBe("Protocol not found: Aave");
    expect(err.name).toBe("DefiError");
  });

  it("serializes to JSON matching Rust format", () => {
    const err = DefiError.rpcError("connection refused");
    expect(err.toJSON()).toEqual({ error: "RPC error: connection refused" });
  });

  it("has all 15 error factory methods", () => {
    const factories = [
      DefiError.protocolNotFound("x"),
      DefiError.tokenNotFound("x"),
      DefiError.chainNotFound("x"),
      DefiError.insufficientBalance("1", "0"),
      DefiError.insufficientAllowance("0x0000000000000000000000000000000000000001"),
      DefiError.slippageExceeded("100", "50"),
      DefiError.simulationFailed("revert"),
      DefiError.abiError("decode"),
      DefiError.registryError("missing"),
      DefiError.rpcError("timeout"),
      DefiError.providerError("no rpc"),
      DefiError.contractError("call failed"),
      DefiError.invalidParam("negative amount"),
      DefiError.unsupported("flash loans"),
      DefiError.internal("panic"),
    ];
    expect(factories).toHaveLength(15);
    for (const err of factories) {
      expect(err).toBeInstanceOf(DefiError);
      expect(err.code).toBeTruthy();
    }
  });
});
