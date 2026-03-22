import { encodeFunctionData, parseAbi, createPublicClient, http, decodeFunctionResult } from "viem";
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

export class UniswapV2Adapter implements IDex {
  private readonly protocolName: string;
  private readonly router: Address;
  private readonly rpcUrl: string | undefined;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.rpcUrl = rpcUrl;
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
    };
  }

  async quote(params: QuoteParams): Promise<QuoteResult> {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
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
