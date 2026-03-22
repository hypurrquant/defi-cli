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

const abi = parseAbi([
  "struct Route { address from; address to; bool stable; }",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
]);

export class SolidlyAdapter implements IDex {
  private readonly protocolName: string;
  private readonly router: `0x${string}`;
  /** Default to volatile (false). True for stablecoin pairs. */
  private readonly defaultStable: boolean;

  constructor(entry: ProtocolEntry, _rpcUrl?: string) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.defaultStable = false;
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
    };
  }

  async quote(_params: QuoteParams): Promise<QuoteResult> {
    throw DefiError.unsupported(`[${this.protocolName}] quote requires RPC connection`);
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
