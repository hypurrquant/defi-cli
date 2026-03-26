import { encodeFunctionData, parseAbi, createPublicClient, http, decodeAbiParameters, concatHex, zeroAddress } from "viem";
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

const abi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 limitSqrtPrice; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)",
]);

// Algebra Integral quoter: path = tokenIn(20) + deployer(20) + tokenOut(20) per hop
// Returns arrays for multi-hop results
const algebraQuoterAbi = parseAbi([
  "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256[] memory amountOutList, uint256[] memory amountInList, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate, uint16[] memory feeList)",
]);

// Algebra V2 / NEST-style quoter: single-hop struct
// selector: 0x5e5e6e0f  quoteExactInputSingle((address,address,uint256,uint160))
// returns: (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After)
const algebraSingleQuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) params) external returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After)",
]);

// Algebra Integral NonfungiblePositionManager (includes deployer field for pool identification)
const algebraIntegralPmAbi = parseAbi([
  "struct MintParams { address token0; address token1; address deployer; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

// Algebra V2 / NEST-style NonfungiblePositionManager (no deployer field)
const algebraV2PmAbi = parseAbi([
  "struct MintParams { address token0; address token1; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

export class AlgebraV3Adapter implements IDex {
  private readonly protocolName: string;
  private readonly router: Address;
  private readonly quoter: Address | undefined;
  private readonly positionManager: Address | undefined;
  private readonly rpcUrl: string | undefined;
  // NEST and similar forks expose quoteExactInputSingle((address,address,uint256,uint160))
  // instead of path-based quoteExactInput. Detected by presence of pool_deployer in config.
  private readonly useSingleQuoter: boolean;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.quoter = entry.contracts?.["quoter"];
    this.positionManager = entry.contracts?.["position_manager"];
    this.rpcUrl = rpcUrl;
    // pool_deployer present → NEST-style single-hop struct quoter
    this.useSingleQuoter = entry.contracts?.["pool_deployer"] !== undefined;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const amountOutMinimum = 0n;

    const data = encodeFunctionData({
      abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.token_in,
          tokenOut: params.token_out,
          recipient: params.recipient,
          deadline,
          amountIn: params.amount_in,
          amountOutMinimum,
          limitSqrtPrice: 0n,
        },
      ],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 250_000,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }],
    };
  }

  async quote(params: QuoteParams): Promise<QuoteResult> {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (!this.quoter) {
      throw DefiError.unsupported(
        `[${this.protocolName}] No quoter contract configured`,
      );
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // NEST and similar forks: use single-hop struct quoter
    if (this.useSingleQuoter) {
      const result = await client.call({
        to: this.quoter,
        data: encodeFunctionData({
          abi: algebraSingleQuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: params.token_in,
              tokenOut: params.token_out,
              amountIn: params.amount_in,
              limitSqrtPrice: 0n,
            },
          ],
        }),
      }).catch((e: unknown) => {
        throw DefiError.rpcError(`[${this.protocolName}] quoteExactInputSingle failed: ${e}`);
      });

      if (!result.data || result.data.length < 66) {
        throw DefiError.rpcError(`[${this.protocolName}] quoter returned empty data`);
      }

      const [amountOut] = decodeAbiParameters(
        [
          { name: "amountOut", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "sqrtPriceX96After", type: "uint160" },
        ],
        result.data,
      );

      return {
        protocol: this.protocolName,
        amount_out: amountOut as bigint,
        price_impact_bps: undefined,
        fee_bps: undefined,
        route: [`${params.token_in} -> ${params.token_out}`],
      };
    }

    // KittenSwap and standard Algebra Integral path: tokenIn(20) + deployer(20) + tokenOut(20) = 60 bytes
    // Standard pools use deployer=address(0) in path (CREATE2 salt without deployer prefix)
    const path = concatHex([params.token_in, zeroAddress as Address, params.token_out]);

    const result = await client.call({
      to: this.quoter,
      data: encodeFunctionData({
        abi: algebraQuoterAbi,
        functionName: "quoteExactInput",
        args: [path, params.amount_in],
      }),
    }).catch((e: unknown) => {
      throw DefiError.rpcError(`[${this.protocolName}] quoteExactInput failed: ${e}`);
    });

    if (!result.data || result.data.length < 66) {
      throw DefiError.rpcError(`[${this.protocolName}] quoter returned empty data`);
    }

    // Decode first element: amountOutList is an array, take the last element
    const decoded = decodeAbiParameters(
      [
        { name: "amountOutList", type: "uint256[]" },
        { name: "amountInList", type: "uint256[]" },
        { name: "sqrtPriceX96AfterList", type: "uint160[]" },
        { name: "initializedTicksCrossedList", type: "uint32[]" },
        { name: "gasEstimate", type: "uint256" },
        { name: "feeList", type: "uint16[]" },
      ],
      result.data,
    );

    const amountOutList = decoded[0] as readonly bigint[];
    const feeList = decoded[5] as readonly number[];
    const amountOut = amountOutList[amountOutList.length - 1];
    const fee = feeList.length > 0 ? feeList[0] : undefined;

    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: undefined,
      fee_bps: fee !== undefined ? Math.floor(fee / 10) : undefined,
      route: [`${params.token_in} -> ${params.token_out}`],
    };
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError("CONTRACT_ERROR", "Position manager address not configured");
    }

    // Sort tokens (Algebra requires token0 < token1)
    const [token0, token1, rawAmount0, rawAmount1] =
      params.token_a.toLowerCase() < params.token_b.toLowerCase()
        ? [params.token_a, params.token_b, params.amount_a, params.amount_b]
        : [params.token_b, params.token_a, params.amount_b, params.amount_a];

    let tickLower = params.tick_lower ?? -887220;
    let tickUpper = params.tick_upper ?? 887220;

    // Auto tick detection: --range N% or single-side
    const isSingleSide = rawAmount0 === 0n || rawAmount1 === 0n;
    const needsAutoTick = (params.range_pct !== undefined) || (isSingleSide && !params.tick_lower && !params.tick_upper);

    if (needsAutoTick) {
      if (!this.rpcUrl) throw DefiError.rpcError("RPC URL required for auto tick detection");
      const poolAddr = params.pool as Address | undefined;
      if (!poolAddr) throw new DefiError("CONTRACT_ERROR", "Pool address required (use --pool)");

      const client = createPublicClient({ transport: http(this.rpcUrl) });
      const algebraPoolAbi = parseAbi([
        "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
        "function tickSpacing() view returns (int24)",
      ]);
      const [globalState, spacing] = await Promise.all([
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "globalState" }),
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "tickSpacing" }),
      ]);
      const currentTick = Number(globalState[1]);
      const tickSpace = Number(spacing);

      if (params.range_pct !== undefined) {
        // ±N% concentrated range
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

    // Algebra V2 (NEST-style, has pool_deployer) uses no deployer field in MintParams
    // Algebra Integral (KittenSwap) includes deployer field
    const data = this.useSingleQuoter
      ? encodeFunctionData({
          abi: algebraV2PmAbi,
          functionName: "mint",
          args: [{ token0, token1, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }],
        })
      : encodeFunctionData({
          abi: algebraIntegralPmAbi,
          functionName: "mint",
          args: [{ token0, token1, deployer: zeroAddress as Address, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }],
        });

    // Only add approvals for non-zero amounts
    const approvals: { token: Address; spender: Address; amount: bigint }[] = [];
    if (amount0 > 0n) approvals.push({ token: token0, spender: pm, amount: amount0 });
    if (amount1 > 0n) approvals.push({ token: token1, spender: pm, amount: amount1 });

    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 500_000,
      approvals,
    };
  }

  async buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId — use NFT position manager directly`,
    );
  }
}
