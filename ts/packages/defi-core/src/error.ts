import type { Address } from "viem";

export type DefiErrorCode =
  | "PROTOCOL_NOT_FOUND"
  | "TOKEN_NOT_FOUND"
  | "CHAIN_NOT_FOUND"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ALLOWANCE"
  | "SLIPPAGE_EXCEEDED"
  | "SIMULATION_FAILED"
  | "ABI_ERROR"
  | "REGISTRY_ERROR"
  | "RPC_ERROR"
  | "PROVIDER_ERROR"
  | "CONTRACT_ERROR"
  | "INVALID_PARAM"
  | "UNSUPPORTED"
  | "INTERNAL";

export class DefiError extends Error {
  readonly code: DefiErrorCode;

  constructor(code: DefiErrorCode, message: string) {
    super(message);
    this.name = "DefiError";
    this.code = code;
  }

  static protocolNotFound(name: string): DefiError {
    return new DefiError("PROTOCOL_NOT_FOUND", `Protocol not found: ${name}`);
  }

  static tokenNotFound(name: string): DefiError {
    return new DefiError("TOKEN_NOT_FOUND", `Token not found: ${name}`);
  }

  static chainNotFound(name: string): DefiError {
    return new DefiError("CHAIN_NOT_FOUND", `Chain not found: ${name}`);
  }

  static insufficientBalance(needed: string, available: string): DefiError {
    return new DefiError(
      "INSUFFICIENT_BALANCE",
      `Insufficient balance: need ${needed}, have ${available}`,
    );
  }

  static insufficientAllowance(spender: Address): DefiError {
    return new DefiError(
      "INSUFFICIENT_ALLOWANCE",
      `Insufficient allowance for spender ${spender}`,
    );
  }

  static slippageExceeded(expected: string, actual: string): DefiError {
    return new DefiError(
      "SLIPPAGE_EXCEEDED",
      `Slippage exceeded: expected ${expected}, got ${actual}`,
    );
  }

  static simulationFailed(reason: string): DefiError {
    return new DefiError(
      "SIMULATION_FAILED",
      `Transaction simulation failed: ${reason}`,
    );
  }

  static abiError(reason: string): DefiError {
    return new DefiError("ABI_ERROR", `ABI encoding error: ${reason}`);
  }

  static registryError(reason: string): DefiError {
    return new DefiError("REGISTRY_ERROR", `Registry error: ${reason}`);
  }

  static rpcError(reason: string): DefiError {
    return new DefiError("RPC_ERROR", `RPC error: ${reason}`);
  }

  static providerError(reason: string): DefiError {
    return new DefiError("PROVIDER_ERROR", `Provider error: ${reason}`);
  }

  static contractError(reason: string): DefiError {
    return new DefiError("CONTRACT_ERROR", `Contract error: ${reason}`);
  }

  static invalidParam(reason: string): DefiError {
    return new DefiError("INVALID_PARAM", `Invalid parameter: ${reason}`);
  }

  static unsupported(operation: string): DefiError {
    return new DefiError(
      "UNSUPPORTED",
      `Unsupported operation: ${operation}`,
    );
  }

  static internal(reason: string): DefiError {
    return new DefiError("INTERNAL", `Internal error: ${reason}`);
  }

  toJSON() {
    return { error: this.message };
  }
}

export type Result<T> = T;
