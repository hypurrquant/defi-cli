import { encodeFunctionData, parseAbi, createPublicClient, http, zeroAddress } from "viem";
import type { Address } from "viem";
import { rangeToTicks, alignTickUp, alignTickDown } from "./tick_math.js";

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

// Thena V3 CL NonfungiblePositionManager (includes tickSpacing + sqrtPriceX96 in MintParams)
const thenaPmAbi = parseAbi([
  "struct MintParams { address token0; address token1; int24 tickSpacing; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; uint160 sqrtPriceX96; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const thenaRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; int24 tickSpacing; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)",
]);

const thenaPoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function tickSpacing() view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const thenaFactoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)",
]);

export class ThenaCLAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: Address;
  private readonly positionManager: Address | undefined;
  private readonly factory: Address | undefined;
  private readonly rpcUrl: string | undefined;
  private readonly defaultTickSpacing: number;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    this.router = router;
    this.positionManager = entry.contracts?.["position_manager"];
    this.factory = entry.contracts?.["pool_factory"];
    this.rpcUrl = rpcUrl;
    this.defaultTickSpacing = 50;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
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
        sqrtPriceLimitX96: 0n,
      }],
    });
    return {
      description: `[${this.protocolName}] Swap`,
      to: this.router, data, value: 0n, gas_estimate: 300_000,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }],
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote not yet implemented — use swap router`);
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    const pm = this.positionManager;
    if (!pm) throw new DefiError("CONTRACT_ERROR", "Position manager not configured");
    if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required");

    // Sort tokens
    const [token0, token1, rawAmount0, rawAmount1] =
      params.token_a.toLowerCase() < params.token_b.toLowerCase()
        ? [params.token_a, params.token_b, params.amount_a, params.amount_b]
        : [params.token_b, params.token_a, params.amount_b, params.amount_a];

    // Resolve pool and tick range
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const poolAddr = params.pool as Address | undefined;
    let tickSpacing = this.defaultTickSpacing;
    let tickLower = params.tick_lower ?? 0;
    let tickUpper = params.tick_upper ?? 0;

    // If pool provided or we need to auto-detect ticks
    if (poolAddr || !params.tick_lower || !params.tick_upper) {
      let pool = poolAddr;
      if (!pool && this.factory) {
        pool = await client.readContract({
          address: this.factory, abi: thenaFactoryAbi, functionName: "getPool",
          args: [token0, token1, tickSpacing],
        }) as Address;
        if (pool === zeroAddress) throw new DefiError("CONTRACT_ERROR", "Pool not found");
      }
      if (pool) {
        const [slot0, ts] = await Promise.all([
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "slot0" }),
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "tickSpacing" }),
        ]);
        const currentTick = Number((slot0 as readonly [bigint, number, ...unknown[]])[1]);
        tickSpacing = Number(ts);

        if (params.range_pct !== undefined) {
          // ±N% concentrated range
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

    // Apply explicit tick params (override auto-detected)
    if (params.tick_lower !== undefined) tickLower = params.tick_lower;
    if (params.tick_upper !== undefined) tickUpper = params.tick_upper;

    const data = encodeFunctionData({
      abi: thenaPmAbi,
      functionName: "mint",
      args: [{
        token0, token1,
        tickSpacing,
        tickLower, tickUpper,
        amount0Desired: rawAmount0,
        amount1Desired: rawAmount1,
        amount0Min: 0n, amount1Min: 0n,
        recipient: params.recipient,
        deadline: BigInt("18446744073709551615"),
        sqrtPriceX96: 0n,
      }],
    });

    const approvals: { token: Address; spender: Address; amount: bigint }[] = [];
    if (rawAmount0 > 0n) approvals.push({ token: token0, spender: pm, amount: rawAmount0 });
    if (rawAmount1 > 0n) approvals.push({ token: token1, spender: pm, amount: rawAmount1 });

    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm, data, value: 0n, gas_estimate: 700_000, approvals,
    };
  }

  async buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(`[${this.protocolName}] remove_liquidity requires tokenId`);
  }
}
