import { encodeFunctionData, parseAbi, createPublicClient, http, decodeFunctionResult, decodeAbiParameters } from "viem";
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

const abi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
]);

const lbQuoterAbi = parseAbi([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))",
]);

export class UniswapV2Adapter implements IDex {
  private readonly protocolName: string;
  private readonly router: Address;
  private readonly rpcUrl: string | undefined;
  private readonly lbQuoter: Address | undefined;
  private readonly lbIntermediaries: Address[];

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.rpcUrl = rpcUrl;

    // Collect LB intermediary tokens from contracts with "lb_mid_" prefix
    this.lbIntermediaries = [];
    if (entry.contracts) {
      for (const [key, addr] of Object.entries(entry.contracts)) {
        if (key.startsWith("lb_mid_")) {
          this.lbIntermediaries.push(addr);
        }
      }
    }
  }

  name(): string {
    return this.protocolName;
  }

  async buildSwap(params: SwapParams): Promise<DeFiTx> {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const path: Address[] = [params.token_in, params.token_out];

    const data = encodeFunctionData({
      abi,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, path, params.recipient, deadline],
    });

    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 150_000,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }],
    };
  }

  async quote(params: QuoteParams): Promise<QuoteResult> {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }

    // Try LB (Liquidity Book) quote first if lb_quoter is configured
    if (this.lbQuoter) {
      try {
        return await this.lbQuote(params);
      } catch {
        // Fall through to V2 quote
      }
    }

    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const path: Address[] = [params.token_in, params.token_out];

    const result = await client.call({
      to: this.router,
      data: encodeFunctionData({
        abi,
        functionName: "getAmountsOut",
        args: [params.amount_in, path],
      }),
    });

    if (!result.data) {
      throw DefiError.rpcError(`[${this.protocolName}] getAmountsOut returned no data`);
    }

    const decoded = decodeFunctionResult({
      abi,
      functionName: "getAmountsOut",
      data: result.data,
    }) as unknown as bigint[];

    const amountOut = decoded[decoded.length - 1];

    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: undefined,
      fee_bps: 30,
      route: [`${params.token_in} -> ${params.token_out}`],
    };
  }

  private async lbQuote(params: QuoteParams): Promise<QuoteResult> {
    const client = createPublicClient({ transport: http(this.rpcUrl!) });

    // Build candidate routes: direct + multi-hop through each intermediary
    const routes: Address[][] = [[params.token_in, params.token_out]];
    const tokenInLower = params.token_in.toLowerCase();
    const tokenOutLower = params.token_out.toLowerCase();
    for (const mid of this.lbIntermediaries) {
      if (mid.toLowerCase() !== tokenInLower && mid.toLowerCase() !== tokenOutLower) {
        routes.push([params.token_in, mid, params.token_out]);
      }
    }

    const lbResultParams = [
      {
        type: "tuple" as const,
        components: [
          { name: "route", type: "address[]" as const },
          { name: "pairs", type: "address[]" as const },
          { name: "binSteps", type: "uint256[]" as const },
          { name: "versions", type: "uint256[]" as const },
          { name: "amounts", type: "uint128[]" as const },
          { name: "virtualAmountsWithoutSlippage", type: "uint128[]" as const },
          { name: "fees", type: "uint128[]" as const },
        ],
      },
    ] as const;

    let bestOut = 0n;
    let bestRoute: Address[] = [];

    const results = await Promise.allSettled(
      routes.map(async (route) => {
        const result = await client.call({
          to: this.lbQuoter!,
          data: encodeFunctionData({
            abi: lbQuoterAbi,
            functionName: "findBestPathFromAmountIn",
            args: [route, params.amount_in],
          }),
        });
        if (!result.data) return { amountOut: 0n, route };
        const [quote] = decodeAbiParameters(lbResultParams, result.data);
        const amounts = quote.amounts;
        return { amountOut: amounts[amounts.length - 1], route };
      }),
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
      price_impact_bps: undefined,
      fee_bps: undefined,
      route: [bestRoute.map((a) => a.slice(0, 10)).join(" -> ") + " (LB)"],
    };
  }

  async buildAddLiquidity(params: AddLiquidityParams): Promise<DeFiTx> {
    const data = encodeFunctionData({
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
        BigInt("18446744073709551615"),
      ],
    });

    return {
      description: `[${this.protocolName}] Add liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 300_000,
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
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615"),
      ],
    });

    return {
      description: `[${this.protocolName}] Remove liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }
}
