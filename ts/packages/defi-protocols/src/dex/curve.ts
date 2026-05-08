import { encodeFunctionData, parseAbi } from "viem";

import { DefiError } from "@hypurrquant/defi-core";
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

// Curve StableswapNG (the factory deployment shipped on HyperEVM and other
// 2024+ chains) uses *dynamic* `uint256[]` for amounts/min_amounts. The
// older fixed-N `uint256[2]` ABI selector (0x0b4c7e4d) is NOT routable on
// these pools and reverts at the dispatcher with no error string. Verified
// live 2026-05-08 against HyperEVM USDC/USDT0 pool 0x703b14a4…0e9f:
//   - 0x0b4c7e4d add_liquidity(uint256[2],uint256)         → revert
//   - 0xb72df5de add_liquidity(uint256[],uint256)          → success
const poolAbi = parseAbi([
  "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function add_liquidity(uint256[] amounts, uint256 min_mint_amount) external returns (uint256)",
  "function remove_liquidity(uint256 amount, uint256[] min_amounts) external returns (uint256[])",
]);

export class CurveStableSwapAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: `0x${string}`;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    // Direct pool exchange: swap token at index 0 for token at index 1.
    // The `router` address is treated as the pool address for direct swaps.
    // Callers should set the pool address as the "router" contract in the registry
    // when targeting a specific Curve pool.
    // Without prior quote, set min output to 0. Use quote() first for slippage protection.
    const minDy = 0n;

    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "exchange",
      args: [0n, 1n, params.amount_in, minDy],
    });

    return {
      description: `[${this.protocolName}] Curve pool exchange ${params.amount_in} tokens (index 0 -> 1)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 300_000,
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC connection`);
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    // Curve add_liquidity is a per-pool function — the StableswapNG router
    // does NOT proxy it. Pre-PR the adapter was sending add_liquidity calldata
    // to `this.router`, which silently reverted. Caller MUST pass `--pool` to
    // identify which Curve pool to deposit into.
    if (!params.pool) {
      throw DefiError.invalidParam(
        `[${this.protocolName}] Curve add_liquidity needs --pool <address>. ` +
          `The router does not proxy this call; it lives on the pool itself.`,
      );
    }
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "add_liquidity",
      args: [[params.amount_a, params.amount_b], 0n],
    });

    // The pool (not the router) pulls tokens via transferFrom on add. Skip
    // zero-amount approvals so a single-sided deposit (one leg = 0) doesn't
    // emit a useless approve(0).
    const approvals: NonNullable<DeFiTx["approvals"]> = [];
    if (params.amount_a > 0n) approvals.push({ token: params.token_a, spender: params.pool, amount: params.amount_a });
    if (params.amount_b > 0n) approvals.push({ token: params.token_b, spender: params.pool, amount: params.amount_b });

    return {
      description: `[${this.protocolName}] Curve add liquidity to ${params.pool}`,
      to: params.pool,
      data,
      value: 0n,
      gas_estimate: 400_000,
      approvals,
    };
  }

  async buildRemoveLiquidity(params: RemoveLiquidityParams): Promise<DeFiTx> {
    // Like add, remove_liquidity is per-pool. Curve pools mint their own LP
    // token (the pool is the LP token), so the pool burns from msg.sender's
    // balance directly — no transferFrom and therefore no LP approval needed.
    if (!params.pool) {
      throw DefiError.invalidParam(
        `[${this.protocolName}] Curve remove_liquidity needs --pool <address>. ` +
          `The router does not proxy this call.`,
      );
    }
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "remove_liquidity",
      args: [params.liquidity, [0n, 0n]],
    });

    return {
      description: `[${this.protocolName}] Curve remove liquidity from ${params.pool}`,
      to: params.pool,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }
}
