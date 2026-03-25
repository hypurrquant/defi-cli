import { encodeFunctionData, parseAbi, createPublicClient, http, decodeAbiParameters } from "viem";
import type { Address } from "viem";

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

const DEFAULT_FEE = 3000;

const swapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)",
]);

const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

// Ramses CL uses tickSpacing instead of fee in the quoter struct
const ramsesQuoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; int24 tickSpacing; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const positionManagerAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

export class UniswapV3Adapter implements IDex {
  private readonly protocolName: string;
  private readonly router: Address;
  private readonly quoter: Address | undefined;
  private readonly positionManager: Address | undefined;
  private readonly factory: Address | undefined;
  private readonly fee: number;
  private readonly rpcUrl: string | undefined;
  private readonly useTickSpacingQuoter: boolean;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
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
    // Ramses CL and similar forks use tickSpacing-based pool identification
    this.useTickSpacingQuoter = entry.contracts?.["pool_deployer"] !== undefined
      || entry.contracts?.["gauge_factory"] !== undefined;
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const amountOutMinimum = 0n;

    const data = encodeFunctionData({
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
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 200_000,
    };
  }

  async quote(params: QuoteParams): Promise<QuoteResult> {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }

    if (this.quoter) {
      const client = createPublicClient({ transport: http(this.rpcUrl) });

      // Try tickSpacing-based quoter first for Ramses CL and similar forks
      if (this.useTickSpacingQuoter) {
        const tickSpacings = [1, 10, 50, 100, 200];
        const tsResults = await Promise.allSettled(
          tickSpacings.map(async (ts) => {
            const result = await client.call({
              to: this.quoter!,
              data: encodeFunctionData({
                abi: ramsesQuoterAbi,
                functionName: "quoteExactInputSingle",
                args: [
                  {
                    tokenIn: params.token_in,
                    tokenOut: params.token_out,
                    amountIn: params.amount_in,
                    tickSpacing: ts,
                    sqrtPriceLimitX96: 0n,
                  },
                ],
              }),
            });
            if (!result.data) return { amountOut: 0n, tickSpacing: ts };
            const [amountOut] = decodeAbiParameters(
              [{ name: "amountOut", type: "uint256" }],
              result.data,
            );
            return { amountOut, tickSpacing: ts };
          }),
        );

        let best = { amountOut: 0n, tickSpacing: 50 };
        for (const r of tsResults) {
          if (r.status === "fulfilled" && r.value.amountOut > best.amountOut) {
            best = r.value;
          }
        }

        if (best.amountOut > 0n) {
          return {
            protocol: this.protocolName,
            amount_out: best.amountOut,
            price_impact_bps: undefined,
            fee_bps: undefined,
            route: [`${params.token_in} -> ${params.token_out} (tickSpacing: ${best.tickSpacing})`],
          };
        }

        // tickSpacing-based protocol (Ramses CL): quoter returned no result.
        // Pool exists but has no liquidity in this fork snapshot.
        throw DefiError.rpcError(
          `[${this.protocolName}] No quote available — pool exists but has zero liquidity for this pair`,
        );
      }

      // Standard Uniswap V3 fee-based quoter
      const feeTiers = [500, 3000, 10000, 100];
      const results = await Promise.allSettled(
        feeTiers.map(async (fee) => {
          const result = await client.call({
            to: this.quoter!,
            data: encodeFunctionData({
              abi: quoterAbi,
              functionName: "quoteExactInputSingle",
              args: [
                {
                  tokenIn: params.token_in,
                  tokenOut: params.token_out,
                  amountIn: params.amount_in,
                  fee,
                  sqrtPriceLimitX96: 0n,
                },
              ],
            }),
          });
          if (!result.data) return { amountOut: 0n, fee };
          const [amountOut] = decodeAbiParameters(
            [{ name: "amountOut", type: "uint256" }],
            result.data,
          );
          return { amountOut, fee };
        }),
      );

      let best = { amountOut: 0n, fee: 3000 };
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.amountOut > best.amountOut) {
          best = r.value;
        }
      }

      if (best.amountOut > 0n) {
        return {
          protocol: this.protocolName,
          amount_out: best.amountOut,
          price_impact_bps: undefined,
          fee_bps: Math.floor(best.fee / 10),
          route: [`${params.token_in} -> ${params.token_out} (fee: ${best.fee})`],
        };
      }
    }

    // Fallback: simulate swap via eth_call on the router
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const callData = encodeFunctionData({
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
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    let output: `0x${string}` | undefined;
    try {
      const result = await client.call({ to: this.router, data: callData });
      output = result.data;
    } catch (e: unknown) {
      const errMsg = String(e);
      if (errMsg.includes("STF") || errMsg.includes("insufficient")) {
        throw DefiError.unsupported(
          `[${this.protocolName}] quote unavailable — no quoter contract configured. Swap simulation requires token balance. Add a quoter address to the protocol config.`,
        );
      }
      throw DefiError.rpcError(`[${this.protocolName}] swap simulation for quote failed: ${errMsg}`);
    }

    const amountOut =
      output && output.length >= 66
        ? BigInt(output.slice(0, 66))
        : 0n;

    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: undefined,
      fee_bps: Math.floor(this.fee / 10),
      route: [`${params.token_in} -> ${params.token_out} (simulated)`],
    };
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError("CONTRACT_ERROR", "Position manager address not configured");
    }

    // Sort tokens (Uniswap V3 requires token0 < token1)
    const [token0, token1, rawAmount0, rawAmount1] =
      params.token_a.toLowerCase() < params.token_b.toLowerCase()
        ? [params.token_a, params.token_b, params.amount_a, params.amount_b]
        : [params.token_b, params.token_a, params.amount_b, params.amount_a];

    // V3 NPM mint: getLiquidityForAmounts uses min(L0, L1), so if either is 0
    // then liquidity=0 → revert. Use 1 wei minimum for single-side LP.
    const amount0 = rawAmount0 === 0n && rawAmount1 > 0n ? 1n : rawAmount0;
    const amount1 = rawAmount1 === 0n && rawAmount0 > 0n ? 1n : rawAmount1;

    const data = encodeFunctionData({
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
          deadline: BigInt("18446744073709551615"),
        },
      ],
    });

    return {
      description: `[${this.protocolName}] Add liquidity`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 500_000,
    };
  }

  async buildRemoveLiquidity(_params: RemoveLiquidityParams): Promise<DeFiTx> {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId — use NFT position manager directly`,
    );
  }
}
