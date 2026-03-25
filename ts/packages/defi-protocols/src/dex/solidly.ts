import { encodeFunctionData, parseAbi, decodeAbiParameters } from "viem";
import type { Address } from "viem";

import { DefiError, multicallRead } from "@hypurrquant/defi-core";
import type {
  IDex,
  ProtocolEntry,
  SwapParams,
  QuoteParams,
  QuoteResult,
  AddLiquidityParams,
  RemoveLiquidityParams,
  DeFiTx,
} from "@hypurrquant/defi-core";

const abi = parseAbi([
  "struct Route { address from; address to; bool stable; }",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] calldata routes) external view returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
]);

// Velodrome V2 / Aerodrome style: Route includes factory address
const abiV2 = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] calldata routes) external view returns (uint256[] memory amounts)",
]);

export class SolidlyAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: `0x${string}`;
  /** Default to volatile (false). True for stablecoin pairs. */
  private readonly defaultStable: boolean;
  private readonly rpcUrl: string | undefined;
  /** Factory address — present on Velodrome V2 / Aerodrome forks */
  private readonly factory: Address | undefined;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
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

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);

    const routes = [
      { from: params.token_in, to: params.token_out, stable: this.defaultStable },
    ];

    const data = encodeFunctionData({
      abi,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, routes, params.recipient, deadline],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via Solidly`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 200_000,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }],
    };
  }

  private encodeV1(params: QuoteParams, stable: boolean): `0x${string}` {
    return encodeFunctionData({
      abi,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable }]],
    });
  }

  private encodeV2(params: QuoteParams, stable: boolean): `0x${string}` {
    return encodeFunctionData({
      abi: abiV2,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable, factory: this.factory! }]],
    });
  }

  async quote(params: QuoteParams): Promise<QuoteResult> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");

    // Build all route variant candidates in one multicall batch.
    // Order: V2 variants first (if factory present), then V1 volatile + stable.
    const candidates: Array<{ callData: `0x${string}`; stable: boolean }> = [
      { callData: this.encodeV1(params, false), stable: false },
      { callData: this.encodeV1(params, true), stable: true },
    ];
    if (this.factory) {
      candidates.unshift(
        { callData: this.encodeV2(params, false), stable: false },
        { callData: this.encodeV2(params, true), stable: true },
      );
    }

    const rawResults = await multicallRead(
      this.rpcUrl,
      candidates.map((c) => [this.router, c.callData]),
    );

    let bestOut = 0n;
    let bestStable = false;
    for (let i = 0; i < rawResults.length; i++) {
      const raw = rawResults[i];
      if (!raw) continue;
      try {
        const [amounts] = decodeAbiParameters(
          [{ name: "amounts", type: "uint256[]" }],
          raw,
        );
        const out = amounts.length >= 2 ? amounts[amounts.length - 1] : 0n;
        if (out > bestOut) {
          bestOut = out;
          bestStable = candidates[i].stable;
        }
      } catch {
        // Route failed — skip
      }
    }

    if (bestOut === 0n) {
      throw DefiError.rpcError(`[${this.protocolName}] getAmountsOut returned zero for all routes`);
    }

    return {
      protocol: this.protocolName,
      amount_out: bestOut,
      price_impact_bps: undefined,
      fee_bps: bestStable ? 4 : 20,
      route: [`${params.token_in} -> ${params.token_out} (stable: ${bestStable})`],
    };
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi,
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
        BigInt("18446744073709551615"),
      ],
    });

    return {
      description: `[${this.protocolName}] Add liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 350_000,
      approvals: [
        { token: params.token_a, spender: this.router, amount: params.amount_a },
        { token: params.token_b, spender: this.router, amount: params.amount_b },
      ],
    };
  }

  async buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
      abi,
      functionName: "removeLiquidity",
      args: [
        params.token_a,
        params.token_b,
        this.defaultStable,
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615"),
      ],
    });

    return {
      description: `[${this.protocolName}] Remove liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }
}
