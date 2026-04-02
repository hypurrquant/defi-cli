// src/factory.ts
import { DefiError as DefiError34 } from "@hypurrquant/defi-core";

// src/dex/uniswap_v3.ts
import { encodeFunctionData, parseAbi, createPublicClient, http, decodeAbiParameters } from "viem";
import { DefiError } from "@hypurrquant/defi-core";
var DEFAULT_FEE = 3e3;
var swapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
]);
var ramsesQuoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; int24 tickSpacing; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
]);
var positionManagerAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var UniswapV3Adapter = class {
  protocolName;
  router;
  quoter;
  positionManager;
  factory;
  fee;
  rpcUrl;
  useTickSpacingQuoter;
  constructor(entry, rpcUrl) {
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
    this.useTickSpacingQuoter = entry.contracts?.["pool_deployer"] !== void 0 || entry.contracts?.["gauge_factory"] !== void 0;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
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
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (this.quoter) {
      const client2 = createPublicClient({ transport: http(this.rpcUrl) });
      if (this.useTickSpacingQuoter) {
        const tickSpacings = [1, 10, 50, 100, 200];
        const tsResults = await Promise.allSettled(
          tickSpacings.map(async (ts) => {
            const result = await client2.call({
              to: this.quoter,
              data: encodeFunctionData({
                abi: ramsesQuoterAbi,
                functionName: "quoteExactInputSingle",
                args: [
                  {
                    tokenIn: params.token_in,
                    tokenOut: params.token_out,
                    amountIn: params.amount_in,
                    tickSpacing: ts,
                    sqrtPriceLimitX96: 0n
                  }
                ]
              })
            });
            if (!result.data) return { amountOut: 0n, tickSpacing: ts };
            const [amountOut2] = decodeAbiParameters(
              [{ name: "amountOut", type: "uint256" }],
              result.data
            );
            return { amountOut: amountOut2, tickSpacing: ts };
          })
        );
        let best2 = { amountOut: 0n, tickSpacing: 50 };
        for (const r of tsResults) {
          if (r.status === "fulfilled" && r.value.amountOut > best2.amountOut) {
            best2 = r.value;
          }
        }
        if (best2.amountOut > 0n) {
          return {
            protocol: this.protocolName,
            amount_out: best2.amountOut,
            price_impact_bps: void 0,
            fee_bps: void 0,
            route: [`${params.token_in} -> ${params.token_out} (tickSpacing: ${best2.tickSpacing})`]
          };
        }
        throw DefiError.rpcError(
          `[${this.protocolName}] No quote available \u2014 pool exists but has zero liquidity for this pair`
        );
      }
      const feeTiers = [500, 3e3, 1e4, 100];
      const results = await Promise.allSettled(
        feeTiers.map(async (fee) => {
          const result = await client2.call({
            to: this.quoter,
            data: encodeFunctionData({
              abi: quoterAbi,
              functionName: "quoteExactInputSingle",
              args: [
                {
                  tokenIn: params.token_in,
                  tokenOut: params.token_out,
                  amountIn: params.amount_in,
                  fee,
                  sqrtPriceLimitX96: 0n
                }
              ]
            })
          });
          if (!result.data) return { amountOut: 0n, fee };
          const [amountOut2] = decodeAbiParameters(
            [{ name: "amountOut", type: "uint256" }],
            result.data
          );
          return { amountOut: amountOut2, fee };
        })
      );
      let best = { amountOut: 0n, fee: 3e3 };
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.amountOut > best.amountOut) {
          best = r.value;
        }
      }
      if (best.amountOut > 0n) {
        return {
          protocol: this.protocolName,
          amount_out: best.amountOut,
          price_impact_bps: void 0,
          fee_bps: Math.floor(best.fee / 10),
          route: [`${params.token_in} -> ${params.token_out} (fee: ${best.fee})`]
        };
      }
    }
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
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    let output;
    try {
      const result = await client.call({ to: this.router, data: callData });
      output = result.data;
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("STF") || errMsg.includes("insufficient")) {
        throw DefiError.unsupported(
          `[${this.protocolName}] quote unavailable \u2014 no quoter contract configured. Swap simulation requires token balance. Add a quoter address to the protocol config.`
        );
      }
      throw DefiError.rpcError(`[${this.protocolName}] swap simulation for quote failed: ${errMsg}`);
    }
    const amountOut = output && output.length >= 66 ? BigInt(output.slice(0, 66)) : 0n;
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: Math.floor(this.fee / 10),
      route: [`${params.token_in} -> ${params.token_out} (simulated)`]
    };
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError("CONTRACT_ERROR", "Position manager address not configured");
    }
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
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
          deadline: BigInt("18446744073709551615")
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 5e5,
      approvals: [
        { token: token0, spender: pm, amount: amount0 },
        { token: token1, spender: pm, amount: amount1 }
      ]
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId \u2014 use NFT position manager directly`
    );
  }
};

// src/dex/uniswap_v2.ts
import { encodeFunctionData as encodeFunctionData2, parseAbi as parseAbi2, createPublicClient as createPublicClient2, http as http2, decodeFunctionResult, decodeAbiParameters as decodeAbiParameters2 } from "viem";
import { DefiError as DefiError2 } from "@hypurrquant/defi-core";
var abi = parseAbi2([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)"
]);
var lbQuoterAbi = parseAbi2([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
]);
var UniswapV2Adapter = class {
  protocolName;
  router;
  rpcUrl;
  lbQuoter;
  lbIntermediaries;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError2("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.rpcUrl = rpcUrl;
    this.lbIntermediaries = [];
    if (entry.contracts) {
      for (const [key, addr] of Object.entries(entry.contracts)) {
        if (key.startsWith("lb_mid_")) {
          this.lbIntermediaries.push(addr);
        }
      }
    }
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const path = [params.token_in, params.token_out];
    const data = encodeFunctionData2({
      abi,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, path, params.recipient, deadline]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 15e4,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError2.rpcError("No RPC URL configured");
    }
    if (this.lbQuoter) {
      try {
        return await this.lbQuote(params);
      } catch {
      }
    }
    const client = createPublicClient2({ transport: http2(this.rpcUrl) });
    const path = [params.token_in, params.token_out];
    const result = await client.call({
      to: this.router,
      data: encodeFunctionData2({
        abi,
        functionName: "getAmountsOut",
        args: [params.amount_in, path]
      })
    });
    if (!result.data) {
      throw DefiError2.rpcError(`[${this.protocolName}] getAmountsOut returned no data`);
    }
    const decoded = decodeFunctionResult({
      abi,
      functionName: "getAmountsOut",
      data: result.data
    });
    const amountOut = decoded[decoded.length - 1];
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: 30,
      route: [`${params.token_in} -> ${params.token_out}`]
    };
  }
  async lbQuote(params) {
    const client = createPublicClient2({ transport: http2(this.rpcUrl) });
    const routes = [[params.token_in, params.token_out]];
    const tokenInLower = params.token_in.toLowerCase();
    const tokenOutLower = params.token_out.toLowerCase();
    for (const mid of this.lbIntermediaries) {
      if (mid.toLowerCase() !== tokenInLower && mid.toLowerCase() !== tokenOutLower) {
        routes.push([params.token_in, mid, params.token_out]);
      }
    }
    const lbResultParams = [
      {
        type: "tuple",
        components: [
          { name: "route", type: "address[]" },
          { name: "pairs", type: "address[]" },
          { name: "binSteps", type: "uint256[]" },
          { name: "versions", type: "uint256[]" },
          { name: "amounts", type: "uint128[]" },
          { name: "virtualAmountsWithoutSlippage", type: "uint128[]" },
          { name: "fees", type: "uint128[]" }
        ]
      }
    ];
    let bestOut = 0n;
    let bestRoute = [];
    const results = await Promise.allSettled(
      routes.map(async (route) => {
        const result = await client.call({
          to: this.lbQuoter,
          data: encodeFunctionData2({
            abi: lbQuoterAbi,
            functionName: "findBestPathFromAmountIn",
            args: [route, params.amount_in]
          })
        });
        if (!result.data) return { amountOut: 0n, route };
        const [quote] = decodeAbiParameters2(lbResultParams, result.data);
        const amounts = quote.amounts;
        return { amountOut: amounts[amounts.length - 1], route };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.amountOut > bestOut) {
        bestOut = r.value.amountOut;
        bestRoute = r.value.route;
      }
    }
    if (bestOut === 0n) {
      throw DefiError2.rpcError(`[${this.protocolName}] LB quote returned zero for all routes`);
    }
    return {
      protocol: this.protocolName,
      amount_out: bestOut,
      price_impact_bps: void 0,
      fee_bps: void 0,
      route: [bestRoute.map((a) => a.slice(0, 10)).join(" -> ") + " (LB)"]
    };
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData2({
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
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [
        { token: params.token_a, spender: this.router, amount: params.amount_a },
        { token: params.token_b, spender: this.router, amount: params.amount_b }
      ]
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData2({
      abi,
      functionName: "removeLiquidity",
      args: [
        params.token_a,
        params.token_b,
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Remove liquidity V2`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
};

// src/dex/algebra_v3.ts
import { encodeFunctionData as encodeFunctionData3, parseAbi as parseAbi3, createPublicClient as createPublicClient3, http as http3, decodeAbiParameters as decodeAbiParameters3, concatHex, zeroAddress } from "viem";

// src/dex/tick_math.ts
function pctToTickDelta(pct) {
  return Math.round(Math.log(1 + pct / 100) / Math.log(1.0001));
}
function alignTickDown(tick, tickSpacing) {
  return Math.floor(tick / tickSpacing) * tickSpacing;
}
function alignTickUp(tick, tickSpacing) {
  return Math.ceil(tick / tickSpacing) * tickSpacing;
}
function rangeToTicks(currentTick, rangePct, tickSpacing) {
  const delta = pctToTickDelta(rangePct);
  return {
    tickLower: alignTickDown(currentTick - delta, tickSpacing),
    tickUpper: alignTickUp(currentTick + delta, tickSpacing)
  };
}

// src/dex/algebra_v3.ts
import { DefiError as DefiError3 } from "@hypurrquant/defi-core";
var abi2 = parseAbi3([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 limitSqrtPrice; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var algebraQuoterAbi = parseAbi3([
  "function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256[] memory amountOutList, uint256[] memory amountInList, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate, uint16[] memory feeList)"
]);
var algebraSingleQuoterAbi = parseAbi3([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) params) external returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After)"
]);
var algebraIntegralPmAbi = parseAbi3([
  "struct MintParams { address token0; address token1; address deployer; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var algebraV2PmAbi = parseAbi3([
  "struct MintParams { address token0; address token1; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var AlgebraV3Adapter = class {
  protocolName;
  router;
  quoter;
  positionManager;
  rpcUrl;
  // NEST and similar forks expose quoteExactInputSingle((address,address,uint256,uint160))
  // instead of path-based quoteExactInput. Detected by presence of pool_deployer in config.
  useSingleQuoter;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError3("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.quoter = entry.contracts?.["quoter"];
    this.positionManager = entry.contracts?.["position_manager"];
    this.rpcUrl = rpcUrl;
    this.useSingleQuoter = entry.contracts?.["pool_deployer"] !== void 0;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const amountOutMinimum = 0n;
    const data = encodeFunctionData3({
      abi: abi2,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.token_in,
          tokenOut: params.token_out,
          recipient: params.recipient,
          deadline,
          amountIn: params.amount_in,
          amountOutMinimum,
          limitSqrtPrice: 0n
        }
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokenIn for tokenOut`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 25e4,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError3.rpcError("No RPC URL configured");
    }
    if (!this.quoter) {
      throw DefiError3.unsupported(
        `[${this.protocolName}] No quoter contract configured`
      );
    }
    const client = createPublicClient3({ transport: http3(this.rpcUrl) });
    if (this.useSingleQuoter) {
      const result2 = await client.call({
        to: this.quoter,
        data: encodeFunctionData3({
          abi: algebraSingleQuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: params.token_in,
              tokenOut: params.token_out,
              amountIn: params.amount_in,
              limitSqrtPrice: 0n
            }
          ]
        })
      }).catch((e) => {
        throw DefiError3.rpcError(`[${this.protocolName}] quoteExactInputSingle failed: ${e}`);
      });
      if (!result2.data || result2.data.length < 66) {
        throw DefiError3.rpcError(`[${this.protocolName}] quoter returned empty data`);
      }
      const [amountOut2] = decodeAbiParameters3(
        [
          { name: "amountOut", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "sqrtPriceX96After", type: "uint160" }
        ],
        result2.data
      );
      return {
        protocol: this.protocolName,
        amount_out: amountOut2,
        price_impact_bps: void 0,
        fee_bps: void 0,
        route: [`${params.token_in} -> ${params.token_out}`]
      };
    }
    const path = concatHex([params.token_in, zeroAddress, params.token_out]);
    const result = await client.call({
      to: this.quoter,
      data: encodeFunctionData3({
        abi: algebraQuoterAbi,
        functionName: "quoteExactInput",
        args: [path, params.amount_in]
      })
    }).catch((e) => {
      throw DefiError3.rpcError(`[${this.protocolName}] quoteExactInput failed: ${e}`);
    });
    if (!result.data || result.data.length < 66) {
      throw DefiError3.rpcError(`[${this.protocolName}] quoter returned empty data`);
    }
    const decoded = decodeAbiParameters3(
      [
        { name: "amountOutList", type: "uint256[]" },
        { name: "amountInList", type: "uint256[]" },
        { name: "sqrtPriceX96AfterList", type: "uint160[]" },
        { name: "initializedTicksCrossedList", type: "uint32[]" },
        { name: "gasEstimate", type: "uint256" },
        { name: "feeList", type: "uint16[]" }
      ],
      result.data
    );
    const amountOutList = decoded[0];
    const feeList = decoded[5];
    const amountOut = amountOutList[amountOutList.length - 1];
    const fee = feeList.length > 0 ? feeList[0] : void 0;
    return {
      protocol: this.protocolName,
      amount_out: amountOut,
      price_impact_bps: void 0,
      fee_bps: fee !== void 0 ? Math.floor(fee / 10) : void 0,
      route: [`${params.token_in} -> ${params.token_out}`]
    };
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) {
      throw new DefiError3("CONTRACT_ERROR", "Position manager address not configured");
    }
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
    let tickLower = params.tick_lower ?? -887220;
    let tickUpper = params.tick_upper ?? 887220;
    const isSingleSide = rawAmount0 === 0n || rawAmount1 === 0n;
    const needsAutoTick = params.range_pct !== void 0 || isSingleSide && !params.tick_lower && !params.tick_upper;
    if (needsAutoTick) {
      if (!this.rpcUrl) throw DefiError3.rpcError("RPC URL required for auto tick detection");
      const poolAddr = params.pool;
      if (!poolAddr) throw new DefiError3("CONTRACT_ERROR", "Pool address required (use --pool)");
      const client = createPublicClient3({ transport: http3(this.rpcUrl) });
      const algebraPoolAbi = parseAbi3([
        "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
        "function tickSpacing() view returns (int24)"
      ]);
      const [globalState, spacing] = await Promise.all([
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "globalState" }),
        client.readContract({ address: poolAddr, abi: algebraPoolAbi, functionName: "tickSpacing" })
      ]);
      const currentTick = Number(globalState[1]);
      const tickSpace = Number(spacing);
      if (params.range_pct !== void 0) {
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
    const data = this.useSingleQuoter ? encodeFunctionData3({
      abi: algebraV2PmAbi,
      functionName: "mint",
      args: [{ token0, token1, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }]
    }) : encodeFunctionData3({
      abi: algebraIntegralPmAbi,
      functionName: "mint",
      args: [{ token0, token1, deployer: zeroAddress, tickLower, tickUpper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: params.recipient, deadline: BigInt("18446744073709551615") }]
    });
    const approvals = [];
    if (amount0 > 0n) approvals.push({ token: token0, spender: pm, amount: amount0 });
    if (amount1 > 0n) approvals.push({ token: token1, spender: pm, amount: amount1 });
    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 5e5,
      approvals
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError3.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId \u2014 use NFT position manager directly`
    );
  }
};

// src/dex/balancer_v3.ts
import { encodeFunctionData as encodeFunctionData4, parseAbi as parseAbi4, zeroAddress as zeroAddress2 } from "viem";
import { DefiError as DefiError4 } from "@hypurrquant/defi-core";
var abi3 = parseAbi4([
  "function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes calldata userData) external returns (uint256 amountOut)"
]);
var BalancerV3Adapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError4("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minAmountOut = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const data = encodeFunctionData4({
      abi: abi3,
      functionName: "swapSingleTokenExactIn",
      args: [
        zeroAddress2,
        // TODO: resolve pool from registry
        params.token_in,
        params.token_out,
        params.amount_in,
        minAmountOut,
        deadline,
        false,
        "0x"
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via Balancer V3`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async quote(_params) {
    throw DefiError4.unsupported(`[${this.protocolName}] quote requires RPC`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError4.unsupported(`[${this.protocolName}] add_liquidity requires pool-specific params`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError4.unsupported(`[${this.protocolName}] remove_liquidity requires pool-specific params`);
  }
};

// src/dex/curve.ts
import { encodeFunctionData as encodeFunctionData5, parseAbi as parseAbi5 } from "viem";
import { DefiError as DefiError5 } from "@hypurrquant/defi-core";
var poolAbi = parseAbi5([
  "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) external returns (uint256)",
  "function remove_liquidity(uint256 amount, uint256[2] min_amounts) external returns (uint256[2])"
]);
var CurveStableSwapAdapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError5("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minDy = 0n;
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "exchange",
      args: [0n, 1n, params.amount_in, minDy]
    });
    return {
      description: `[${this.protocolName}] Curve pool exchange ${params.amount_in} tokens (index 0 -> 1)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async quote(_params) {
    throw DefiError5.unsupported(`[${this.protocolName}] quote requires RPC connection`);
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "add_liquidity",
      args: [[params.amount_a, params.amount_b], 0n]
    });
    return {
      description: `[${this.protocolName}] Curve add liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 4e5
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData5({
      abi: poolAbi,
      functionName: "remove_liquidity",
      args: [params.liquidity, [0n, 0n]]
    });
    return {
      description: `[${this.protocolName}] Curve remove liquidity`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
};

// src/dex/solidly.ts
import { encodeFunctionData as encodeFunctionData6, parseAbi as parseAbi6, decodeAbiParameters as decodeAbiParameters4 } from "viem";
import { DefiError as DefiError6, multicallRead } from "@hypurrquant/defi-core";
var abi4 = parseAbi6([
  "struct Route { address from; address to; bool stable; }",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] calldata routes) external view returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)"
]);
var abiV2 = parseAbi6([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] calldata routes) external view returns (uint256[] memory amounts)"
]);
var SolidlyAdapter = class {
  protocolName;
  router;
  /** Default to volatile (false). True for stablecoin pairs. */
  defaultStable;
  rpcUrl;
  /** Factory address — present on Velodrome V2 / Aerodrome forks */
  factory;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError6("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.defaultStable = false;
    this.rpcUrl = rpcUrl;
    this.factory = entry.contracts?.["factory"];
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const amountOutMin = 0n;
    const deadline = BigInt(params.deadline ?? 18446744073709551615n);
    const routes = [
      { from: params.token_in, to: params.token_out, stable: this.defaultStable }
    ];
    const data = encodeFunctionData6({
      abi: abi4,
      functionName: "swapExactTokensForTokens",
      args: [params.amount_in, amountOutMin, routes, params.recipient, deadline]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} tokens via Solidly`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  encodeV1(params, stable) {
    return encodeFunctionData6({
      abi: abi4,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable }]]
    });
  }
  encodeV2(params, stable) {
    return encodeFunctionData6({
      abi: abiV2,
      functionName: "getAmountsOut",
      args: [params.amount_in, [{ from: params.token_in, to: params.token_out, stable, factory: this.factory }]]
    });
  }
  async quote(params) {
    if (!this.rpcUrl) throw DefiError6.rpcError("No RPC URL configured");
    const candidates = [
      { callData: this.encodeV1(params, false), stable: false },
      { callData: this.encodeV1(params, true), stable: true }
    ];
    if (this.factory) {
      candidates.unshift(
        { callData: this.encodeV2(params, false), stable: false },
        { callData: this.encodeV2(params, true), stable: true }
      );
    }
    const rawResults = await multicallRead(
      this.rpcUrl,
      candidates.map((c) => [this.router, c.callData])
    );
    let bestOut = 0n;
    let bestStable = false;
    for (let i = 0; i < rawResults.length; i++) {
      const raw = rawResults[i];
      if (!raw) continue;
      try {
        const [amounts] = decodeAbiParameters4(
          [{ name: "amounts", type: "uint256[]" }],
          raw
        );
        const out = amounts.length >= 2 ? amounts[amounts.length - 1] : 0n;
        if (out > bestOut) {
          bestOut = out;
          bestStable = candidates[i].stable;
        }
      } catch {
      }
    }
    if (bestOut === 0n) {
      throw DefiError6.rpcError(`[${this.protocolName}] getAmountsOut returned zero for all routes`);
    }
    return {
      protocol: this.protocolName,
      amount_out: bestOut,
      price_impact_bps: void 0,
      fee_bps: bestStable ? 4 : 20,
      route: [`${params.token_in} -> ${params.token_out} (stable: ${bestStable})`]
    };
  }
  async buildAddLiquidity(params) {
    const data = encodeFunctionData6({
      abi: abi4,
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
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Add liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 35e4,
      approvals: [
        { token: params.token_a, spender: this.router, amount: params.amount_a },
        { token: params.token_b, spender: this.router, amount: params.amount_b }
      ]
    };
  }
  async buildRemoveLiquidity(params) {
    const data = encodeFunctionData6({
      abi: abi4,
      functionName: "removeLiquidity",
      args: [
        params.token_a,
        params.token_b,
        this.defaultStable,
        params.liquidity,
        0n,
        0n,
        params.recipient,
        BigInt("18446744073709551615")
      ]
    });
    return {
      description: `[${this.protocolName}] Remove liquidity (Solidly)`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
};

// src/dex/thena_cl.ts
import { encodeFunctionData as encodeFunctionData7, parseAbi as parseAbi7, createPublicClient as createPublicClient4, http as http4, zeroAddress as zeroAddress3 } from "viem";
import { DefiError as DefiError7 } from "@hypurrquant/defi-core";
var thenaPmAbi = parseAbi7([
  "struct MintParams { address token0; address token1; int24 tickSpacing; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; uint160 sqrtPriceX96; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var thenaRouterAbi = parseAbi7([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; int24 tickSpacing; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var thenaPoolAbi = parseAbi7([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function tickSpacing() view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);
var thenaFactoryAbi = parseAbi7([
  "function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)"
]);
var ThenaCLAdapter = class {
  protocolName;
  router;
  positionManager;
  factory;
  rpcUrl;
  defaultTickSpacing;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) throw new DefiError7("CONTRACT_ERROR", "Missing 'router' contract address");
    this.router = router;
    this.positionManager = entry.contracts?.["position_manager"];
    this.factory = entry.contracts?.["pool_factory"];
    this.rpcUrl = rpcUrl;
    this.defaultTickSpacing = 50;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const data = encodeFunctionData7({
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
        sqrtPriceLimitX96: 0n
      }]
    });
    return {
      description: `[${this.protocolName}] Swap`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.token_in, spender: this.router, amount: params.amount_in }]
    };
  }
  async quote(_params) {
    throw DefiError7.unsupported(`[${this.protocolName}] quote not yet implemented \u2014 use swap router`);
  }
  async buildAddLiquidity(params) {
    const pm = this.positionManager;
    if (!pm) throw new DefiError7("CONTRACT_ERROR", "Position manager not configured");
    if (!this.rpcUrl) throw DefiError7.rpcError("RPC URL required");
    const [token0, token1, rawAmount0, rawAmount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
    const client = createPublicClient4({ transport: http4(this.rpcUrl) });
    const poolAddr = params.pool;
    let tickSpacing = this.defaultTickSpacing;
    let tickLower = params.tick_lower ?? 0;
    let tickUpper = params.tick_upper ?? 0;
    if (poolAddr || !params.tick_lower || !params.tick_upper) {
      let pool = poolAddr;
      if (!pool && this.factory) {
        pool = await client.readContract({
          address: this.factory,
          abi: thenaFactoryAbi,
          functionName: "getPool",
          args: [token0, token1, tickSpacing]
        });
        if (pool === zeroAddress3) throw new DefiError7("CONTRACT_ERROR", "Pool not found");
      }
      if (pool) {
        const [slot0, ts] = await Promise.all([
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "slot0" }),
          client.readContract({ address: pool, abi: thenaPoolAbi, functionName: "tickSpacing" })
        ]);
        const currentTick = Number(slot0[1]);
        tickSpacing = Number(ts);
        if (params.range_pct !== void 0) {
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
    if (params.tick_lower !== void 0) tickLower = params.tick_lower;
    if (params.tick_upper !== void 0) tickUpper = params.tick_upper;
    const data = encodeFunctionData7({
      abi: thenaPmAbi,
      functionName: "mint",
      args: [{
        token0,
        token1,
        tickSpacing,
        tickLower,
        tickUpper,
        amount0Desired: rawAmount0,
        amount1Desired: rawAmount1,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: params.recipient,
        deadline: BigInt("18446744073709551615"),
        sqrtPriceX96: 0n
      }]
    });
    const approvals = [];
    if (rawAmount0 > 0n) approvals.push({ token: token0, spender: pm, amount: rawAmount0 });
    if (rawAmount1 > 0n) approvals.push({ token: token1, spender: pm, amount: rawAmount1 });
    return {
      description: `[${this.protocolName}] Add liquidity [${tickLower}, ${tickUpper}]`,
      to: pm,
      data,
      value: 0n,
      gas_estimate: 7e5,
      approvals
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError7.unsupported(`[${this.protocolName}] remove_liquidity requires tokenId`);
  }
};

// src/dex/hybra_gauge.ts
import { createPublicClient as createPublicClient5, decodeFunctionResult as decodeFunctionResult2, encodeFunctionData as encodeFunctionData8, http as http5, parseAbi as parseAbi8, zeroAddress as zeroAddress4 } from "viem";
import { DefiError as DefiError8, multicallRead as multicallRead2 } from "@hypurrquant/defi-core";
var _addressDecodeAbi = parseAbi8(["function f() external view returns (address)"]);
function decodeAddress(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _addressDecodeAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _symbolDecodeAbi = parseAbi8(["function symbol() external view returns (string)"]);
function decodeSymbol(data) {
  if (!data) return "?";
  try {
    return decodeFunctionResult2({ abi: _symbolDecodeAbi, functionName: "symbol", data });
  } catch {
    return "?";
  }
}
var gaugeManagerAbi = parseAbi8([
  "function gauges(address pool) view returns (address gauge)",
  "function isGauge(address gauge) view returns (bool)",
  "function isAlive(address gauge) view returns (bool)",
  "function claimRewards(address gauge, uint256[] tokenIds, uint8 redeemType) external"
]);
var gaugeCLAbi = parseAbi8([
  "function deposit(uint256 tokenId) external",
  "function withdraw(uint256 tokenId, uint8 redeemType) external",
  "function earned(uint256 tokenId) view returns (uint256)",
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function rewardToken() view returns (address)"
]);
var nfpmAbi = parseAbi8([
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view returns (address)"
]);
var veAbi = parseAbi8([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external"
]);
var voterAbi = parseAbi8([
  "function vote(uint256 tokenId, address[] pools, uint256[] weights) external",
  "function claimBribes(address[] bribes, address[][] tokens, uint256 tokenId) external",
  "function claimFees(address[] fees, address[][] tokens, uint256 tokenId) external"
]);
var HybraGaugeAdapter = class {
  protocolName;
  gaugeManager;
  veToken;
  voter;
  positionManager;
  poolFactory;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const gm = entry.contracts?.["gauge_manager"];
    if (!gm) throw new DefiError8("CONTRACT_ERROR", "Missing 'gauge_manager' contract");
    this.gaugeManager = gm;
    const ve = entry.contracts?.["ve_token"];
    if (!ve) throw new DefiError8("CONTRACT_ERROR", "Missing 've_token' contract");
    this.veToken = ve;
    this.voter = entry.contracts?.["voter"] ?? zeroAddress4;
    this.positionManager = entry.contracts?.["position_manager"] ?? zeroAddress4;
    this.poolFactory = entry.contracts?.["pool_factory"];
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  // ─── Gauge Discovery ──────────────────────────────────────
  async discoverGaugedPools() {
    if (!this.rpcUrl) throw DefiError8.rpcError("RPC URL required for gauge discovery");
    if (!this.poolFactory) throw new DefiError8("CONTRACT_ERROR", "Missing 'pool_factory' contract");
    const factoryAbi = parseAbi8([
      "function allPoolsLength() external view returns (uint256)",
      "function allPools(uint256) external view returns (address)"
    ]);
    const poolAbi2 = parseAbi8([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)"
    ]);
    const erc20SymbolAbi = parseAbi8(["function symbol() external view returns (string)"]);
    const gaugesAbi = parseAbi8(["function gauges(address pool) view returns (address gauge)"]);
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    let poolCount;
    try {
      poolCount = await client.readContract({
        address: this.poolFactory,
        abi: factoryAbi,
        functionName: "allPoolsLength"
      });
    } catch {
      return [];
    }
    const count = Number(poolCount);
    if (count === 0) return [];
    const poolAddressCalls = [];
    for (let i = 0; i < count; i++) {
      poolAddressCalls.push([
        this.poolFactory,
        encodeFunctionData8({ abi: factoryAbi, functionName: "allPools", args: [BigInt(i)] })
      ]);
    }
    const poolAddressResults = await multicallRead2(this.rpcUrl, poolAddressCalls);
    const pools = poolAddressResults.map((r) => decodeAddress(r)).filter((a) => a !== null && a !== zeroAddress4);
    if (pools.length === 0) return [];
    const gaugeCalls = pools.map((pool) => [
      this.gaugeManager,
      encodeFunctionData8({ abi: gaugesAbi, functionName: "gauges", args: [pool] })
    ]);
    const gaugeResults = await multicallRead2(this.rpcUrl, gaugeCalls);
    const gaugedPools = [];
    for (let i = 0; i < pools.length; i++) {
      const gauge = decodeAddress(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress4) {
        gaugedPools.push({ pool: pools[i], gauge });
      }
    }
    if (gaugedPools.length === 0) return [];
    const tokenCalls = [];
    for (const { pool } of gaugedPools) {
      tokenCalls.push([pool, encodeFunctionData8({ abi: poolAbi2, functionName: "token0" })]);
      tokenCalls.push([pool, encodeFunctionData8({ abi: poolAbi2, functionName: "token1" })]);
    }
    const tokenResults = await multicallRead2(this.rpcUrl, tokenCalls);
    const tokenAddrs = /* @__PURE__ */ new Set();
    for (let i = 0; i < gaugedPools.length; i++) {
      const t0 = decodeAddress(tokenResults[i * 2] ?? null);
      const t1 = decodeAddress(tokenResults[i * 2 + 1] ?? null);
      if (t0 && t0 !== zeroAddress4) tokenAddrs.add(t0);
      if (t1 && t1 !== zeroAddress4) tokenAddrs.add(t1);
    }
    const uniqueTokens = Array.from(tokenAddrs);
    const symbolCalls = uniqueTokens.map((t) => [
      t,
      encodeFunctionData8({ abi: erc20SymbolAbi, functionName: "symbol" })
    ]);
    const symbolResults = await multicallRead2(this.rpcUrl, symbolCalls);
    const symbolMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i], decodeSymbol(symbolResults[i] ?? null));
    }
    const out = [];
    for (let i = 0; i < gaugedPools.length; i++) {
      const { pool, gauge } = gaugedPools[i];
      const t0 = decodeAddress(tokenResults[i * 2] ?? null);
      const t1 = decodeAddress(tokenResults[i * 2 + 1] ?? null);
      out.push({
        pool,
        gauge,
        token0: t0 ? symbolMap.get(t0) ?? t0.slice(0, 10) : "?",
        token1: t1 ? symbolMap.get(t1) ?? t1.slice(0, 10) : "?",
        token0Addr: t0 ?? void 0,
        token1Addr: t1 ?? void 0,
        type: "CL"
      });
    }
    return out;
  }
  // ─── Gauge Lookup ──────────────────────────────────────────
  async resolveGauge(pool) {
    if (!this.rpcUrl) throw DefiError8.rpcError("RPC required");
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    const gauge = await client.readContract({
      address: this.gaugeManager,
      abi: gaugeManagerAbi,
      functionName: "gauges",
      args: [pool]
    });
    if (gauge === zeroAddress4) throw new DefiError8("CONTRACT_ERROR", `No gauge for pool ${pool}`);
    return gauge;
  }
  // ─── CL Gauge: NFT Deposit/Withdraw ──────────────────────────
  async buildDeposit(gauge, _amount, tokenId) {
    if (tokenId === void 0) throw new DefiError8("CONTRACT_ERROR", "tokenId required for CL gauge deposit");
    const approveTx = {
      description: `[${this.protocolName}] Approve NFT #${tokenId} to gauge`,
      to: this.positionManager,
      data: encodeFunctionData8({ abi: nfpmAbi, functionName: "approve", args: [gauge, tokenId] }),
      value: 0n,
      gas_estimate: 8e4
    };
    return {
      description: `[${this.protocolName}] Deposit NFT #${tokenId} to gauge`,
      to: gauge,
      data: encodeFunctionData8({ abi: gaugeCLAbi, functionName: "deposit", args: [tokenId] }),
      value: 0n,
      gas_estimate: 5e5,
      pre_txs: [approveTx]
    };
  }
  async buildWithdraw(gauge, _amount, tokenId) {
    if (tokenId === void 0) throw new DefiError8("CONTRACT_ERROR", "tokenId required for CL gauge withdraw");
    return {
      description: `[${this.protocolName}] Withdraw NFT #${tokenId} from gauge`,
      to: gauge,
      data: encodeFunctionData8({ abi: gaugeCLAbi, functionName: "withdraw", args: [tokenId, 1] }),
      value: 0n,
      gas_estimate: 1e6
    };
  }
  // ─── Claim: via GaugeManager ──────────────────────────────────
  async buildClaimRewards(gauge, _account) {
    throw DefiError8.unsupported(`[${this.protocolName}] Use buildClaimRewardsByTokenId for CL gauges`);
  }
  async buildClaimRewardsByTokenId(gauge, tokenId) {
    return {
      description: `[${this.protocolName}] Claim rewards for NFT #${tokenId}`,
      to: this.gaugeManager,
      data: encodeFunctionData8({
        abi: gaugeManagerAbi,
        functionName: "claimRewards",
        args: [gauge, [tokenId], 1]
        // redeemType=1
      }),
      value: 0n,
      gas_estimate: 1e6
    };
  }
  // ─── Pending Rewards ──────────────────────────────────────────
  async getPendingRewards(gauge, _user) {
    throw DefiError8.unsupported(`[${this.protocolName}] Use getPendingRewardsByTokenId for CL gauges`);
  }
  async getPendingRewardsByTokenId(gauge, tokenId) {
    if (!this.rpcUrl) throw DefiError8.rpcError("RPC required");
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    return await client.readContract({
      address: gauge,
      abi: gaugeCLAbi,
      functionName: "earned",
      args: [tokenId]
    });
  }
  // ─── VoteEscrow ──────────────────────────────────────────────
  async buildCreateLock(amount, lockDuration) {
    return {
      description: `[${this.protocolName}] Create veNFT lock`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "create_lock", args: [amount, BigInt(lockDuration)] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildIncreaseAmount(tokenId, amount) {
    return {
      description: `[${this.protocolName}] Increase veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "increase_amount", args: [tokenId, amount] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildIncreaseUnlockTime(tokenId, lockDuration) {
    return {
      description: `[${this.protocolName}] Extend veNFT #${tokenId} lock`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "increase_unlock_time", args: [tokenId, BigInt(lockDuration)] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildWithdrawExpired(tokenId) {
    return {
      description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
      to: this.veToken,
      data: encodeFunctionData8({ abi: veAbi, functionName: "withdraw", args: [tokenId] }),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  // ─── Voter ──────────────────────────────────────────────────
  async buildVote(tokenId, pools, weights) {
    return {
      description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "vote", args: [tokenId, pools, weights] }),
      value: 0n,
      gas_estimate: 5e5
    };
  }
  async buildClaimBribes(bribes, tokenId) {
    const tokensPerBribe = bribes.map(() => []);
    return {
      description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "claimBribes", args: [bribes, tokensPerBribe, tokenId] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildClaimFees(fees, tokenId) {
    const tokensPerFee = fees.map(() => []);
    return {
      description: `[${this.protocolName}] Claim fees for veNFT #${tokenId}`,
      to: this.voter,
      data: encodeFunctionData8({ abi: voterAbi, functionName: "claimFees", args: [fees, tokensPerFee, tokenId] }),
      value: 0n,
      gas_estimate: 3e5
    };
  }
};

// src/dex/woofi.ts
import { encodeFunctionData as encodeFunctionData9, parseAbi as parseAbi9, zeroAddress as zeroAddress5 } from "viem";
import { DefiError as DefiError9 } from "@hypurrquant/defi-core";
var abi5 = parseAbi9([
  "function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) external payable returns (uint256 realToAmount)"
]);
var WooFiAdapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError9("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minToAmount = 0n;
    const data = encodeFunctionData9({
      abi: abi5,
      functionName: "swap",
      args: [
        params.token_in,
        params.token_out,
        params.amount_in,
        minToAmount,
        params.recipient,
        zeroAddress5
      ]
    });
    return {
      description: `[${this.protocolName}] Swap ${params.amount_in} via WOOFi`,
      to: this.router,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async quote(_params) {
    throw DefiError9.unsupported(`[${this.protocolName}] quote requires RPC`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError9.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError9.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
};

// src/dex/solidly_gauge.ts
import { createPublicClient as createPublicClient6, decodeFunctionResult as decodeFunctionResult3, encodeFunctionData as encodeFunctionData10, http as http6, parseAbi as parseAbi10, zeroAddress as zeroAddress6 } from "viem";
import { DefiError as DefiError10, multicallRead as multicallRead3 } from "@hypurrquant/defi-core";
var gaugeAbi = parseAbi10([
  "function deposit(uint256 amount) external",
  "function depositFor(uint256 amount, uint256 tokenId) external",
  "function withdraw(uint256 amount) external",
  "function getReward() external",
  "function getReward(address account) external",
  "function getReward(address account, address[] tokens) external",
  "function getReward(uint256 tokenId) external",
  "function earned(address account) external view returns (uint256)",
  "function earned(address account, uint256 tokenId) external view returns (uint256)",
  "function earned(address token, address account) external view returns (uint256)",
  "function earned(uint256 tokenId) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function rewardToken() external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function rewardsListLength() external view returns (uint256)",
  "function rewardData(address token) external view returns (uint256 periodFinish, uint256 rewardRate, uint256 lastUpdateTime, uint256 rewardPerTokenStored)",
  "function nonfungiblePositionManager() external view returns (address)"
]);
var veAbi2 = parseAbi10([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
  "function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)"
]);
var voterAbi2 = parseAbi10([
  "function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external",
  "function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external",
  "function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external",
  "function gauges(address pool) external view returns (address)",
  "function gaugeForPool(address pool) external view returns (address)",
  "function poolToGauge(address pool) external view returns (address)"
]);
var _addressDecodeAbi2 = parseAbi10(["function f() external view returns (address)"]);
function decodeAddress2(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult3({ abi: _addressDecodeAbi2, functionName: "f", data });
  } catch {
    return null;
  }
}
var _symbolDecodeAbi2 = parseAbi10(["function symbol() external view returns (string)"]);
function decodeSymbol2(data) {
  if (!data) return "?";
  try {
    return decodeFunctionResult3({ abi: _symbolDecodeAbi2, functionName: "symbol", data });
  } catch {
    return "?";
  }
}
var _boolDecodeAbi = parseAbi10(["function f() external view returns (bool)"]);
function decodeBoolean(data) {
  try {
    return decodeFunctionResult3({ abi: _boolDecodeAbi, functionName: "f", data });
  } catch {
    return false;
  }
}
var HYPEREVM_TOKENS = {
  WHYPE: "0x5555555555555555555555555555555555555555",
  USDC: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  USDT0: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  UETH: "0xBe6727B535545C67d5cAa73dEa54865B92CF7907",
  UBTC: "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463",
  USDH: "0x111111a1a0667d36bD57c0A9f569b98057111111",
  USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  sUSDe: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
  XAUt0: "0xf4D9235269a96aaDaFc9aDAe454a0618eBE37949",
  kHYPE: "0xfD739d4e423301CE9385c1fb8850539D657C296D",
  RAM: "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555",
  hyperRAM: "0xAAAE8378809bb8815c08D3C59Eb0c7D1529aD769"
};
var CL_TICK_SPACINGS = [1, 5, 10, 50, 100, 200];
var SolidlyGaugeAdapter = class {
  protocolName;
  voter;
  veToken;
  rpcUrl;
  clFactory;
  v2Factory;
  tokens;
  constructor(entry, rpcUrl, tokens) {
    this.protocolName = entry.name;
    const voter = entry.contracts?.["voter"];
    if (!voter) {
      throw new DefiError10("CONTRACT_ERROR", "Missing 'voter' contract");
    }
    const veToken = entry.contracts?.["ve_token"];
    if (!veToken) {
      throw new DefiError10("CONTRACT_ERROR", "Missing 've_token' contract");
    }
    this.voter = voter;
    this.veToken = veToken;
    this.rpcUrl = rpcUrl;
    this.tokens = tokens;
    this.clFactory = entry.contracts?.["cl_factory"] ?? entry.contracts?.["factory"];
    this.v2Factory = entry.contracts?.["pair_factory"] ?? entry.contracts?.["factory"];
  }
  name() {
    return this.protocolName;
  }
  /** Scan V2 and CL factories for pools that have active emission gauges. */
  async discoverGaugedPools() {
    if (!this.rpcUrl) throw DefiError10.rpcError("RPC URL required for gauge discovery");
    const results = [];
    await Promise.all([
      this._discoverV2GaugedPools(results),
      this._discoverCLGaugedPools(results)
    ]);
    await this._enrichGaugeMetrics(results);
    return results;
  }
  /**
   * Batch query rewardRate, totalSupply, rewardToken for all discovered gauges.
   * Handles both single-token (rewardRate) and multi-token (rewardData) gauges.
   */
  async _enrichGaugeMetrics(pools) {
    if (!this.rpcUrl || pools.length === 0) return;
    const _u256Abi = parseAbi10(["function f() view returns (uint256)"]);
    const calls = [];
    for (const p of pools) {
      calls.push([p.gauge, encodeFunctionData10({ abi: gaugeAbi, functionName: "rewardRate" })]);
      calls.push([p.gauge, encodeFunctionData10({ abi: gaugeAbi, functionName: "totalSupply" })]);
      calls.push([p.gauge, encodeFunctionData10({ abi: gaugeAbi, functionName: "rewardToken" })]);
    }
    const results = await multicallRead3(this.rpcUrl, calls).catch(() => []);
    for (let i = 0; i < pools.length; i++) {
      const base = i * 3;
      try {
        pools[i].rewardRate = results[base] ? decodeFunctionResult3({ abi: _u256Abi, functionName: "f", data: results[base] }) : 0n;
      } catch {
        pools[i].rewardRate = 0n;
      }
      try {
        pools[i].totalStaked = results[base + 1] ? decodeFunctionResult3({ abi: _u256Abi, functionName: "f", data: results[base + 1] }) : 0n;
      } catch {
        pools[i].totalStaked = 0n;
      }
      try {
        pools[i].rewardToken = results[base + 2] ? decodeAddress2(results[base + 2]) ?? void 0 : void 0;
      } catch {
      }
    }
    const KNOWN_REWARD_TOKENS = [
      "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555",
      // xRAM
      "0x5555555555555555555555555555555555555555",
      // WHYPE
      "0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8",
      // HYBR
      "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035"
      // NEST
    ];
    const needsFallback = pools.filter((p) => (p.rewardRate ?? 0n) === 0n && (p.totalStaked ?? 0n) > 0n);
    if (needsFallback.length === 0) return;
    const rdCalls = [];
    const rdMeta = [];
    for (const p of needsFallback) {
      const poolIdx = pools.indexOf(p);
      for (const token of KNOWN_REWARD_TOKENS) {
        rdCalls.push([p.gauge, encodeFunctionData10({ abi: gaugeAbi, functionName: "rewardData", args: [token] })]);
        rdMeta.push({ poolIdx, token });
      }
    }
    const rdResults = await multicallRead3(this.rpcUrl, rdCalls).catch(() => []);
    const _rdAbi = parseAbi10(["function f() view returns (uint256, uint256, uint256, uint256)"]);
    for (let i = 0; i < rdMeta.length; i++) {
      const { poolIdx, token } = rdMeta[i];
      const pool = pools[poolIdx];
      if ((pool.rewardRate ?? 0n) > 0n) continue;
      try {
        if (!rdResults[i]) continue;
        const decoded = decodeFunctionResult3({ abi: _rdAbi, functionName: "f", data: rdResults[i] });
        const [periodFinish, rewardRate] = decoded;
        const now = BigInt(Math.floor(Date.now() / 1e3));
        if (rewardRate > 0n && periodFinish > now) {
          pool.rewardRate = rewardRate;
          pool.rewardToken = token;
        }
      } catch {
      }
    }
  }
  async _discoverV2GaugedPools(out) {
    if (!this.rpcUrl || !this.v2Factory) return;
    const v2FactoryAbi = parseAbi10([
      "function allPairsLength() external view returns (uint256)",
      "function allPairs(uint256) external view returns (address)"
    ]);
    const pairAbi = parseAbi10([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function stable() external view returns (bool)"
    ]);
    const erc20SymbolAbi = parseAbi10(["function symbol() external view returns (string)"]);
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    let pairCount;
    try {
      pairCount = await client.readContract({
        address: this.v2Factory,
        abi: v2FactoryAbi,
        functionName: "allPairsLength"
      });
    } catch {
      return;
    }
    const count = Number(pairCount);
    if (count === 0) return;
    const pairAddressCalls = [];
    for (let i = 0; i < count; i++) {
      pairAddressCalls.push([
        this.v2Factory,
        encodeFunctionData10({ abi: v2FactoryAbi, functionName: "allPairs", args: [BigInt(i)] })
      ]);
    }
    const pairAddressResults = await multicallRead3(this.rpcUrl, pairAddressCalls);
    const pairs = pairAddressResults.map((r) => decodeAddress2(r)).filter((a) => a !== null && a !== zeroAddress6);
    if (pairs.length === 0) return;
    const gaugeForPoolAbi = parseAbi10(["function gaugeForPool(address) external view returns (address)"]);
    const poolToGaugeAbi = parseAbi10(["function poolToGauge(address) external view returns (address)"]);
    const gaugeCalls = pairs.map((pair) => [
      this.voter,
      encodeFunctionData10({ abi: gaugeForPoolAbi, functionName: "gaugeForPool", args: [pair] })
    ]);
    let gaugeResults = await multicallRead3(this.rpcUrl, gaugeCalls);
    const allNullV2 = gaugeResults.every((r) => !r || decodeAddress2(r) === zeroAddress6 || decodeAddress2(r) === null);
    if (allNullV2) {
      const fallbackCalls = pairs.map((pair) => [
        this.voter,
        encodeFunctionData10({ abi: poolToGaugeAbi, functionName: "poolToGauge", args: [pair] })
      ]);
      gaugeResults = await multicallRead3(this.rpcUrl, fallbackCalls);
    }
    const gaugedPairs = [];
    for (let i = 0; i < pairs.length; i++) {
      const gauge = decodeAddress2(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress6) {
        gaugedPairs.push({ pair: pairs[i], gauge });
      }
    }
    if (gaugedPairs.length === 0) return;
    const metaCalls = [];
    for (const { pair } of gaugedPairs) {
      metaCalls.push([pair, encodeFunctionData10({ abi: pairAbi, functionName: "token0" })]);
      metaCalls.push([pair, encodeFunctionData10({ abi: pairAbi, functionName: "token1" })]);
      metaCalls.push([pair, encodeFunctionData10({ abi: pairAbi, functionName: "stable" })]);
    }
    const metaResults = await multicallRead3(this.rpcUrl, metaCalls);
    const tokenAddrs = /* @__PURE__ */ new Set();
    for (let i = 0; i < gaugedPairs.length; i++) {
      const t0 = decodeAddress2(metaResults[i * 3] ?? null);
      const t1 = decodeAddress2(metaResults[i * 3 + 1] ?? null);
      if (t0 && t0 !== zeroAddress6) tokenAddrs.add(t0);
      if (t1 && t1 !== zeroAddress6) tokenAddrs.add(t1);
    }
    const uniqueTokens = Array.from(tokenAddrs);
    const symbolCalls = uniqueTokens.map((t) => [
      t,
      encodeFunctionData10({ abi: erc20SymbolAbi, functionName: "symbol" })
    ]);
    const symbolResults = await multicallRead3(this.rpcUrl, symbolCalls);
    const symbolMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i], decodeSymbol2(symbolResults[i] ?? null));
    }
    for (let i = 0; i < gaugedPairs.length; i++) {
      const { pair, gauge } = gaugedPairs[i];
      const t0 = decodeAddress2(metaResults[i * 3] ?? null);
      const t1 = decodeAddress2(metaResults[i * 3 + 1] ?? null);
      const stableRaw = metaResults[i * 3 + 2];
      const stable = stableRaw ? decodeBoolean(stableRaw) : false;
      out.push({
        pool: pair,
        gauge,
        token0: t0 ? symbolMap.get(t0) ?? t0.slice(0, 10) : "?",
        token1: t1 ? symbolMap.get(t1) ?? t1.slice(0, 10) : "?",
        token0Addr: t0 ?? void 0,
        token1Addr: t1 ?? void 0,
        type: "V2",
        stable
      });
    }
  }
  async _discoverCLGaugedPools(out) {
    if (!this.rpcUrl || !this.clFactory) return;
    const clFactoryAbi = parseAbi10([
      "function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address pool)"
    ]);
    const algebraFactoryAbi2 = parseAbi10([
      "function poolByPair(address tokenA, address tokenB) external view returns (address pool)"
    ]);
    const poolAbi2 = parseAbi10([
      "function token0() external view returns (address)",
      "function token1() external view returns (address)"
    ]);
    const erc20SymbolAbi = parseAbi10(["function symbol() external view returns (string)"]);
    const gaugeForPoolAbi = parseAbi10(["function gaugeForPool(address) external view returns (address)"]);
    const poolToGaugeAbi = parseAbi10(["function poolToGauge(address) external view returns (address)"]);
    const tokenAddresses = this.tokens ?? Object.values(HYPEREVM_TOKENS);
    const pairs = [];
    for (let i = 0; i < tokenAddresses.length; i++) {
      for (let j = i + 1; j < tokenAddresses.length; j++) {
        pairs.push([tokenAddresses[i], tokenAddresses[j]]);
      }
    }
    const isAlgebra = await (async () => {
      try {
        const [result] = await multicallRead3(this.rpcUrl, [[
          this.clFactory,
          encodeFunctionData10({ abi: algebraFactoryAbi2, functionName: "poolByPair", args: [tokenAddresses[0], tokenAddresses[1]] })
        ]]);
        return result !== null && result.length >= 66;
      } catch {
        return false;
      }
    })();
    const getPoolCalls = [];
    const callMeta = [];
    if (isAlgebra) {
      for (let p = 0; p < pairs.length; p++) {
        const [tokenA, tokenB] = pairs[p];
        getPoolCalls.push([
          this.clFactory,
          encodeFunctionData10({ abi: algebraFactoryAbi2, functionName: "poolByPair", args: [tokenA, tokenB] })
        ]);
        callMeta.push({ pairIdx: p, tickSpacing: 0 });
      }
    } else {
      for (let p = 0; p < pairs.length; p++) {
        const [tokenA, tokenB] = pairs[p];
        for (const ts of CL_TICK_SPACINGS) {
          getPoolCalls.push([
            this.clFactory,
            encodeFunctionData10({ abi: clFactoryAbi, functionName: "getPool", args: [tokenA, tokenB, ts] })
          ]);
          callMeta.push({ pairIdx: p, tickSpacing: ts });
        }
      }
    }
    const getPoolResults = await multicallRead3(this.rpcUrl, getPoolCalls);
    const candidatePools = [];
    for (let i = 0; i < getPoolCalls.length; i++) {
      const pool = decodeAddress2(getPoolResults[i] ?? null);
      if (pool && pool !== zeroAddress6) {
        const { pairIdx, tickSpacing } = callMeta[i];
        const [tokenA, tokenB] = pairs[pairIdx];
        candidatePools.push({ pool, tokenA, tokenB, tickSpacing });
      }
    }
    if (candidatePools.length === 0) return;
    const gaugeCalls = candidatePools.map(({ pool }) => [
      this.voter,
      encodeFunctionData10({ abi: gaugeForPoolAbi, functionName: "gaugeForPool", args: [pool] })
    ]);
    let gaugeResults = await multicallRead3(this.rpcUrl, gaugeCalls);
    const allNull = gaugeResults.every((r) => !r || decodeAddress2(r) === zeroAddress6 || decodeAddress2(r) === null);
    if (allNull) {
      const fallbackCalls = candidatePools.map(({ pool }) => [
        this.voter,
        encodeFunctionData10({ abi: poolToGaugeAbi, functionName: "poolToGauge", args: [pool] })
      ]);
      gaugeResults = await multicallRead3(this.rpcUrl, fallbackCalls);
    }
    const gaugedCL = [];
    for (let i = 0; i < candidatePools.length; i++) {
      const gauge = decodeAddress2(gaugeResults[i] ?? null);
      if (gauge && gauge !== zeroAddress6) {
        gaugedCL.push({ ...candidatePools[i], gauge });
      }
    }
    if (gaugedCL.length === 0) return;
    const tokenAddrsInPools = /* @__PURE__ */ new Set();
    for (const { tokenA, tokenB } of gaugedCL) {
      tokenAddrsInPools.add(tokenA);
      tokenAddrsInPools.add(tokenB);
    }
    const uniqueTokens = Array.from(tokenAddrsInPools);
    const symbolCalls = uniqueTokens.map((t) => [
      t,
      encodeFunctionData10({ abi: erc20SymbolAbi, functionName: "symbol" })
    ]);
    const symbolResults = await multicallRead3(this.rpcUrl, symbolCalls);
    const symbolMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i], decodeSymbol2(symbolResults[i] ?? null));
    }
    const poolTokenCalls = [];
    for (const { pool } of gaugedCL) {
      poolTokenCalls.push([pool, encodeFunctionData10({ abi: poolAbi2, functionName: "token0" })]);
      poolTokenCalls.push([pool, encodeFunctionData10({ abi: poolAbi2, functionName: "token1" })]);
    }
    const poolTokenResults = await multicallRead3(this.rpcUrl, poolTokenCalls);
    for (let i = 0; i < gaugedCL.length; i++) {
      const { pool, gauge, tokenA, tokenB, tickSpacing } = gaugedCL[i];
      const rawT0 = decodeAddress2(poolTokenResults[i * 2] ?? null);
      const rawT1 = decodeAddress2(poolTokenResults[i * 2 + 1] ?? null);
      const t0 = rawT0 && rawT0 !== zeroAddress6 ? rawT0 : tokenA;
      const t1 = rawT1 && rawT1 !== zeroAddress6 ? rawT1 : tokenB;
      out.push({
        pool,
        gauge,
        token0: symbolMap.get(t0) ?? t0.slice(0, 10),
        token1: symbolMap.get(t1) ?? t1.slice(0, 10),
        token0Addr: t0,
        token1Addr: t1,
        type: "CL",
        tickSpacing
      });
    }
  }
  // IGauge
  async buildDeposit(gauge, amount, tokenId, lpToken) {
    if (tokenId !== void 0) {
      const data2 = encodeFunctionData10({
        abi: gaugeAbi,
        functionName: "depositFor",
        args: [amount, tokenId]
      });
      return {
        description: `[${this.protocolName}] Deposit ${amount} LP to gauge (boost veNFT #${tokenId})`,
        to: gauge,
        data: data2,
        value: 0n,
        gas_estimate: 2e5,
        approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : void 0
      };
    }
    const data = encodeFunctionData10({
      abi: gaugeAbi,
      functionName: "deposit",
      args: [amount]
    });
    return {
      description: `[${this.protocolName}] Deposit ${amount} LP to gauge`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 2e5,
      approvals: lpToken ? [{ token: lpToken, spender: gauge, amount }] : void 0
    };
  }
  async buildWithdraw(gauge, amount) {
    const data = encodeFunctionData10({
      abi: gaugeAbi,
      functionName: "withdraw",
      args: [amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from gauge`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Resolve gauge address from a pool address via voter contract.
   * Tries gaugeForPool (Ramses), poolToGauge (NEST), gauges (classic Solidly).
   */
  async resolveGauge(pool) {
    if (!this.rpcUrl) throw DefiError10.rpcError("RPC URL required for gauge lookup");
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    for (const fn of ["gaugeForPool", "poolToGauge", "gauges"]) {
      try {
        const gauge = await client.readContract({
          address: this.voter,
          abi: voterAbi2,
          functionName: fn,
          args: [pool]
        });
        if (gauge !== zeroAddress6) return gauge;
      } catch {
      }
    }
    throw new DefiError10("CONTRACT_ERROR", `[${this.protocolName}] No gauge found for pool ${pool}`);
  }
  /**
   * Discover reward tokens for a gauge.
   * Returns { tokens, multiToken } where multiToken indicates getReward(account, tokens[]) support.
   */
  async discoverRewardTokens(gauge) {
    if (!this.rpcUrl) return { tokens: [], multiToken: false };
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    try {
      const len = await client.readContract({
        address: gauge,
        abi: gaugeAbi,
        functionName: "rewardsListLength"
      });
      if (Number(len) > 0) {
        const candidates = [
          "0x5555555555555555555555555555555555555555",
          // WHYPE
          "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555",
          // xRAM
          "0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8",
          // HYBR
          "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035"
          // NEST token
        ];
        const found = [];
        for (const token of candidates) {
          try {
            const rd = await client.readContract({
              address: gauge,
              abi: gaugeAbi,
              functionName: "rewardData",
              args: [token]
            });
            if (rd[0] > 0n || rd[1] > 0n) found.push(token);
          } catch {
          }
        }
        if (found.length > 0) return { tokens: found, multiToken: true };
        return { tokens: [], multiToken: true };
      }
    } catch {
    }
    try {
      const rt = await client.readContract({
        address: gauge,
        abi: gaugeAbi,
        functionName: "rewardToken"
      });
      if (rt !== zeroAddress6) return { tokens: [rt], multiToken: false };
    } catch {
    }
    return { tokens: [], multiToken: false };
  }
  async buildClaimRewards(gauge, account) {
    if (!this.rpcUrl || !account) {
      const data2 = encodeFunctionData10({
        abi: gaugeAbi,
        functionName: "getReward",
        args: [account ?? zeroAddress6]
      });
      return { description: `[${this.protocolName}] Claim gauge rewards`, to: gauge, data: data2, value: 0n, gas_estimate: 2e5 };
    }
    const { tokens, multiToken } = await this.discoverRewardTokens(gauge);
    if (multiToken && tokens.length > 0) {
      const data2 = encodeFunctionData10({
        abi: gaugeAbi,
        functionName: "getReward",
        args: [account, tokens]
      });
      return {
        description: `[${this.protocolName}] Claim gauge rewards (${tokens.length} tokens)`,
        to: gauge,
        data: data2,
        value: 0n,
        gas_estimate: 3e5
      };
    }
    const data = encodeFunctionData10({
      abi: gaugeAbi,
      functionName: "getReward",
      args: []
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Claim rewards for a CL gauge by NFT tokenId (Hybra V4 style).
   */
  async buildClaimRewardsByTokenId(gauge, tokenId) {
    const data = encodeFunctionData10({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [tokenId]
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards for NFT #${tokenId}`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async getPendingRewards(gauge, user) {
    if (!this.rpcUrl) throw DefiError10.rpcError("RPC URL required");
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    const results = [];
    const { tokens, multiToken } = await this.discoverRewardTokens(gauge);
    if (multiToken && tokens.length > 0) {
      for (const token of tokens) {
        try {
          const earned = await client.readContract({
            address: gauge,
            abi: gaugeAbi,
            functionName: "earned",
            args: [token, user]
          });
          results.push({ token, symbol: token.slice(0, 10), amount: earned });
        } catch {
        }
      }
    } else if (tokens.length > 0) {
      try {
        const earned = await client.readContract({
          address: gauge,
          abi: gaugeAbi,
          functionName: "earned",
          args: [user]
        });
        results.push({ token: tokens[0], symbol: tokens[0].slice(0, 10), amount: earned });
      } catch {
      }
    } else {
      try {
        const earned = await client.readContract({
          address: gauge,
          abi: gaugeAbi,
          functionName: "earned",
          args: [user]
        });
        results.push({ token: zeroAddress6, symbol: "unknown", amount: earned });
      } catch {
      }
    }
    return results;
  }
  /**
   * Get pending rewards for a CL gauge NFT position (Hybra V4 style).
   */
  async getPendingRewardsByTokenId(gauge, tokenId) {
    if (!this.rpcUrl) throw DefiError10.rpcError("RPC URL required");
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    return await client.readContract({
      address: gauge,
      abi: gaugeAbi,
      functionName: "earned",
      args: [tokenId]
    });
  }
  /**
   * Get pending rewards for an Aerodrome Slipstream CL gauge NFT position.
   * Uses the earned(address account, uint256 tokenId) overload, which is required
   * for CL gauges — the single-param earned(address) reverts on these contracts.
   */
  async getPendingRewardsByCLTokenId(gauge, user, tokenId) {
    if (!this.rpcUrl) throw DefiError10.rpcError("RPC URL required");
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    return await client.readContract({
      address: gauge,
      abi: gaugeAbi,
      functionName: "earned",
      args: [user, tokenId]
    });
  }
  // IVoteEscrow
  async buildCreateLock(amount, lockDuration) {
    const data = encodeFunctionData10({
      abi: veAbi2,
      functionName: "create_lock",
      args: [amount, BigInt(lockDuration)]
    });
    return {
      description: `[${this.protocolName}] Create veNFT lock: ${amount} tokens for ${lockDuration}s`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildIncreaseAmount(tokenId, amount) {
    const data = encodeFunctionData10({
      abi: veAbi2,
      functionName: "increase_amount",
      args: [tokenId, amount]
    });
    return {
      description: `[${this.protocolName}] Increase veNFT #${tokenId} by ${amount}`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildIncreaseUnlockTime(tokenId, lockDuration) {
    const data = encodeFunctionData10({
      abi: veAbi2,
      functionName: "increase_unlock_time",
      args: [tokenId, BigInt(lockDuration)]
    });
    return {
      description: `[${this.protocolName}] Extend veNFT #${tokenId} lock by ${lockDuration}s`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildWithdrawExpired(tokenId) {
    const data = encodeFunctionData10({
      abi: veAbi2,
      functionName: "withdraw",
      args: [tokenId]
    });
    return {
      description: `[${this.protocolName}] Withdraw expired veNFT #${tokenId}`,
      to: this.veToken,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  // IVoter
  async buildVote(tokenId, pools, weights) {
    const data = encodeFunctionData10({
      abi: voterAbi2,
      functionName: "vote",
      args: [tokenId, pools, weights]
    });
    return {
      description: `[${this.protocolName}] Vote with veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 5e5
    };
  }
  async buildClaimBribes(bribes, tokenId) {
    const tokensPerBribe = bribes.map(() => []);
    const data = encodeFunctionData10({
      abi: voterAbi2,
      functionName: "claimBribes",
      args: [bribes, tokensPerBribe, tokenId]
    });
    return {
      description: `[${this.protocolName}] Claim bribes for veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildClaimFees(fees, tokenId) {
    const tokensPerFee = fees.map(() => []);
    const data = encodeFunctionData10({
      abi: voterAbi2,
      functionName: "claimFees",
      args: [fees, tokensPerFee, tokenId]
    });
    return {
      description: `[${this.protocolName}] Claim trading fees for veNFT #${tokenId}`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
};

// src/dex/masterchef.ts
import { encodeFunctionData as encodeFunctionData11, parseAbi as parseAbi11, createPublicClient as createPublicClient7, http as http7 } from "viem";
import { DefiError as DefiError11 } from "@hypurrquant/defi-core";
var masterchefAbi = parseAbi11([
  "function deposit(uint256 pid, uint256 amount) external",
  "function withdraw(uint256 pid, uint256 amount) external",
  "function claim(uint256[] calldata pids) external",
  "function pendingRewards(address account, uint256[] calldata pids) view returns (uint256[] memory moeRewards)",
  "function getNumberOfFarms() view returns (uint256)",
  "function getPidByPool(address pool) view returns (uint256)"
]);
var MasterChefAdapter = class {
  protocolName;
  masterchef;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const masterchef = entry.contracts?.["masterchef"];
    if (!masterchef) {
      throw new DefiError11("CONTRACT_ERROR", "Missing 'masterchef' contract");
    }
    this.masterchef = masterchef;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  /**
   * Deposit LP tokens into a MasterChef farm.
   * `gauge` is the pool address (unused for calldata — MasterChef is the target).
   * `tokenId` carries the farm pid.
   */
  async buildDeposit(gauge, amount, tokenId) {
    const pid = tokenId ?? 0n;
    const data = encodeFunctionData11({
      abi: masterchefAbi,
      functionName: "deposit",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Deposit ${amount} LP to farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Withdraw LP tokens from a MasterChef farm.
   * `gauge` is used to look up the pid description only; call site should pass pid via tokenId
   * on the deposit flow. Here pid defaults to 0 — callers should encode the pid in the gauge
   * address slot or wrap this adapter with a pid-aware helper.
   */
  async buildWithdraw(gauge, amount) {
    const pid = 0n;
    const data = encodeFunctionData11({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Withdraw LP tokens specifying a pid explicitly (MasterChef extension beyond IGauge). */
  async buildWithdrawPid(pid, amount) {
    const data = encodeFunctionData11({
      abi: masterchefAbi,
      functionName: "withdraw",
      args: [pid, amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${amount} LP from farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Claim pending MOE rewards. IGauge interface provides no pid — defaults to pid=0. */
  async buildClaimRewards(gauge) {
    const pid = 0n;
    const data = encodeFunctionData11({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]]
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid} (pool ${gauge})`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Claim pending MOE rewards for a specific pid (MasterChef extension beyond IGauge). */
  async buildClaimRewardsPid(pid) {
    const data = encodeFunctionData11({
      abi: masterchefAbi,
      functionName: "claim",
      args: [[pid]]
    });
    return {
      description: `[${this.protocolName}] Claim MOE rewards for farm pid=${pid}`,
      to: this.masterchef,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /** Get pending MOE rewards for a user. Requires rpcUrl. */
  async getPendingRewards(_gauge, user) {
    if (!this.rpcUrl) {
      throw DefiError11.unsupported(`[${this.protocolName}] getPendingRewards requires RPC`);
    }
    const client = createPublicClient7({ transport: http7(this.rpcUrl) });
    const rewards = await client.readContract({
      address: this.masterchef,
      abi: masterchefAbi,
      functionName: "pendingRewards",
      args: [user, [0n]]
    });
    return rewards.map((amount) => ({
      token: this.masterchef,
      symbol: "MOE",
      amount
    }));
  }
};

// src/dex/merchant_moe_lb.ts
import {
  encodeFunctionData as encodeFunctionData12,
  decodeFunctionResult as decodeFunctionResult4,
  parseAbi as parseAbi12,
  createPublicClient as createPublicClient8,
  http as http8
} from "viem";
import { DefiError as DefiError12, multicallRead as multicallRead4 } from "@hypurrquant/defi-core";
var lbRouterAbi = parseAbi12([
  "struct LiquidityParameters { address tokenX; address tokenY; uint256 binStep; uint256 amountX; uint256 amountY; uint256 amountXMin; uint256 amountYMin; uint256 activeIdDesired; uint256 idSlippage; int256[] deltaIds; uint256[] distributionX; uint256[] distributionY; address to; address refundTo; uint256 deadline; }",
  "function addLiquidity(LiquidityParameters calldata liquidityParameters) external returns (uint256 amountXAdded, uint256 amountYAdded, uint256 amountXLeft, uint256 amountYLeft, uint256[] memory depositIds, uint256[] memory liquidityMinted)",
  "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] memory ids, uint256[] memory amounts, address to, uint256 deadline) external returns (uint256 amountX, uint256 amountY)"
]);
var lbFactoryAbi = parseAbi12([
  "function getNumberOfLBPairs() external view returns (uint256)",
  "function getLBPairAtIndex(uint256 index) external view returns (address)"
]);
var lbPairAbi = parseAbi12([
  "function getLBHooksParameters() external view returns (bytes32)",
  "function getActiveId() external view returns (uint24)",
  "function getBinStep() external view returns (uint16)",
  "function getTokenX() external view returns (address)",
  "function getTokenY() external view returns (address)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)"
]);
var lbRewarderAbi = parseAbi12([
  "function getRewardToken() external view returns (address)",
  "function getRewardedRange() external view returns (uint256 minBinId, uint256 maxBinId)",
  "function getPendingRewards(address user, uint256[] calldata ids) external view returns (uint256 pendingRewards)",
  "function claim(address user, uint256[] calldata ids) external",
  "function getPid() external view returns (uint256)",
  "function isStopped() external view returns (bool)",
  "function getLBPair() external view returns (address)",
  "function getMasterChef() external view returns (address)"
]);
var masterChefAbi = parseAbi12([
  "function getMoePerSecond() external view returns (uint256)",
  "function getTreasuryShare() external view returns (uint256)",
  "function getStaticShare() external view returns (uint256)",
  "function getVeMoe() external view returns (address)"
]);
var veMoeAbi = parseAbi12([
  "function getWeight(uint256 pid) external view returns (uint256)",
  "function getTotalWeight() external view returns (uint256)",
  "function getTopPoolIds() external view returns (uint256[] memory)"
]);
var lbPairBinAbi = parseAbi12([
  "function getBin(uint24 id) external view returns (uint128 reserveX, uint128 reserveY)",
  "function getActiveId() external view returns (uint24)"
]);
var lbQuoterAbi2 = parseAbi12([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
]);
var erc20Abi = parseAbi12([
  "function symbol() external view returns (string)",
  "function balanceOf(address account) external view returns (uint256)"
]);
var _addressAbi = parseAbi12(["function f() external view returns (address)"]);
function decodeAddressResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _addressAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256Abi = parseAbi12(["function f() external view returns (uint256)"]);
function decodeUint256Result(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _uint256Abi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _boolAbi = parseAbi12(["function f() external view returns (bool)"]);
function decodeBoolResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _boolAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function decodeStringResult(data) {
  if (!data) return "?";
  try {
    return decodeFunctionResult4({ abi: erc20Abi, functionName: "symbol", data });
  } catch {
    return "?";
  }
}
var _rangeAbi = parseAbi12(["function f() external view returns (uint256 minBinId, uint256 maxBinId)"]);
function decodeRangeResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _rangeAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _binAbi = parseAbi12(["function f() external view returns (uint128 reserveX, uint128 reserveY)"]);
function decodeBinResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _binAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256ArrayAbi = parseAbi12(["function f() external view returns (uint256[] memory)"]);
function decodeUint256ArrayResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({ abi: _uint256ArrayAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function extractRewarderAddress(hooksParams) {
  if (!hooksParams || hooksParams === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return null;
  }
  const hex = hooksParams.slice(2);
  if (hex.length < 64) return null;
  const addrHex = hex.slice(24, 64);
  if (addrHex === "0000000000000000000000000000000000000000") return null;
  return `0x${addrHex}`;
}
function buildUniformDistribution(deltaIds) {
  const PRECISION = 10n ** 18n;
  const n = deltaIds.length;
  const xBins = deltaIds.filter((d) => d >= 0).length;
  const yBins = deltaIds.filter((d) => d <= 0).length;
  const distributionX = [];
  const distributionY = [];
  for (const delta of deltaIds) {
    const xShare = delta >= 0 && xBins > 0 ? PRECISION / BigInt(xBins) : 0n;
    const yShare = delta <= 0 && yBins > 0 ? PRECISION / BigInt(yBins) : 0n;
    distributionX.push(xShare);
    distributionY.push(yShare);
  }
  const xSum = distributionX.reduce((a, b) => a + b, 0n);
  const ySum = distributionY.reduce((a, b) => a + b, 0n);
  if (xSum > 0n && xSum !== PRECISION) {
    const firstX = distributionX.findIndex((v) => v > 0n);
    if (firstX !== -1) distributionX[firstX] += PRECISION - xSum;
  }
  if (ySum > 0n && ySum !== PRECISION) {
    const firstY = distributionY.findIndex((v) => v > 0n);
    if (firstY !== -1) distributionY[firstY] += PRECISION - ySum;
  }
  return { distributionX, distributionY };
}
var MerchantMoeLBAdapter = class {
  protocolName;
  lbRouter;
  lbFactory;
  lbQuoter;
  rpcUrl;
  /** WMNT address (lb_mid_wmnt in config) used for MOE price routing */
  wmnt;
  /** USDT address (lb_mid_usdt in config) used for MNT/USD price routing */
  usdt;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const lbRouter = entry.contracts?.["lb_router"];
    if (!lbRouter) {
      throw new DefiError12("CONTRACT_ERROR", "Missing 'lb_router' contract address");
    }
    const lbFactory = entry.contracts?.["lb_factory"];
    if (!lbFactory) {
      throw new DefiError12("CONTRACT_ERROR", "Missing 'lb_factory' contract address");
    }
    this.lbRouter = lbRouter;
    this.lbFactory = lbFactory;
    this.lbQuoter = entry.contracts?.["lb_quoter"];
    this.wmnt = entry.contracts?.["lb_mid_wmnt"];
    this.usdt = entry.contracts?.["lb_mid_usdt"];
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  requireRpc() {
    if (!this.rpcUrl) {
      throw DefiError12.rpcError(`[${this.protocolName}] RPC URL required`);
    }
    return this.rpcUrl;
  }
  /**
   * Build an addLiquidity transaction for a Liquidity Book pair.
   * Distributes tokenX/tokenY uniformly across active bin ± numBins.
   */
  async buildAddLiquidity(params) {
    const numBins = params.numBins ?? 5;
    const deadline = params.deadline ?? BigInt("18446744073709551615");
    let activeIdDesired = params.activeIdDesired;
    if (activeIdDesired === void 0) {
      const rpcUrl = this.requireRpc();
      const client = createPublicClient8({ transport: http8(rpcUrl) });
      const activeId = await client.readContract({
        address: params.pool,
        abi: lbPairAbi,
        functionName: "getActiveId"
      });
      activeIdDesired = activeId;
    }
    const deltaIds = [];
    for (let d = -numBins; d <= numBins; d++) {
      deltaIds.push(d);
    }
    const { distributionX, distributionY } = buildUniformDistribution(deltaIds);
    const data = encodeFunctionData12({
      abi: lbRouterAbi,
      functionName: "addLiquidity",
      args: [
        {
          tokenX: params.tokenX,
          tokenY: params.tokenY,
          binStep: BigInt(params.binStep),
          amountX: params.amountX,
          amountY: params.amountY,
          amountXMin: 0n,
          amountYMin: 0n,
          activeIdDesired: BigInt(activeIdDesired),
          idSlippage: BigInt(numBins + 2),
          deltaIds: deltaIds.map(BigInt),
          distributionX,
          distributionY,
          to: params.recipient,
          refundTo: params.recipient,
          deadline
        }
      ]
    });
    return {
      description: `[${this.protocolName}] LB addLiquidity ${params.amountX} tokenX + ${params.amountY} tokenY across ${deltaIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 8e5,
      approvals: [
        { token: params.tokenX, spender: this.lbRouter, amount: params.amountX },
        { token: params.tokenY, spender: this.lbRouter, amount: params.amountY }
      ]
    };
  }
  /**
   * Build a removeLiquidity transaction for specific LB bins.
   */
  async buildRemoveLiquidity(params) {
    const deadline = params.deadline ?? BigInt("18446744073709551615");
    const data = encodeFunctionData12({
      abi: lbRouterAbi,
      functionName: "removeLiquidity",
      args: [
        params.tokenX,
        params.tokenY,
        params.binStep,
        params.amountXMin ?? 0n,
        params.amountYMin ?? 0n,
        params.binIds.map(BigInt),
        params.amounts,
        params.recipient,
        deadline
      ]
    });
    return {
      description: `[${this.protocolName}] LB removeLiquidity from ${params.binIds.length} bins`,
      to: this.lbRouter,
      data,
      value: 0n,
      gas_estimate: 6e5
    };
  }
  /**
   * Auto-detect bin IDs for a pool from the rewarder's rewarded range.
   * Falls back to active bin ± 50 scan if no rewarder exists.
   */
  async autoDetectBins(pool) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient8({ transport: http8(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (rewarder) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      const ids2 = [];
      for (let b = min; b <= max; b++) ids2.push(b);
      return ids2;
    }
    const activeId = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getActiveId"
    });
    const ids = [];
    for (let b = activeId - 50; b <= activeId + 50; b++) ids.push(b);
    return ids;
  }
  /**
   * Get pending MOE rewards for a user across specified bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   * Reads the rewarder address from the pool's hooks parameters.
   */
  async getPendingRewards(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient8({ transport: http8(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      return [];
    }
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }
    const [pending, rewardToken] = await Promise.all([
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getPendingRewards",
        args: [user, resolvedBinIds.map(BigInt)]
      }),
      client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardToken"
      })
    ]);
    return [
      {
        token: rewardToken,
        symbol: "MOE",
        amount: pending
      }
    ];
  }
  /**
   * Build a claim rewards transaction for specific LB bins.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range.
   */
  async buildClaimRewards(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient8({ transport: http8(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      throw new DefiError12("CONTRACT_ERROR", `[${this.protocolName}] Pool ${pool} has no active rewarder`);
    }
    let resolvedBinIds = binIds;
    if (!resolvedBinIds || resolvedBinIds.length === 0) {
      const range = await client.readContract({
        address: rewarder,
        abi: lbRewarderAbi,
        functionName: "getRewardedRange"
      });
      const min = Number(range[0]);
      const max = Number(range[1]);
      resolvedBinIds = [];
      for (let b = min; b <= max; b++) resolvedBinIds.push(b);
    }
    const data = encodeFunctionData12({
      abi: lbRewarderAbi,
      functionName: "claim",
      args: [user, resolvedBinIds.map(BigInt)]
    });
    return {
      description: `[${this.protocolName}] LB claim rewards for ${resolvedBinIds.length} bins`,
      to: rewarder,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  /**
   * Discover all active rewarded LB pools by iterating the factory.
   * Uses 7 multicall batches to minimise RPC round-trips and avoid 429s.
   *
   * Batch 1: getNumberOfLBPairs(), then getLBPairAtIndex(i) for all i
   * Batch 2: getLBHooksParameters() for all pairs → extract rewarder addresses
   * Batch 3: isStopped/getRewardedRange/getRewardToken/getPid/getMasterChef for each rewarder
   * Batch 4: getTokenX/getTokenY for each rewarded pair, then symbol() for unique tokens
   * Batch 5: Bootstrap MasterChef→VeMoe, then getMoePerSecond/getTreasuryShare/getStaticShare/getTotalWeight/getTopPoolIds
   * Batch 6: VeMoe.getWeight(pid) for each rewarded pool
   * Batch 7: Pool.getBin(binId) for all bins in rewarded range of each pool
   * Price: LB Quoter findBestPathFromAmountIn for MOE/WMNT and WMNT/USDT prices
   */
  async discoverRewardedPools() {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient8({ transport: http8(rpcUrl) });
    const pairCount = await client.readContract({
      address: this.lbFactory,
      abi: lbFactoryAbi,
      functionName: "getNumberOfLBPairs"
    });
    const count = Number(pairCount);
    if (count === 0) return [];
    const batch1Calls = Array.from({ length: count }, (_, i) => [
      this.lbFactory,
      encodeFunctionData12({ abi: lbFactoryAbi, functionName: "getLBPairAtIndex", args: [BigInt(i)] })
    ]);
    const batch1Results = await multicallRead4(rpcUrl, batch1Calls);
    const pairAddresses = batch1Results.map((r) => decodeAddressResult(r)).filter((a) => a !== null);
    if (pairAddresses.length === 0) return [];
    const batch2Calls = pairAddresses.map((pair) => [
      pair,
      encodeFunctionData12({ abi: lbPairAbi, functionName: "getLBHooksParameters" })
    ]);
    const batch2Results = await multicallRead4(rpcUrl, batch2Calls);
    const rewardedPairs = [];
    for (let i = 0; i < pairAddresses.length; i++) {
      const raw = batch2Results[i];
      if (!raw) continue;
      let hooksBytes;
      try {
        const _bytes32Abi = parseAbi12(["function f() external view returns (bytes32)"]);
        hooksBytes = decodeFunctionResult4({ abi: _bytes32Abi, functionName: "f", data: raw });
      } catch {
        continue;
      }
      const rewarder = extractRewarderAddress(hooksBytes);
      if (rewarder) {
        rewardedPairs.push({ pool: pairAddresses[i], rewarder });
      }
    }
    if (rewardedPairs.length === 0) return [];
    const batch3Calls = [];
    for (const { rewarder } of rewardedPairs) {
      batch3Calls.push([rewarder, encodeFunctionData12({ abi: lbRewarderAbi, functionName: "isStopped" })]);
      batch3Calls.push([rewarder, encodeFunctionData12({ abi: lbRewarderAbi, functionName: "getRewardedRange" })]);
      batch3Calls.push([rewarder, encodeFunctionData12({ abi: lbRewarderAbi, functionName: "getRewardToken" })]);
      batch3Calls.push([rewarder, encodeFunctionData12({ abi: lbRewarderAbi, functionName: "getPid" })]);
      batch3Calls.push([rewarder, encodeFunctionData12({ abi: lbRewarderAbi, functionName: "getMasterChef" })]);
    }
    const batch3Results = await multicallRead4(rpcUrl, batch3Calls);
    const batch4aCalls = [];
    for (const { pool } of rewardedPairs) {
      batch4aCalls.push([pool, encodeFunctionData12({ abi: lbPairAbi, functionName: "getTokenX" })]);
      batch4aCalls.push([pool, encodeFunctionData12({ abi: lbPairAbi, functionName: "getTokenY" })]);
    }
    const batch4aResults = await multicallRead4(rpcUrl, batch4aCalls);
    const tokenXAddresses = [];
    const tokenYAddresses = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      tokenXAddresses.push(decodeAddressResult(batch4aResults[i * 2] ?? null));
      tokenYAddresses.push(decodeAddressResult(batch4aResults[i * 2 + 1] ?? null));
    }
    const uniqueTokens = Array.from(
      new Set([...tokenXAddresses, ...tokenYAddresses].filter((a) => a !== null))
    );
    const batch4bCalls = uniqueTokens.map((token) => [
      token,
      encodeFunctionData12({ abi: erc20Abi, functionName: "symbol" })
    ]);
    const batch4bResults = await multicallRead4(rpcUrl, batch4bCalls);
    const symbolMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < uniqueTokens.length; i++) {
      symbolMap.set(uniqueTokens[i], decodeStringResult(batch4bResults[i] ?? null));
    }
    const STRIDE3 = 5;
    const poolData = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const base = i * STRIDE3;
      poolData.push({
        stopped: decodeBoolResult(batch3Results[base] ?? null) ?? false,
        range: decodeRangeResult(batch3Results[base + 1] ?? null),
        rewardToken: decodeAddressResult(batch3Results[base + 2] ?? null),
        pid: Number(decodeUint256Result(batch3Results[base + 3] ?? null) ?? 0n),
        masterChef: decodeAddressResult(batch3Results[base + 4] ?? null)
      });
    }
    const masterChefAddr = poolData.map((d) => d.masterChef).find((a) => a !== null) ?? null;
    let moePerDay = 0;
    let topPoolIds = /* @__PURE__ */ new Set();
    let totalWeightRaw = 0n;
    let veMoeAddr = null;
    if (masterChefAddr) {
      veMoeAddr = await client.readContract({
        address: masterChefAddr,
        abi: masterChefAbi,
        functionName: "getVeMoe"
      });
      const batch5Calls = [
        [masterChefAddr, encodeFunctionData12({ abi: masterChefAbi, functionName: "getMoePerSecond" })],
        [masterChefAddr, encodeFunctionData12({ abi: masterChefAbi, functionName: "getTreasuryShare" })],
        [masterChefAddr, encodeFunctionData12({ abi: masterChefAbi, functionName: "getStaticShare" })],
        [veMoeAddr, encodeFunctionData12({ abi: veMoeAbi, functionName: "getTotalWeight" })],
        [veMoeAddr, encodeFunctionData12({ abi: veMoeAbi, functionName: "getTopPoolIds" })]
      ];
      const batch5Results = await multicallRead4(rpcUrl, batch5Calls);
      const moePerSecRaw = decodeUint256Result(batch5Results[0] ?? null) ?? 0n;
      const treasuryShareRaw = decodeUint256Result(batch5Results[1] ?? null) ?? 0n;
      const staticShareRaw = decodeUint256Result(batch5Results[2] ?? null) ?? 0n;
      totalWeightRaw = decodeUint256Result(batch5Results[3] ?? null) ?? 0n;
      const topPoolIdsRaw = decodeUint256ArrayResult(batch5Results[4] ?? null) ?? [];
      topPoolIds = new Set(topPoolIdsRaw.map(Number));
      const PRECISION = 10n ** 18n;
      const netPerSec = moePerSecRaw * (PRECISION - treasuryShareRaw) / PRECISION * (PRECISION - staticShareRaw) / PRECISION;
      moePerDay = Number(netPerSec * 86400n) / 1e18;
    }
    const weightByPid = /* @__PURE__ */ new Map();
    if (veMoeAddr && rewardedPairs.length > 0) {
      const batch6Calls = poolData.map((d) => [
        veMoeAddr,
        encodeFunctionData12({ abi: veMoeAbi, functionName: "getWeight", args: [BigInt(d.pid)] })
      ]);
      const batch6Results = await multicallRead4(rpcUrl, batch6Calls);
      for (let i = 0; i < poolData.length; i++) {
        weightByPid.set(poolData[i].pid, decodeUint256Result(batch6Results[i] ?? null) ?? 0n);
      }
    }
    let moePriceUsd = 0;
    let wmntPriceUsd = 0;
    const MOE_ADDR = "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9";
    if (this.lbQuoter && this.wmnt && this.usdt) {
      try {
        const [moeWmntQuote, wmntUsdtQuote] = await Promise.all([
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi2,
            functionName: "findBestPathFromAmountIn",
            args: [[MOE_ADDR, this.wmnt], 10n ** 18n]
          }),
          client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi2,
            functionName: "findBestPathFromAmountIn",
            args: [[this.wmnt, this.usdt], 10n ** 18n]
          })
        ]);
        const moeInWmnt = Number(moeWmntQuote.amounts.at(-1) ?? 0n) / 1e18;
        wmntPriceUsd = Number(wmntUsdtQuote.amounts.at(-1) ?? 0n) / 1e6;
        moePriceUsd = moeInWmnt * wmntPriceUsd;
      } catch {
      }
    }
    const stableSymbols = /* @__PURE__ */ new Set(["USDT", "USDC", "USDT0", "MUSD", "AUSD", "USDY", "FDUSD", "USDe", "sUSDe"]);
    const mntSymbols = /* @__PURE__ */ new Set(["WMNT", "MNT"]);
    const moeSymbols = /* @__PURE__ */ new Set(["MOE"]);
    const sixDecimalStables = /* @__PURE__ */ new Set(["USDT", "USDC", "USDT0", "FDUSD"]);
    const tokenPriceMap = /* @__PURE__ */ new Map();
    const tokenDecimalsMap = /* @__PURE__ */ new Map();
    for (const [addr, sym] of symbolMap) {
      const key = addr.toLowerCase();
      if (stableSymbols.has(sym)) {
        tokenPriceMap.set(key, 1);
        tokenDecimalsMap.set(key, sixDecimalStables.has(sym) ? 6 : 18);
      } else if (mntSymbols.has(sym)) {
        tokenPriceMap.set(key, wmntPriceUsd);
        tokenDecimalsMap.set(key, 18);
      } else if (moeSymbols.has(sym)) {
        tokenPriceMap.set(key, moePriceUsd);
        tokenDecimalsMap.set(key, 18);
      }
    }
    const unknownTokenAddrs = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      for (const addr of [tokenXAddresses[i], tokenYAddresses[i]]) {
        if (addr && !tokenPriceMap.has(addr.toLowerCase())) {
          if (!unknownTokenAddrs.some((a) => a.toLowerCase() === addr.toLowerCase())) {
            unknownTokenAddrs.push(addr);
          }
        }
      }
    }
    if (unknownTokenAddrs.length > 0 && this.lbQuoter && this.wmnt && wmntPriceUsd > 0) {
      const erc20DecimalsAbi = parseAbi12(["function decimals() external view returns (uint8)"]);
      const decCalls = unknownTokenAddrs.map((addr) => [
        addr,
        encodeFunctionData12({ abi: erc20DecimalsAbi, functionName: "decimals" })
      ]);
      const decResults = await multicallRead4(rpcUrl, decCalls).catch(() => []);
      for (let i = 0; i < unknownTokenAddrs.length; i++) {
        const dec = decResults[i] ? Number(decodeUint256Result(decResults[i]) ?? 18n) : 18;
        tokenDecimalsMap.set(unknownTokenAddrs[i].toLowerCase(), dec);
      }
      const quotePromises = unknownTokenAddrs.map(async (tokenAddr) => {
        try {
          const dec = tokenDecimalsMap.get(tokenAddr.toLowerCase()) ?? 18;
          const quoteUnit = 10n ** BigInt(Math.max(dec - 2, 0));
          const quote = await client.readContract({
            address: this.lbQuoter,
            abi: lbQuoterAbi2,
            functionName: "findBestPathFromAmountIn",
            args: [[tokenAddr, this.wmnt], quoteUnit]
          });
          const amountOut = quote.amounts?.at(-1) ?? 0n;
          const priceInWmnt = Number(amountOut) / 1e18 * (10 ** dec / Number(quoteUnit));
          return { addr: tokenAddr, price: priceInWmnt * wmntPriceUsd };
        } catch {
          return { addr: tokenAddr, price: 0 };
        }
      });
      const priceResults = await Promise.all(quotePromises);
      for (const { addr, price } of priceResults) {
        if (price > 0) tokenPriceMap.set(addr.toLowerCase(), price);
      }
    }
    const getTokenPriceUsd = (_sym, addr) => {
      return tokenPriceMap.get(addr.toLowerCase()) ?? 0;
    };
    const getTokenDecimals = (_sym, addr) => {
      return tokenDecimalsMap.get(addr.toLowerCase()) ?? 18;
    };
    const binRequests = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const range = poolData[i].range;
      if (!range) continue;
      const minBin = Number(range[0]);
      const maxBin = Number(range[1]);
      for (let b = minBin; b <= maxBin; b++) {
        binRequests.push({ poolIdx: i, binId: b });
      }
    }
    const binReservesX = /* @__PURE__ */ new Map();
    const binReservesY = /* @__PURE__ */ new Map();
    if (binRequests.length > 0) {
      const batch7Calls = binRequests.map(({ poolIdx, binId }) => [
        rewardedPairs[poolIdx].pool,
        encodeFunctionData12({ abi: lbPairBinAbi, functionName: "getBin", args: [binId] })
      ]);
      const batch7Results = await multicallRead4(rpcUrl, batch7Calls);
      for (let j = 0; j < binRequests.length; j++) {
        const { poolIdx, binId } = binRequests[j];
        const decoded = decodeBinResult(batch7Results[j] ?? null);
        if (!decoded) continue;
        if (!binReservesX.has(poolIdx)) {
          binReservesX.set(poolIdx, /* @__PURE__ */ new Map());
          binReservesY.set(poolIdx, /* @__PURE__ */ new Map());
        }
        binReservesX.get(poolIdx).set(binId, decoded[0]);
        binReservesY.get(poolIdx).set(binId, decoded[1]);
      }
    }
    const poolBalanceX = /* @__PURE__ */ new Map();
    const poolBalanceY = /* @__PURE__ */ new Map();
    {
      const balCalls = [];
      for (let i = 0; i < rewardedPairs.length; i++) {
        const tx = tokenXAddresses[i];
        const ty = tokenYAddresses[i];
        const pool = rewardedPairs[i].pool;
        balCalls.push([tx ?? "0x0000000000000000000000000000000000000000", encodeFunctionData12({ abi: erc20Abi, functionName: "balanceOf", args: [pool] })]);
        balCalls.push([ty ?? "0x0000000000000000000000000000000000000000", encodeFunctionData12({ abi: erc20Abi, functionName: "balanceOf", args: [pool] })]);
      }
      const balResults = await multicallRead4(rpcUrl, balCalls).catch(() => []);
      for (let i = 0; i < rewardedPairs.length; i++) {
        poolBalanceX.set(i, decodeUint256Result(balResults[i * 2] ?? null) ?? 0n);
        poolBalanceY.set(i, decodeUint256Result(balResults[i * 2 + 1] ?? null) ?? 0n);
      }
    }
    const results = [];
    for (let i = 0; i < rewardedPairs.length; i++) {
      const { pool, rewarder } = rewardedPairs[i];
      const data = poolData[i];
      const tokenX = tokenXAddresses[i] ?? "0x0000000000000000000000000000000000000000";
      const tokenY = tokenYAddresses[i] ?? "0x0000000000000000000000000000000000000000";
      const symX = symbolMap.get(tokenX) ?? "?";
      const symY = symbolMap.get(tokenY) ?? "?";
      const isTopPool = topPoolIds.has(data.pid);
      const weight = weightByPid.get(data.pid) ?? 0n;
      let poolMoePerDay = 0;
      if (isTopPool && totalWeightRaw > 0n && weight > 0n) {
        poolMoePerDay = moePerDay * (Number(weight) / Number(totalWeightRaw));
      }
      const rxMap = binReservesX.get(i);
      const ryMap = binReservesY.get(i);
      const range = data.range;
      let rangeTvlUsd = 0;
      let rewardedBins = 0;
      if (range) {
        const minBin = Number(range[0]);
        const maxBin = Number(range[1]);
        rewardedBins = maxBin - minBin + 1;
        if (rxMap && ryMap) {
          const priceX2 = getTokenPriceUsd(symX, tokenX);
          const priceY2 = getTokenPriceUsd(symY, tokenY);
          const decX2 = getTokenDecimals(symX, tokenX);
          const decY2 = getTokenDecimals(symY, tokenY);
          for (let b = minBin; b <= maxBin; b++) {
            const rx = rxMap.get(b) ?? 0n;
            const ry = ryMap.get(b) ?? 0n;
            rangeTvlUsd += Number(rx) / 10 ** decX2 * priceX2;
            rangeTvlUsd += Number(ry) / 10 ** decY2 * priceY2;
          }
        }
      }
      const priceX = getTokenPriceUsd(symX, tokenX);
      const priceY = getTokenPriceUsd(symY, tokenY);
      const decX = getTokenDecimals(symX, tokenX);
      const decY = getTokenDecimals(symY, tokenY);
      const fullBalX = poolBalanceX.get(i) ?? 0n;
      const fullBalY = poolBalanceY.get(i) ?? 0n;
      const poolTvlUsd = Number(fullBalX) / 10 ** decX * priceX + Number(fullBalY) / 10 ** decY * priceY;
      const aprPercent = rangeTvlUsd > 0 && moePriceUsd > 0 ? poolMoePerDay * moePriceUsd * 365 / rangeTvlUsd * 100 : 0;
      results.push({
        pool,
        rewarder,
        rewardToken: data.rewardToken ?? "0x0000000000000000000000000000000000000000",
        minBinId: range ? Number(range[0]) : 0,
        maxBinId: range ? Number(range[1]) : 0,
        pid: data.pid,
        stopped: data.stopped,
        tokenX,
        tokenY,
        symbolX: symX,
        symbolY: symY,
        isTopPool,
        moePerDay: poolMoePerDay,
        rangeTvlUsd,
        poolTvlUsd,
        aprPercent,
        rewardedBins,
        totalMoePerDay: moePerDay,
        moePriceUsd
      });
    }
    return results;
  }
  /**
   * Get a user's LB positions (bin balances) across a range of bin IDs.
   * If binIds is omitted, auto-detects from the rewarder's rewarded range (or active ± 50).
   */
  async getUserPositions(user, pool, binIds) {
    const rpcUrl = this.requireRpc();
    const client = createPublicClient8({ transport: http8(rpcUrl) });
    const resolvedBinIds = binIds && binIds.length > 0 ? binIds : await this.autoDetectBins(pool);
    const accounts = resolvedBinIds.map(() => user);
    const ids = resolvedBinIds.map(BigInt);
    const balances = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "balanceOfBatch",
      args: [accounts, ids]
    });
    return resolvedBinIds.map((binId, i) => ({ binId, balance: balances[i] ?? 0n })).filter((p) => p.balance > 0n);
  }
};

// src/dex/kittenswap_farming.ts
import {
  decodeAbiParameters as decodeAbiParameters5,
  encodeFunctionData as encodeFunctionData13,
  encodeAbiParameters,
  http as http9,
  createPublicClient as createPublicClient9,
  keccak256,
  parseAbi as parseAbi13,
  decodeFunctionResult as decodeFunctionResult5,
  zeroAddress as zeroAddress7
} from "viem";
import { DefiError as DefiError13, multicallRead as multicallRead5 } from "@hypurrquant/defi-core";
var KITTEN_TOKEN = "0x618275f8efe54c2afa87bfb9f210a52f0ff89364";
var WHYPE_TOKEN = "0x5555555555555555555555555555555555555555";
var MAX_NONCE_SCAN = 60;
var HYPEREVM_TOKENS2 = [
  "0x5555555555555555555555555555555555555555",
  // WHYPE
  "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  // USDC
  "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  // USDT0
  "0xBe6727B535545C67d5cAa73dEa54865B92CF7907",
  // UETH
  "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463",
  // UBTC
  "0x111111a1a0667d36bD57c0A9f569b98057111111",
  // USDH
  "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  // USDe
  "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
  // sUSDe
  "0xf4D9235269a96aaDaFc9aDAe454a0618eBE37949",
  // XAUt0
  "0xfD739d4e423301CE9385c1fb8850539D657C296D",
  // kHYPE
  KITTEN_TOKEN
  // KITTEN
];
var farmingCenterAbi = parseAbi13([
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function enterFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function exitFarming((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function collectRewards((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external",
  "function claimReward(address rewardToken, address to, uint128 amountRequested) external returns (uint256 reward)"
]);
var positionManagerAbi2 = parseAbi13([
  "function approveForFarming(uint256 tokenId, bool approve, address farmingAddress) external",
  "function farmingApprovals(uint256 tokenId) external view returns (address)"
]);
var eternalFarmingAbi = parseAbi13([
  "function incentives(bytes32 incentiveId) external view returns (uint256 totalReward, uint256 bonusReward, address virtualPoolAddress, uint24 minimalPositionWidth, bool deactivated, address pluginAddress)",
  "function getRewardInfo((address rewardToken, address bonusRewardToken, address pool, uint256 nonce) key, uint256 tokenId) external view returns (uint256 reward, uint256 bonusReward)"
]);
var algebraFactoryAbi = parseAbi13([
  "function poolByPair(address tokenA, address tokenB) external view returns (address pool)"
]);
var _addressDecodeAbi3 = parseAbi13(["function f() external view returns (address)"]);
function decodeAddress3(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult5({ abi: _addressDecodeAbi3, functionName: "f", data });
  } catch {
    return null;
  }
}
function incentiveId(key) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "rewardToken", type: "address" },
        { name: "bonusRewardToken", type: "address" },
        { name: "pool", type: "address" },
        { name: "nonce", type: "uint256" }
      ],
      [key.rewardToken, key.bonusRewardToken, key.pool, key.nonce]
    )
  );
}
function encodeEnterFarming(key, tokenId) {
  return encodeFunctionData13({
    abi: farmingCenterAbi,
    functionName: "enterFarming",
    args: [key, tokenId]
  });
}
function encodeExitFarming(key, tokenId) {
  return encodeFunctionData13({
    abi: farmingCenterAbi,
    functionName: "exitFarming",
    args: [key, tokenId]
  });
}
function encodeCollectRewards(key, tokenId) {
  return encodeFunctionData13({
    abi: farmingCenterAbi,
    functionName: "collectRewards",
    args: [key, tokenId]
  });
}
function encodeClaimReward(rewardToken, to) {
  return encodeFunctionData13({
    abi: farmingCenterAbi,
    functionName: "claimReward",
    args: [rewardToken, to, 2n ** 128n - 1n]
    // max uint128
  });
}
function encodeMulticall(calls) {
  return encodeFunctionData13({
    abi: farmingCenterAbi,
    functionName: "multicall",
    args: [calls]
  });
}
var nonceCache = /* @__PURE__ */ new Map();
var KittenSwapFarmingAdapter = class {
  protocolName;
  farmingCenter;
  eternalFarming;
  positionManager;
  rpcUrl;
  factory;
  constructor(protocolName, farmingCenter, eternalFarming, positionManager, rpcUrl, factory) {
    this.protocolName = protocolName;
    this.farmingCenter = farmingCenter;
    this.eternalFarming = eternalFarming;
    this.positionManager = positionManager;
    this.rpcUrl = rpcUrl;
    this.factory = factory;
  }
  name() {
    return this.protocolName;
  }
  /**
   * Discover the active IncentiveKey for a given pool.
   * 1. Check runtime cache
   * 2. Batch-query nonces 0-60 via single multicall (61 calls)
   * 3. Return first non-zero incentive (totalReward > 0 and not deactivated)
   */
  async discoverIncentiveKey(pool) {
    const poolLc = pool.toLowerCase();
    if (nonceCache.has(poolLc)) {
      return {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce: nonceCache.get(poolLc)
      };
    }
    const calls = [];
    const nonces = [];
    for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
      const nonce = BigInt(n);
      nonces.push(nonce);
      const key = {
        rewardToken: KITTEN_TOKEN,
        bonusRewardToken: WHYPE_TOKEN,
        pool,
        nonce
      };
      calls.push([
        this.eternalFarming,
        encodeFunctionData13({
          abi: eternalFarmingAbi,
          functionName: "incentives",
          args: [incentiveId(key)]
        })
      ]);
    }
    const results = await multicallRead5(this.rpcUrl, calls);
    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (!data || data.length < 66) continue;
      try {
        const decoded = decodeAbiParameters5(
          [
            { name: "totalReward", type: "uint256" },
            { name: "bonusReward", type: "uint256" },
            { name: "virtualPoolAddress", type: "address" },
            { name: "minimalPositionWidth", type: "uint24" },
            { name: "deactivated", type: "bool" },
            { name: "pluginAddress", type: "address" }
          ],
          data
        );
        const totalReward = decoded[0];
        const deactivated = decoded[4];
        if (totalReward > 0n && !deactivated) {
          const nonce = nonces[i];
          nonceCache.set(poolLc, nonce);
          return {
            rewardToken: KITTEN_TOKEN,
            bonusRewardToken: WHYPE_TOKEN,
            pool,
            nonce
          };
        }
      } catch {
      }
    }
    return null;
  }
  /**
   * Build approveForFarming tx on the PositionManager.
   * Required before enterFarming if not already approved.
   */
  async buildApproveForFarming(tokenId) {
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
    const currentApproval = await client.readContract({
      address: this.positionManager,
      abi: positionManagerAbi2,
      functionName: "farmingApprovals",
      args: [tokenId]
    });
    if (currentApproval.toLowerCase() === this.farmingCenter.toLowerCase()) {
      return null;
    }
    return {
      description: `[${this.protocolName}] Approve NFT #${tokenId} for farming`,
      to: this.positionManager,
      data: encodeFunctionData13({
        abi: positionManagerAbi2,
        functionName: "approveForFarming",
        args: [tokenId, true, this.farmingCenter]
      }),
      value: 0n,
      gas_estimate: 6e4
    };
  }
  /**
   * Build enterFarming tx for a position NFT.
   * Checks farming approval first and returns pre_txs if needed.
   */
  async buildEnterFarming(tokenId, pool, _owner) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError13(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    const approveTx = await this.buildApproveForFarming(tokenId);
    return {
      description: `[${this.protocolName}] Enter farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeEnterFarming(key, tokenId),
      value: 0n,
      gas_estimate: 4e5,
      pre_txs: approveTx ? [approveTx] : void 0
    };
  }
  /**
   * Build a tx that exits farming for a position NFT (unstakes).
   */
  async buildExitFarming(tokenId, pool) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError13(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    return {
      description: `[${this.protocolName}] Exit farming for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeExitFarming(key, tokenId),
      value: 0n,
      gas_estimate: 3e5
    };
  }
  /**
   * Build a multicall tx that collects rewards for a staked position and claims them.
   * Pattern: multicall([collectRewards(key, tokenId), claimReward(KITTEN, owner, max), claimReward(WHYPE, owner, max)])
   */
  async buildCollectRewards(tokenId, pool, owner) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      throw new DefiError13(
        "CONTRACT_ERROR",
        `[${this.protocolName}] No active incentive found for pool ${pool}`
      );
    }
    const calls = [
      encodeCollectRewards(key, tokenId),
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner)
    ];
    return {
      description: `[${this.protocolName}] Collect + claim rewards for NFT #${tokenId} in pool ${pool}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 4e5
    };
  }
  /**
   * Build a tx that only claims already-accumulated rewards (no position change needed).
   */
  async buildClaimReward(owner) {
    const calls = [
      encodeClaimReward(KITTEN_TOKEN, owner),
      encodeClaimReward(WHYPE_TOKEN, owner)
    ];
    return {
      description: `[${this.protocolName}] Claim KITTEN + WHYPE farming rewards to ${owner}`,
      to: this.farmingCenter,
      data: encodeMulticall(calls),
      value: 0n,
      gas_estimate: 2e5
    };
  }
  /**
   * Query pending rewards for a staked position NFT.
   */
  async getPendingRewards(tokenId, pool) {
    const key = await this.discoverIncentiveKey(pool);
    if (!key) {
      return { reward: 0n, bonusReward: 0n };
    }
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
    const result = await client.readContract({
      address: this.eternalFarming,
      abi: eternalFarmingAbi,
      functionName: "getRewardInfo",
      args: [key, tokenId]
    });
    return { reward: result[0], bonusReward: result[1] };
  }
  /**
   * Discover all KittenSwap pools with active farming incentives.
   *
   * Steps:
   * 1. Generate all unique token pair combos from HYPEREVM_TOKENS (includes KITTEN)
   * 2. Batch poolByPair calls via multicall against the Algebra factory
   * 3. For each found pool, batch-scan nonces 0-60 via multicall
   * 4. Return enriched FarmingPool[] for pools with active incentives
   */
  async discoverFarmingPools() {
    if (!this.factory) {
      return [];
    }
    const pairs = [];
    for (let i = 0; i < HYPEREVM_TOKENS2.length; i++) {
      for (let j = i + 1; j < HYPEREVM_TOKENS2.length; j++) {
        pairs.push([HYPEREVM_TOKENS2[i], HYPEREVM_TOKENS2[j]]);
      }
    }
    const poolByPairCalls = pairs.map(([tokenA, tokenB]) => [
      this.factory,
      encodeFunctionData13({
        abi: algebraFactoryAbi,
        functionName: "poolByPair",
        args: [tokenA, tokenB]
      })
    ]);
    const poolResults = await multicallRead5(this.rpcUrl, poolByPairCalls);
    const poolSet = /* @__PURE__ */ new Set();
    for (const data of poolResults) {
      const addr = decodeAddress3(data);
      if (addr && addr !== zeroAddress7) {
        poolSet.add(addr.toLowerCase());
      }
    }
    if (poolSet.size === 0) return [];
    const pools = Array.from(poolSet);
    const NONCE_COUNT = MAX_NONCE_SCAN + 1;
    const allNonceCalls = [];
    for (const pool of pools) {
      for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
        const key = {
          rewardToken: KITTEN_TOKEN,
          bonusRewardToken: WHYPE_TOKEN,
          pool,
          nonce: BigInt(n)
        };
        allNonceCalls.push([
          this.eternalFarming,
          encodeFunctionData13({
            abi: eternalFarmingAbi,
            functionName: "incentives",
            args: [incentiveId(key)]
          })
        ]);
      }
    }
    const allNonceResults = await multicallRead5(this.rpcUrl, allNonceCalls);
    const results = [];
    for (let pi = 0; pi < pools.length; pi++) {
      const pool = pools[pi];
      const poolLc = pool.toLowerCase();
      const base = pi * NONCE_COUNT;
      let bestKey = null;
      let bestTotalReward = 0n;
      let bestBonusReward = 0n;
      let bestActive = false;
      for (let n = 0; n <= MAX_NONCE_SCAN; n++) {
        const data = allNonceResults[base + n];
        if (!data || data.length < 66) continue;
        try {
          const decoded = decodeAbiParameters5(
            [
              { name: "totalReward", type: "uint256" },
              { name: "bonusReward", type: "uint256" },
              { name: "virtualPoolAddress", type: "address" },
              { name: "minimalPositionWidth", type: "uint24" },
              { name: "deactivated", type: "bool" },
              { name: "pluginAddress", type: "address" }
            ],
            data
          );
          const totalReward = decoded[0];
          const bonusReward = decoded[1];
          const deactivated = decoded[4];
          if (totalReward > 0n) {
            const nonce = BigInt(n);
            const isActive = !deactivated;
            if (!bestKey || isActive && !bestActive || isActive === bestActive && nonce > bestKey.nonce) {
              bestKey = {
                rewardToken: KITTEN_TOKEN,
                bonusRewardToken: WHYPE_TOKEN,
                pool,
                nonce
              };
              bestTotalReward = totalReward;
              bestBonusReward = bonusReward;
              bestActive = isActive;
            }
          }
        } catch {
        }
      }
      if (bestKey) {
        nonceCache.set(poolLc, bestKey.nonce);
        results.push({
          pool,
          key: bestKey,
          totalReward: bestTotalReward,
          bonusReward: bestBonusReward,
          active: bestActive
        });
      }
    }
    return results;
  }
};

// src/lending/aave_v3.ts
import { createPublicClient as createPublicClient10, http as http10, parseAbi as parseAbi14, encodeFunctionData as encodeFunctionData14, decodeFunctionResult as decodeFunctionResult6, zeroAddress as zeroAddress8 } from "viem";
import {
  DefiError as DefiError14,
  multicallRead as multicallRead6,
  decodeU256,
  InterestRateMode
} from "@hypurrquant/defi-core";
var POOL_ABI = parseAbi14([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)"
]);
var ERC20_ABI = parseAbi14([
  "function totalSupply() external view returns (uint256)"
]);
var INCENTIVES_ABI = parseAbi14([
  "function getIncentivesController() external view returns (address)"
]);
var REWARDS_CONTROLLER_ABI = parseAbi14([
  "function getRewardsByAsset(address asset) external view returns (address[])",
  "function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionsPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)"
]);
var POOL_PROVIDER_ABI = parseAbi14([
  "function ADDRESSES_PROVIDER() external view returns (address)"
]);
var ADDRESSES_PROVIDER_ABI = parseAbi14([
  "function getPriceOracle() external view returns (address)"
]);
var ORACLE_ABI = parseAbi14([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)"
]);
var ERC20_DECIMALS_ABI = parseAbi14([
  "function decimals() external view returns (uint8)"
]);
function u256ToF64(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
function decodeAddress4(data) {
  if (!data || data.length < 66) return null;
  return `0x${data.slice(26, 66)}`;
}
function decodeAddressArray(data) {
  if (!data) return [];
  try {
    return decodeFunctionResult6({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsByAsset",
      data
    });
  } catch {
    return [];
  }
}
function decodeReserveData(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult6({
      abi: POOL_ABI,
      functionName: "getReserveData",
      data
    });
  } catch {
    return null;
  }
}
function decodeRewardsData(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult6({
      abi: REWARDS_CONTROLLER_ABI,
      functionName: "getRewardsData",
      data
    });
  } catch {
    return null;
  }
}
var AaveV3Adapter = class {
  protocolName;
  pool;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError14.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData14({
      abi: POOL_ABI,
      functionName: "supply",
      args: [params.asset, params.amount, params.on_behalf_of, 0]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildBorrow(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData14({
      abi: POOL_ABI,
      functionName: "borrow",
      args: [params.asset, params.amount, rateMode, 0, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData14({
      abi: POOL_ABI,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData14({
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError14.rpcError("No RPC URL configured");
    const reserveCallData = encodeFunctionData14({
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset]
    });
    const [reserveRaw] = await multicallRead6(this.rpcUrl, [
      [this.pool, reserveCallData]
    ]).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const reserveDecoded = decodeReserveData(reserveRaw ?? null);
    if (!reserveDecoded) {
      throw DefiError14.rpcError(`[${this.protocolName}] getReserveData returned no data`);
    }
    const result = reserveDecoded;
    const RAY = 1e27;
    const SECONDS_PER_YEAR4 = 31536e3;
    const toApy = (rayRate) => {
      const rate = Number(rayRate) / RAY;
      return (Math.pow(1 + rate / SECONDS_PER_YEAR4, SECONDS_PER_YEAR4) - 1) * 100;
    };
    const supplyRate = toApy(result[2]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);
    const aTokenAddress = result[8];
    const variableDebtTokenAddress = result[10];
    const [supplyRaw, borrowRaw] = await multicallRead6(this.rpcUrl, [
      [aTokenAddress, encodeFunctionData14({ abi: ERC20_ABI, functionName: "totalSupply" })],
      [variableDebtTokenAddress, encodeFunctionData14({ abi: ERC20_ABI, functionName: "totalSupply" })]
    ]);
    const totalSupply = decodeU256(supplyRaw ?? null);
    const totalBorrow = decodeU256(borrowRaw ?? null);
    const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;
    const supplyRewardTokens = [];
    const borrowRewardTokens = [];
    const supplyEmissions = [];
    const borrowEmissions = [];
    try {
      const [controllerRaw] = await multicallRead6(this.rpcUrl, [
        [aTokenAddress, encodeFunctionData14({ abi: INCENTIVES_ABI, functionName: "getIncentivesController" })]
      ]);
      const controllerAddr = decodeAddress4(controllerRaw ?? null);
      if (controllerAddr && controllerAddr !== zeroAddress8) {
        const [supplyRewardsRaw, borrowRewardsRaw] = await multicallRead6(this.rpcUrl, [
          [controllerAddr, encodeFunctionData14({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [aTokenAddress] })],
          [controllerAddr, encodeFunctionData14({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [variableDebtTokenAddress] })]
        ]);
        const supplyRewards = decodeAddressArray(supplyRewardsRaw ?? null);
        const borrowRewards = decodeAddressArray(borrowRewardsRaw ?? null);
        const rewardsDataCalls = [
          ...supplyRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData14({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [aTokenAddress, reward] })
          ]),
          ...borrowRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData14({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [variableDebtTokenAddress, reward] })
          ])
        ];
        if (rewardsDataCalls.length > 0) {
          const rewardsDataResults = await multicallRead6(this.rpcUrl, rewardsDataCalls);
          const supplyDataResults = rewardsDataResults.slice(0, supplyRewards.length);
          const borrowDataResults = rewardsDataResults.slice(supplyRewards.length);
          for (let i = 0; i < supplyRewards.length; i++) {
            const data = decodeRewardsData(supplyDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              supplyRewardTokens.push(supplyRewards[i]);
              supplyEmissions.push(data[1].toString());
            }
          }
          for (let i = 0; i < borrowRewards.length; i++) {
            const data = decodeRewardsData(borrowDataResults[i] ?? null);
            if (data && data[1] > 0n) {
              borrowRewardTokens.push(borrowRewards[i]);
              borrowEmissions.push(data[1].toString());
            }
          }
        }
      }
    } catch {
    }
    let supplyIncentiveApy;
    let borrowIncentiveApy;
    const hasSupplyRewards = supplyRewardTokens.length > 0;
    const hasBorrowRewards = borrowRewardTokens.length > 0;
    if ((hasSupplyRewards || hasBorrowRewards) && totalSupply > 0n) {
      try {
        const [providerRaw] = await multicallRead6(this.rpcUrl, [
          [this.pool, encodeFunctionData14({ abi: POOL_PROVIDER_ABI, functionName: "ADDRESSES_PROVIDER" })]
        ]);
        const providerAddr = decodeAddress4(providerRaw ?? null);
        if (!providerAddr) throw new Error("No provider address");
        const [oracleRaw] = await multicallRead6(this.rpcUrl, [
          [providerAddr, encodeFunctionData14({ abi: ADDRESSES_PROVIDER_ABI, functionName: "getPriceOracle" })]
        ]);
        const oracleAddr = decodeAddress4(oracleRaw ?? null);
        if (!oracleAddr) throw new Error("No oracle address");
        const [assetPriceRaw, baseCurrencyUnitRaw, assetDecimalsRaw] = await multicallRead6(this.rpcUrl, [
          [oracleAddr, encodeFunctionData14({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [asset] })],
          [oracleAddr, encodeFunctionData14({ abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })],
          [asset, encodeFunctionData14({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const assetPrice = decodeU256(assetPriceRaw ?? null);
        const baseCurrencyUnit = decodeU256(baseCurrencyUnitRaw ?? null);
        const assetDecimals = assetDecimalsRaw ? Number(decodeU256(assetDecimalsRaw)) : 18;
        const priceUnit = Number(baseCurrencyUnit) || 1e8;
        const assetPriceF = Number(assetPrice) / priceUnit;
        const assetDecimalsDivisor = 10 ** assetDecimals;
        const allRewardTokens = Array.from(/* @__PURE__ */ new Set([...supplyRewardTokens, ...borrowRewardTokens]));
        const rewardPriceCalls = allRewardTokens.flatMap((token) => [
          [oracleAddr, encodeFunctionData14({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] })],
          [token, encodeFunctionData14({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const rewardPriceResults = rewardPriceCalls.length > 0 ? await multicallRead6(this.rpcUrl, rewardPriceCalls) : [];
        const rewardPriceMap = /* @__PURE__ */ new Map();
        for (let i = 0; i < allRewardTokens.length; i++) {
          const priceRaw = rewardPriceResults[i * 2] ?? null;
          const decimalsRaw = rewardPriceResults[i * 2 + 1] ?? null;
          const price = decodeU256(priceRaw);
          const decimals = decimalsRaw ? Number(decodeU256(decimalsRaw)) : 18;
          rewardPriceMap.set(allRewardTokens[i].toLowerCase(), { price, decimals });
        }
        if (hasSupplyRewards) {
          let totalSupplyIncentiveUsdPerYear = 0;
          const totalSupplyUsd = Number(totalSupply) / assetDecimalsDivisor * assetPriceF;
          for (let i = 0; i < supplyRewardTokens.length; i++) {
            const emissionPerSec = BigInt(supplyEmissions[i]);
            const entry = rewardPriceMap.get(supplyRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = Number(emissionPerSec) / 10 ** rewardDecimals * SECONDS_PER_YEAR4;
              totalSupplyIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalSupplyUsd > 0) {
            supplyIncentiveApy = totalSupplyIncentiveUsdPerYear / totalSupplyUsd * 100;
          }
        }
        if (hasBorrowRewards && totalBorrow > 0n) {
          let totalBorrowIncentiveUsdPerYear = 0;
          const totalBorrowUsd = Number(totalBorrow) / assetDecimalsDivisor * assetPriceF;
          for (let i = 0; i < borrowRewardTokens.length; i++) {
            const emissionPerSec = BigInt(borrowEmissions[i]);
            const entry = rewardPriceMap.get(borrowRewardTokens[i].toLowerCase());
            const rewardPrice = entry?.price ?? 0n;
            const rewardDecimals = entry?.decimals ?? 18;
            if (rewardPrice > 0n) {
              const rewardPriceF = Number(rewardPrice) / priceUnit;
              const emissionPerYear = Number(emissionPerSec) / 10 ** rewardDecimals * SECONDS_PER_YEAR4;
              totalBorrowIncentiveUsdPerYear += emissionPerYear * rewardPriceF;
            }
          }
          if (totalBorrowUsd > 0) {
            borrowIncentiveApy = totalBorrowIncentiveUsdPerYear / totalBorrowUsd * 100;
          }
        }
      } catch {
      }
    }
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow,
      ...hasSupplyRewards && {
        supply_reward_tokens: supplyRewardTokens,
        supply_emissions_per_second: supplyEmissions
      },
      ...hasBorrowRewards && {
        borrow_reward_tokens: borrowRewardTokens,
        borrow_emissions_per_second: borrowEmissions
      },
      ...supplyIncentiveApy !== void 0 && { supply_incentive_apy: supplyIncentiveApy },
      ...borrowIncentiveApy !== void 0 && { borrow_incentive_apy: borrowIncentiveApy }
    };
  }
  async getUserPosition(user) {
    if (!this.rpcUrl) throw DefiError14.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvBps = u256ToF64(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress8, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress8, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      net_apy: ltvBps / 100
    };
  }
};

// src/lending/aave_v2.ts
import { createPublicClient as createPublicClient11, http as http11, parseAbi as parseAbi15, encodeFunctionData as encodeFunctionData15, zeroAddress as zeroAddress9 } from "viem";
import {
  DefiError as DefiError15,
  InterestRateMode as InterestRateMode2
} from "@hypurrquant/defi-core";
var POOL_ABI2 = parseAbi15([
  "function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  // V2 getReserveData: 12 fields (no accruedToTreasury/unbacked/isolationModeTotalDebt)
  // positions: [0]=configuration, [1]=liquidityIndex, [2]=variableBorrowIndex,
  //            [3]=currentLiquidityRate, [4]=currentVariableBorrowRate, [5]=currentStableBorrowRate,
  //            [6]=lastUpdateTimestamp, [7]=aTokenAddress, [8]=stableDebtTokenAddress,
  //            [9]=variableDebtTokenAddress, [10]=interestRateStrategyAddress, [11]=id
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id)"
]);
var ERC20_ABI2 = parseAbi15([
  "function totalSupply() external view returns (uint256)"
]);
function u256ToF642(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
var AaveV2Adapter = class {
  protocolName;
  pool;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError15.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData15({
      abi: POOL_ABI2,
      functionName: "deposit",
      args: [params.asset, params.amount, params.on_behalf_of, 0]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildBorrow(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode2.Stable ? 1n : 2n;
    const data = encodeFunctionData15({
      abi: POOL_ABI2,
      functionName: "borrow",
      args: [params.asset, params.amount, rateMode, 0, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode2.Stable ? 1n : 2n;
    const data = encodeFunctionData15({
      abi: POOL_ABI2,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5,
      approvals: [{ token: params.asset, spender: this.pool, amount: params.amount }]
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData15({
      abi: POOL_ABI2,
      functionName: "withdraw",
      args: [params.asset, params.amount, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError15.rpcError("No RPC URL configured");
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getReserveData",
      args: [asset]
    }).catch((e) => {
      throw DefiError15.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const RAY = 1e27;
    const SECONDS_PER_YEAR4 = 31536e3;
    const toApy = (rayRate) => {
      const rate = Number(rayRate) / RAY;
      return (Math.pow(1 + rate / SECONDS_PER_YEAR4, SECONDS_PER_YEAR4) - 1) * 100;
    };
    const supplyRate = toApy(result[3]);
    const variableRate = toApy(result[4]);
    const stableRate = toApy(result[5]);
    const aTokenAddress = result[7];
    const variableDebtTokenAddress = result[9];
    const [totalSupply, totalBorrow] = await Promise.all([
      client.readContract({
        address: aTokenAddress,
        abi: ERC20_ABI2,
        functionName: "totalSupply"
      }).catch(() => 0n),
      client.readContract({
        address: variableDebtTokenAddress,
        abi: ERC20_ABI2,
        functionName: "totalSupply"
      }).catch(() => 0n)
    ]);
    const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrow
    };
  }
  async getUserPosition(user) {
    if (!this.rpcUrl) throw DefiError15.rpcError("No RPC URL configured");
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError15.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF642(totalCollateralBase) / 1e18;
    const debtUsd = u256ToF642(totalDebtBase) / 1e18;
    const ltvBps = u256ToF642(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress9, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress9, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
      health_factor: hf,
      net_apy: ltvBps / 100
    };
  }
};

// src/lending/aave_oracle.ts
import { createPublicClient as createPublicClient12, http as http12, parseAbi as parseAbi16 } from "viem";
import { DefiError as DefiError16 } from "@hypurrquant/defi-core";
var ORACLE_ABI2 = parseAbi16([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)"
]);
var AaveOracleAdapter = class {
  protocolName;
  oracle;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError16.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const oracle = entry.contracts?.["oracle"];
    if (!oracle) throw DefiError16.contractError(`[${entry.name}] Missing 'oracle' contract address`);
    this.oracle = oracle;
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    const client = createPublicClient12({ transport: http12(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError16.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const priceVal = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetPrice",
      args: [asset]
    }).catch((e) => {
      throw DefiError16.rpcError(`[${this.protocolName}] getAssetPrice failed: ${e}`);
    });
    const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
    const priceUsd = baseUnit > 0n ? priceVal * 10n ** 18n / baseUnit : 0n;
    return {
      source: `${this.protocolName} Oracle`,
      source_type: "oracle",
      asset,
      price_usd: priceUsd,
      price_f64: priceF64
    };
  }
  async getPrices(assets) {
    const client = createPublicClient12({ transport: http12(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError16.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const rawPrices = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetsPrices",
      args: [assets]
    }).catch((e) => {
      throw DefiError16.rpcError(`[${this.protocolName}] getAssetsPrices failed: ${e}`);
    });
    return rawPrices.map((priceVal, i) => {
      const priceF64 = baseUnit > 0n ? Number(priceVal) / Number(baseUnit) : 0;
      const priceUsd = baseUnit > 0n ? priceVal * 10n ** 18n / baseUnit : 0n;
      return {
        source: `${this.protocolName} Oracle`,
        source_type: "oracle",
        asset: assets[i],
        price_usd: priceUsd,
        price_f64: priceF64
      };
    });
  }
};

// src/lending/compound_v2.ts
import { createPublicClient as createPublicClient13, http as http13, parseAbi as parseAbi17, encodeFunctionData as encodeFunctionData16 } from "viem";
import {
  DefiError as DefiError17
} from "@hypurrquant/defi-core";
var CTOKEN_ABI = parseAbi17([
  "function supplyRatePerBlock() external view returns (uint256)",
  "function borrowRatePerBlock() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function mint(uint256 mintAmount) external returns (uint256)",
  "function redeem(uint256 redeemTokens) external returns (uint256)",
  "function borrow(uint256 borrowAmount) external returns (uint256)",
  "function repayBorrow(uint256 repayAmount) external returns (uint256)"
]);
var BSC_BLOCKS_PER_YEAR = 10512e3;
var CompoundV2Adapter = class {
  protocolName;
  defaultVtoken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const vtoken = contracts["vusdt"] ?? contracts["vusdc"] ?? contracts["vbnb"] ?? contracts["comptroller"];
    if (!vtoken) throw DefiError17.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData16({
      abi: CTOKEN_ABI,
      functionName: "mint",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData16({
      abi: CTOKEN_ABI,
      functionName: "borrow",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData16({
      abi: CTOKEN_ABI,
      functionName: "repayBorrow",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData16({
      abi: CTOKEN_ABI,
      functionName: "redeem",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw from Venus`,
      to: this.defaultVtoken,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    const [supplyRate, borrowRate, totalSupply, totalBorrows] = await Promise.all([
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "totalBorrows" }).catch(() => 0n)
    ]);
    const supplyPerBlock = Number(supplyRate) / 1e18;
    const borrowPerBlock = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const borrowApy = borrowPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? borrowF / supplyF * 100 : 0;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrows
    };
  }
  async getUserPosition(_user) {
    throw DefiError17.unsupported(
      `[${this.protocolName}] User position requires querying individual vToken balances`
    );
  }
};

// src/lending/compound_v3.ts
import { createPublicClient as createPublicClient14, http as http14, parseAbi as parseAbi18, encodeFunctionData as encodeFunctionData17 } from "viem";
import {
  DefiError as DefiError18
} from "@hypurrquant/defi-core";
var COMET_ABI = parseAbi18([
  "function getUtilization() external view returns (uint256)",
  "function getSupplyRate(uint256 utilization) external view returns (uint64)",
  "function getBorrowRate(uint256 utilization) external view returns (uint64)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrow() external view returns (uint256)",
  "function supply(address asset, uint256 amount) external",
  "function withdraw(address asset, uint256 amount) external"
]);
var SECONDS_PER_YEAR = 365.25 * 24 * 3600;
var CompoundV3Adapter = class {
  protocolName;
  comet;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const comet = contracts["comet_usdc"] ?? contracts["comet"] ?? contracts["comet_weth"];
    if (!comet) throw DefiError18.contractError("Missing 'comet_usdc' or 'comet' address");
    this.comet = comet;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData17({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData17({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData17({
      abi: COMET_ABI,
      functionName: "supply",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData17({
      abi: COMET_ABI,
      functionName: "withdraw",
      args: [params.asset, params.amount]
    });
    return {
      description: `[${this.protocolName}] Withdraw from Comet`,
      to: this.comet,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError18.rpcError("No RPC URL configured");
    const client = createPublicClient14({ transport: http14(this.rpcUrl) });
    const utilization = await client.readContract({
      address: this.comet,
      abi: COMET_ABI,
      functionName: "getUtilization"
    }).catch((e) => {
      throw DefiError18.rpcError(`[${this.protocolName}] getUtilization failed: ${e}`);
    });
    const [supplyRate, borrowRate, totalSupply, totalBorrow] = await Promise.all([
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [utilization] }).catch((e) => {
        throw DefiError18.rpcError(`[${this.protocolName}] getSupplyRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [utilization] }).catch((e) => {
        throw DefiError18.rpcError(`[${this.protocolName}] getBorrowRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalSupply" }).catch(() => 0n),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "totalBorrow" }).catch(() => 0n)
    ]);
    const supplyPerSec = Number(supplyRate) / 1e18;
    const borrowPerSec = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerSec * SECONDS_PER_YEAR * 100;
    const borrowApy = borrowPerSec * SECONDS_PER_YEAR * 100;
    const utilPct = Number(utilization) / 1e18 * 100;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: utilPct,
      total_supply: totalSupply,
      total_borrow: totalBorrow
    };
  }
  async getUserPosition(_user) {
    throw DefiError18.unsupported(
      `[${this.protocolName}] User position requires querying Comet balanceOf + borrowBalanceOf`
    );
  }
};

// src/lending/euler_v2.ts
import { createPublicClient as createPublicClient15, http as http15, parseAbi as parseAbi19, encodeFunctionData as encodeFunctionData18 } from "viem";
import {
  DefiError as DefiError19
} from "@hypurrquant/defi-core";
var EULER_VAULT_ABI = parseAbi19([
  "function deposit(uint256 amount, address receiver) external returns (uint256)",
  "function withdraw(uint256 amount, address receiver, address owner) external returns (uint256)",
  "function borrow(uint256 amount, address receiver) external returns (uint256)",
  "function repay(uint256 amount, address receiver) external returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function interestRate() external view returns (uint256)"
]);
var SECONDS_PER_YEAR2 = 365.25 * 24 * 3600;
var EulerV2Adapter = class {
  protocolName;
  euler;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const euler = contracts["evk_vault"] ?? contracts["euler"] ?? contracts["markets"];
    if (!euler) throw DefiError19.contractError("Missing 'evk_vault' or 'euler' contract address");
    this.euler = euler;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData18({
      abi: EULER_VAULT_ABI,
      functionName: "deposit",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Deposit ${params.amount} into Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async buildBorrow(params) {
    const data = encodeFunctionData18({
      abi: EULER_VAULT_ABI,
      functionName: "borrow",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildRepay(params) {
    const data = encodeFunctionData18({
      abi: EULER_VAULT_ABI,
      functionName: "repay",
      args: [params.amount, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData18({
      abi: EULER_VAULT_ABI,
      functionName: "withdraw",
      args: [params.amount, params.to, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Euler vault`,
      to: this.euler,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError19.rpcError("No RPC URL configured");
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    const [totalSupply, totalBorrows, interestRate] = await Promise.all([
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError19.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalBorrows" }).catch((e) => {
        throw DefiError19.rpcError(`[${this.protocolName}] totalBorrows failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "interestRate" }).catch((e) => {
        throw DefiError19.rpcError(`[${this.protocolName}] interestRate failed: ${e}`);
      })
    ]);
    const rateF64 = Number(interestRate) / 1e27;
    const borrowApy = rateF64 * SECONDS_PER_YEAR2 * 100;
    const supplyF = Number(totalSupply);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? borrowF / supplyF * 100 : 0;
    const supplyApy = borrowApy * (borrowF / Math.max(supplyF, 1));
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupply,
      total_borrow: totalBorrows
    };
  }
  async getUserPosition(_user) {
    throw DefiError19.unsupported(
      `[${this.protocolName}] Euler V2 user positions require querying individual vault balances. Use the vault address directly to check balanceOf(user) for supply positions.`
    );
  }
};

// src/lending/morpho.ts
import { parseAbi as parseAbi20, encodeFunctionData as encodeFunctionData19, decodeFunctionResult as decodeFunctionResult7, zeroAddress as zeroAddress10 } from "viem";
import {
  DefiError as DefiError20,
  multicallRead as multicallRead7,
  decodeU256 as decodeU2562
} from "@hypurrquant/defi-core";
var MORPHO_ABI = parseAbi20([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)"
]);
var META_MORPHO_ABI = parseAbi20([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
]);
var IRM_ABI = parseAbi20([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)"
]);
var SECONDS_PER_YEAR3 = 365.25 * 24 * 3600;
function defaultMarketParams(loanToken = zeroAddress10) {
  return {
    loanToken,
    collateralToken: zeroAddress10,
    oracle: zeroAddress10,
    irm: zeroAddress10,
    lltv: 0n
  };
}
function decodeMarket(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult7({
      abi: MORPHO_ABI,
      functionName: "market",
      data
    });
  } catch {
    return null;
  }
}
function decodeMarketParams(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult7({
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      data
    });
  } catch {
    return null;
  }
}
var MorphoBlueAdapter = class {
  protocolName;
  morpho;
  defaultVault;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const morpho = contracts["morpho_blue"];
    if (!morpho) throw DefiError20.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault = contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData19({
      abi: MORPHO_ABI,
      functionName: "supply",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData19({
      abi: MORPHO_ABI,
      functionName: "borrow",
      args: [market, params.amount, 0n, params.on_behalf_of, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async buildRepay(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData19({
      abi: MORPHO_ABI,
      functionName: "repay",
      args: [market, params.amount, 0n, params.on_behalf_of, "0x"]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData19({
      abi: MORPHO_ABI,
      functionName: "withdraw",
      args: [market, params.amount, 0n, params.to, params.to]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} from Morpho market`,
      to: this.morpho,
      data,
      value: 0n,
      gas_estimate: 25e4
    };
  }
  async getRates(asset) {
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      throw DefiError20.contractError(`[${this.protocolName}] No MetaMorpho vault configured for rate query`);
    }
    const [queueLenRaw] = await multicallRead7(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData19({ abi: META_MORPHO_ABI, functionName: "supplyQueueLength" })]
    ]).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`);
    });
    const queueLen = decodeU2562(queueLenRaw ?? null);
    if (queueLen === 0n) {
      return {
        protocol: this.protocolName,
        asset,
        supply_apy: 0,
        borrow_variable_apy: 0,
        utilization: 0,
        total_supply: 0n,
        total_borrow: 0n
      };
    }
    const [marketIdRaw] = await multicallRead7(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData19({ abi: META_MORPHO_ABI, functionName: "supplyQueue", args: [0n] })]
    ]).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`);
    });
    if (!marketIdRaw || marketIdRaw.length < 66) {
      throw DefiError20.rpcError(`[${this.protocolName}] supplyQueue(0) returned no data`);
    }
    const marketId = marketIdRaw.slice(0, 66);
    const [marketRaw, paramsRaw] = await multicallRead7(this.rpcUrl, [
      [this.morpho, encodeFunctionData19({ abi: MORPHO_ABI, functionName: "market", args: [marketId] })],
      [this.morpho, encodeFunctionData19({ abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] })]
    ]).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] market/idToMarketParams failed: ${e}`);
    });
    const mktDecoded = decodeMarket(marketRaw ?? null);
    if (!mktDecoded) throw DefiError20.rpcError(`[${this.protocolName}] market() returned no data`);
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mktDecoded;
    const paramsDecoded = decodeMarketParams(paramsRaw ?? null);
    if (!paramsDecoded) throw DefiError20.rpcError(`[${this.protocolName}] idToMarketParams returned no data`);
    const [loanToken, collateralToken, oracle, irm, lltv] = paramsDecoded;
    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;
    const irmMarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };
    const borrowRatePerSec = await (async () => {
      const [borrowRateRaw] = await multicallRead7(this.rpcUrl, [
        [irm, encodeFunctionData19({ abi: IRM_ABI, functionName: "borrowRateView", args: [irmMarketParams, irmMarket] })]
      ]).catch((e) => {
        throw DefiError20.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`);
      });
      return decodeU2562(borrowRateRaw ?? null);
    })();
    const ratePerSec = Number(borrowRatePerSec) / 1e18;
    const borrowApy = ratePerSec * SECONDS_PER_YEAR3 * 100;
    const feePct = Number(fee) / 1e18;
    const supplyApy = borrowApy * util * (1 - feePct);
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization: util * 100,
      total_supply: totalSupplyAssets,
      total_borrow: totalBorrowAssets
    };
  }
  async getUserPosition(_user) {
    throw DefiError20.unsupported(
      `[${this.protocolName}] Morpho Blue user positions are per-market \u2014 use vault deposit/withdraw instead`
    );
  }
};

// src/cdp/felix.ts
import { createPublicClient as createPublicClient16, http as http16, parseAbi as parseAbi21, encodeFunctionData as encodeFunctionData20, zeroAddress as zeroAddress11 } from "viem";
import {
  DefiError as DefiError21
} from "@hypurrquant/defi-core";
var BORROWER_OPS_ABI = parseAbi21([
  "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
  "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
  "function closeTrove(uint256 _troveId) external"
]);
var TROVE_MANAGER_ABI = parseAbi21([
  "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)"
]);
var HINT_HELPERS_ABI = parseAbi21([
  "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)"
]);
var SORTED_TROVES_ABI = parseAbi21([
  "function findInsertPosition(uint256 _annualInterestRate, uint256 _prevId, uint256 _nextId) external view returns (uint256 prevId, uint256 nextId)"
]);
var FelixCdpAdapter = class {
  protocolName;
  borrowerOperations;
  troveManager;
  hintHelpers;
  sortedTroves;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const bo = contracts["borrower_operations"];
    if (!bo) throw DefiError21.contractError("Missing 'borrower_operations' contract");
    this.borrowerOperations = bo;
    this.troveManager = contracts["trove_manager"];
    this.hintHelpers = contracts["hint_helpers"];
    this.sortedTroves = contracts["sorted_troves"];
  }
  name() {
    return this.protocolName;
  }
  async getHints(interestRate) {
    if (!this.hintHelpers || !this.sortedTroves || !this.rpcUrl) {
      return [0n, 0n];
    }
    const client = createPublicClient16({ transport: http16(this.rpcUrl) });
    const approxResult = await client.readContract({
      address: this.hintHelpers,
      abi: HINT_HELPERS_ABI,
      functionName: "getApproxHint",
      args: [0n, interestRate, 15n, 42n]
    }).catch(() => null);
    if (!approxResult) return [0n, 0n];
    const [hintId] = approxResult;
    const insertResult = await client.readContract({
      address: this.sortedTroves,
      abi: SORTED_TROVES_ABI,
      functionName: "findInsertPosition",
      args: [interestRate, hintId, hintId]
    }).catch(() => null);
    if (!insertResult) return [0n, 0n];
    const [prevId, nextId] = insertResult;
    return [prevId, nextId];
  }
  async buildOpen(params) {
    const interestRate = 50000000000000000n;
    const [upperHint, lowerHint] = await this.getHints(interestRate);
    const hasHints = upperHint !== 0n || lowerHint !== 0n;
    const data = encodeFunctionData20({
      abi: BORROWER_OPS_ABI,
      functionName: "openTrove",
      args: [
        params.recipient,
        0n,
        params.collateral_amount,
        params.debt_amount,
        upperHint,
        lowerHint,
        interestRate,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        // U256::MAX
        params.recipient,
        params.recipient,
        params.recipient
      ]
    });
    return {
      description: `[${this.protocolName}] Open trove: collateral=${params.collateral_amount}, debt=${params.debt_amount} (hints=${hasHints ? "optimized" : "none"})`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: hasHints ? 5e5 : 5e6
    };
  }
  async buildAdjust(params) {
    const collChange = params.collateral_delta ?? 0n;
    const debtChange = params.debt_delta ?? 0n;
    const data = encodeFunctionData20({
      abi: BORROWER_OPS_ABI,
      functionName: "adjustTrove",
      args: [
        params.cdp_id,
        collChange,
        params.add_collateral,
        debtChange,
        params.add_debt,
        0n,
        0n,
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      ]
    });
    return {
      description: `[${this.protocolName}] Adjust trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 4e5
    };
  }
  async buildClose(params) {
    const data = encodeFunctionData20({
      abi: BORROWER_OPS_ABI,
      functionName: "closeTrove",
      args: [params.cdp_id]
    });
    return {
      description: `[${this.protocolName}] Close trove ${params.cdp_id}`,
      to: this.borrowerOperations,
      data,
      value: 0n,
      gas_estimate: 35e4
    };
  }
  async getCdpInfo(cdpId) {
    if (!this.rpcUrl) throw DefiError21.rpcError(`[${this.protocolName}] getCdpInfo requires RPC \u2014 set HYPEREVM_RPC_URL`);
    if (!this.troveManager) throw DefiError21.contractError(`[${this.protocolName}] trove_manager contract not configured`);
    const client = createPublicClient16({ transport: http16(this.rpcUrl) });
    const data = await client.readContract({
      address: this.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getLatestTroveData",
      args: [cdpId]
    }).catch((e) => {
      throw DefiError21.invalidParam(`[${this.protocolName}] Trove ${cdpId} not found: ${e}`);
    });
    const [entireDebt, entireColl] = data;
    if (entireDebt === 0n && entireColl === 0n) {
      throw DefiError21.invalidParam(`[${this.protocolName}] Trove ${cdpId} does not exist`);
    }
    const collRatio = entireDebt > 0n ? Number(entireColl) / Number(entireDebt) : 0;
    return {
      protocol: this.protocolName,
      cdp_id: cdpId,
      collateral: {
        token: zeroAddress11,
        symbol: "WHYPE",
        amount: entireColl,
        decimals: 18
      },
      debt: {
        token: zeroAddress11,
        symbol: "feUSD",
        amount: entireDebt,
        decimals: 18
      },
      collateral_ratio: collRatio
    };
  }
};

// src/cdp/felix_oracle.ts
import { createPublicClient as createPublicClient17, http as http17, parseAbi as parseAbi22 } from "viem";
import { DefiError as DefiError22 } from "@hypurrquant/defi-core";
var PRICE_FEED_ABI = parseAbi22([
  "function fetchPrice() external view returns (uint256 price, bool isNewOracleFailureDetected)",
  "function lastGoodPrice() external view returns (uint256)"
]);
var FelixOracleAdapter = class {
  protocolName;
  priceFeed;
  asset;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    if (!rpcUrl) throw DefiError22.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const feed = contracts["price_feed"];
    if (!feed) throw DefiError22.contractError(`[${entry.name}] Missing 'price_feed' contract address`);
    this.priceFeed = feed;
    this.asset = contracts["asset"] ?? "0x0000000000000000000000000000000000000000";
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    if (asset !== this.asset && this.asset !== "0x0000000000000000000000000000000000000000") {
      throw DefiError22.unsupported(`[${this.protocolName}] Felix PriceFeed only supports asset ${this.asset}`);
    }
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    let priceVal;
    try {
      const result = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice"
      });
      const [price] = result;
      priceVal = price;
    } catch {
      priceVal = await client.readContract({
        address: this.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "lastGoodPrice"
      }).catch((e) => {
        throw DefiError22.rpcError(`[${this.protocolName}] lastGoodPrice failed: ${e}`);
      });
    }
    const priceF64 = Number(priceVal) / 1e18;
    return {
      source: "Felix PriceFeed",
      source_type: "oracle",
      asset,
      price_usd: priceVal,
      price_f64: priceF64
    };
  }
  async getPrices(assets) {
    const results = [];
    for (const asset of assets) {
      try {
        results.push(await this.getPrice(asset));
      } catch {
      }
    }
    return results;
  }
};

// src/vault/erc4626.ts
import { createPublicClient as createPublicClient18, http as http18, parseAbi as parseAbi23, encodeFunctionData as encodeFunctionData21 } from "viem";
import {
  DefiError as DefiError23
} from "@hypurrquant/defi-core";
var ERC4626_ABI = parseAbi23([
  "function asset() external view returns (address)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)"
]);
var ERC4626VaultAdapter = class {
  protocolName;
  vaultAddress;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError23.contractError("Missing 'vault' contract address");
    this.vaultAddress = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildDeposit(assets, receiver) {
    const data = encodeFunctionData21({
      abi: ERC4626_ABI,
      functionName: "deposit",
      args: [assets, receiver]
    });
    return {
      description: `[${this.protocolName}] Deposit ${assets} assets into vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildWithdraw(assets, receiver, owner) {
    const data = encodeFunctionData21({
      abi: ERC4626_ABI,
      functionName: "withdraw",
      args: [assets, receiver, owner]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${assets} assets from vault`,
      to: this.vaultAddress,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async totalAssets() {
    if (!this.rpcUrl) throw DefiError23.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets"
    }).catch((e) => {
      throw DefiError23.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
    });
  }
  async convertToShares(assets) {
    if (!this.rpcUrl) throw DefiError23.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets]
    }).catch((e) => {
      throw DefiError23.rpcError(`[${this.protocolName}] convertToShares failed: ${e}`);
    });
  }
  async convertToAssets(shares) {
    if (!this.rpcUrl) throw DefiError23.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares]
    }).catch((e) => {
      throw DefiError23.rpcError(`[${this.protocolName}] convertToAssets failed: ${e}`);
    });
  }
  async getVaultInfo() {
    if (!this.rpcUrl) throw DefiError23.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    const [totalAssets, totalSupply, asset] = await Promise.all([
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalAssets" }).catch((e) => {
        throw DefiError23.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError23.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "asset" }).catch((e) => {
        throw DefiError23.rpcError(`[${this.protocolName}] asset failed: ${e}`);
      })
    ]);
    return {
      protocol: this.protocolName,
      vault_address: this.vaultAddress,
      asset,
      total_assets: totalAssets,
      total_supply: totalSupply
    };
  }
};

// src/liquid_staking/generic_lst.ts
import { parseAbi as parseAbi24, encodeFunctionData as encodeFunctionData22 } from "viem";
import {
  DefiError as DefiError24
} from "@hypurrquant/defi-core";
var GENERIC_LST_ABI = parseAbi24([
  "function stake() external payable returns (uint256)",
  "function unstake(uint256 amount) external returns (uint256)"
]);
var GenericLstAdapter = class {
  protocolName;
  staking;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError24.contractError("Missing 'staking' contract");
    this.staking = staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData22({ abi: GENERIC_LST_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData22({
      abi: GENERIC_LST_ABI,
      functionName: "unstake",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Unstake ${params.amount}`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async getInfo() {
    throw DefiError24.unsupported(`[${this.protocolName}] getInfo requires RPC`);
  }
};

// src/liquid_staking/sthype.ts
import { createPublicClient as createPublicClient19, http as http19, parseAbi as parseAbi25, encodeFunctionData as encodeFunctionData23, zeroAddress as zeroAddress12 } from "viem";
import {
  DefiError as DefiError25
} from "@hypurrquant/defi-core";
var STHYPE_ABI = parseAbi25([
  "function submit(address referral) external payable returns (uint256)",
  "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)"
]);
var ERC20_ABI3 = parseAbi25([
  "function totalSupply() external view returns (uint256)"
]);
var StHypeAdapter = class {
  protocolName;
  staking;
  sthypeToken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError25.contractError("Missing 'staking' contract");
    this.staking = staking;
    this.sthypeToken = entry.contracts?.["sthype_token"];
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData23({
      abi: STHYPE_ABI,
      functionName: "submit",
      args: [zeroAddress12]
    });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for stHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData23({
      abi: STHYPE_ABI,
      functionName: "requestWithdrawals",
      args: [[params.amount], params.recipient]
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} stHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async getInfo() {
    if (!this.rpcUrl) throw DefiError25.rpcError("No RPC URL configured");
    const client = createPublicClient19({ transport: http19(this.rpcUrl) });
    const tokenAddr = this.sthypeToken ?? this.staking;
    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI3,
      functionName: "totalSupply"
    }).catch((e) => {
      throw DefiError25.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
    });
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress12,
      liquid_token: tokenAddr,
      exchange_rate: 1,
      total_staked: totalSupply
    };
  }
};

// src/liquid_staking/kinetiq.ts
import { createPublicClient as createPublicClient20, http as http20, parseAbi as parseAbi26, encodeFunctionData as encodeFunctionData24, zeroAddress as zeroAddress13 } from "viem";
import {
  DefiError as DefiError26
} from "@hypurrquant/defi-core";
var KINETIQ_ABI = parseAbi26([
  "function stake() external payable returns (uint256)",
  "function requestUnstake(uint256 amount) external returns (uint256)",
  "function totalStaked() external view returns (uint256)"
]);
var ORACLE_ABI3 = parseAbi26([
  "function getAssetPrice(address asset) external view returns (uint256)"
]);
var WHYPE = "0x5555555555555555555555555555555555555555";
var HYPERLEND_ORACLE = "0xc9fb4fbe842d57ea1df3e641a281827493a63030";
var KinetiqAdapter = class {
  protocolName;
  staking;
  liquidToken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError26.contractError("Missing 'staking' contract address");
    this.staking = staking;
    this.liquidToken = entry.contracts?.["khype_token"] ?? staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData24({ abi: KINETIQ_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 3e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData24({
      abi: KINETIQ_ABI,
      functionName: "requestUnstake",
      args: [params.amount]
    });
    return {
      description: `[${this.protocolName}] Request unstake ${params.amount} kHYPE`,
      to: this.staking,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async getInfo() {
    if (!this.rpcUrl) throw DefiError26.rpcError("No RPC URL configured");
    const client = createPublicClient20({ transport: http20(this.rpcUrl) });
    const totalStaked = await client.readContract({
      address: this.staking,
      abi: KINETIQ_ABI,
      functionName: "totalStaked"
    }).catch((e) => {
      throw DefiError26.rpcError(`[${this.protocolName}] totalStaked failed: ${e}`);
    });
    const [khypePrice, hypePrice] = await Promise.all([
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [this.liquidToken] }).catch(() => 0n),
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [WHYPE] }).catch(() => 0n)
    ]);
    const rateF64 = hypePrice > 0n && khypePrice > 0n ? Number(khypePrice * 10n ** 18n / hypePrice) / 1e18 : 1;
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress13,
      liquid_token: this.liquidToken,
      exchange_rate: rateF64,
      total_staked: totalStaked
    };
  }
};

// src/yield_source/pendle.ts
import {
  DefiError as DefiError27
} from "@hypurrquant/defi-core";
var PendleAdapter = class {
  protocolName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    if (!entry.contracts?.["router"]) {
      throw DefiError27.contractError("Missing 'router' contract");
    }
  }
  name() {
    return this.protocolName;
  }
  async getYields() {
    throw DefiError27.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError27.unsupported(
      `[${this.protocolName}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError27.unsupported(
      `[${this.protocolName}] Pendle withdraw requires market-specific params`
    );
  }
};

// src/yield_source/generic_yield.ts
import {
  DefiError as DefiError28
} from "@hypurrquant/defi-core";
var GenericYieldAdapter = class {
  protocolName;
  interfaceName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }
  name() {
    return this.protocolName;
  }
  async getYields() {
    throw DefiError28.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError28.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError28.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.`
    );
  }
};

// src/derivatives/hlp.ts
import { parseAbi as parseAbi27, encodeFunctionData as encodeFunctionData25 } from "viem";
import {
  DefiError as DefiError29
} from "@hypurrquant/defi-core";
var HLP_ABI = parseAbi27([
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)"
]);
var HlpVaultAdapter = class {
  protocolName;
  vault;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError29.contractError("Missing 'vault' contract");
    this.vault = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildOpenPosition(params) {
    const data = encodeFunctionData25({
      abi: HLP_ABI,
      functionName: "deposit",
      args: [params.collateral]
    });
    return {
      description: `[${this.protocolName}] Deposit ${params.collateral} into HLP vault`,
      to: this.vault,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async buildClosePosition(params) {
    const data = encodeFunctionData25({
      abi: HLP_ABI,
      functionName: "withdraw",
      args: [params.size]
    });
    return {
      description: `[${this.protocolName}] Withdraw ${params.size} from HLP vault`,
      to: this.vault,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
};

// src/derivatives/generic_derivatives.ts
import {
  DefiError as DefiError30
} from "@hypurrquant/defi-core";
var GenericDerivativesAdapter = class {
  protocolName;
  interfaceName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }
  name() {
    return this.protocolName;
  }
  async buildOpenPosition(_params) {
    throw DefiError30.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
  async buildClosePosition(_params) {
    throw DefiError30.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
};

// src/options/rysk.ts
import { parseAbi as parseAbi28, encodeFunctionData as encodeFunctionData26 } from "viem";
import {
  DefiError as DefiError31
} from "@hypurrquant/defi-core";
var RYSK_ABI = parseAbi28([
  "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
  "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)"
]);
var RyskAdapter = class {
  protocolName;
  controller;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const controller = entry.contracts?.["controller"];
    if (!controller) throw DefiError31.contractError("Missing 'controller' contract");
    this.controller = controller;
  }
  name() {
    return this.protocolName;
  }
  async buildBuy(params) {
    const data = encodeFunctionData26({
      abi: RYSK_ABI,
      functionName: "openOption",
      args: [
        params.underlying,
        params.strike_price,
        BigInt(params.expiry),
        params.is_call,
        params.amount
      ]
    });
    return {
      description: `[${this.protocolName}] Buy ${params.is_call ? "call" : "put"} ${params.amount} option, strike=${params.strike_price}, expiry=${params.expiry}`,
      to: this.controller,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildSell(params) {
    const data = encodeFunctionData26({
      abi: RYSK_ABI,
      functionName: "closeOption",
      args: [
        params.underlying,
        params.strike_price,
        BigInt(params.expiry),
        params.is_call,
        params.amount
      ]
    });
    return {
      description: `[${this.protocolName}] Sell/close ${params.is_call ? "call" : "put"} ${params.amount} option`,
      to: this.controller,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
};

// src/options/generic_options.ts
import {
  DefiError as DefiError32
} from "@hypurrquant/defi-core";
var GenericOptionsAdapter = class {
  protocolName;
  interfaceName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    this.interfaceName = entry.interface;
  }
  name() {
    return this.protocolName;
  }
  async buildBuy(_params) {
    throw DefiError32.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
  async buildSell(_params) {
    throw DefiError32.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
};

// src/nft/erc721.ts
import { createPublicClient as createPublicClient21, http as http21, parseAbi as parseAbi29 } from "viem";
import { DefiError as DefiError33 } from "@hypurrquant/defi-core";
var ERC721_ABI = parseAbi29([
  "function name() returns (string)",
  "function symbol() returns (string)",
  "function totalSupply() returns (uint256)",
  "function ownerOf(uint256 tokenId) returns (address)",
  "function balanceOf(address owner) returns (uint256)",
  "function tokenURI(uint256 tokenId) returns (string)"
]);
var ERC721Adapter = class {
  protocolName;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  async getCollectionInfo(collection) {
    if (!this.rpcUrl) throw DefiError33.rpcError("No RPC URL configured");
    const client = createPublicClient21({ transport: http21(this.rpcUrl) });
    const [collectionName, symbol, totalSupply] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "name" }).catch((e) => {
        throw DefiError33.rpcError(`[${this.protocolName}] name failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "symbol" }).catch((e) => {
        throw DefiError33.rpcError(`[${this.protocolName}] symbol failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "totalSupply" }).catch(() => void 0)
    ]);
    return {
      address: collection,
      name: collectionName,
      symbol,
      total_supply: totalSupply
    };
  }
  async getTokenInfo(collection, tokenId) {
    if (!this.rpcUrl) throw DefiError33.rpcError("No RPC URL configured");
    const client = createPublicClient21({ transport: http21(this.rpcUrl) });
    const [owner, tokenUri] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] }).catch((e) => {
        throw DefiError33.rpcError(`[${this.protocolName}] ownerOf failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "tokenURI", args: [tokenId] }).catch(() => void 0)
    ]);
    return {
      collection,
      token_id: tokenId,
      owner,
      token_uri: tokenUri
    };
  }
  async getBalance(owner, collection) {
    if (!this.rpcUrl) throw DefiError33.rpcError("No RPC URL configured");
    const client = createPublicClient21({ transport: http21(this.rpcUrl) });
    return client.readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] }).catch((e) => {
      throw DefiError33.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
    });
  }
};

// src/factory.ts
function createDex(entry, rpcUrl) {
  switch (entry.interface) {
    case "uniswap_v3":
      return new UniswapV3Adapter(entry, rpcUrl);
    case "uniswap_v4":
      throw DefiError34.unsupported(
        `[${entry.name}] Uniswap V4 (singleton PoolManager) is not yet supported \u2014 use HyperSwap V3 or another V3-compatible DEX for quotes`
      );
    case "algebra_v3":
      return new AlgebraV3Adapter(entry, rpcUrl);
    case "uniswap_v2":
      return new UniswapV2Adapter(entry, rpcUrl);
    case "solidly_v2":
    case "solidly_cl":
      return new SolidlyAdapter(entry, rpcUrl);
    case "hybra":
      return new ThenaCLAdapter(entry, rpcUrl);
    case "curve_stableswap":
      return new CurveStableSwapAdapter(entry);
    case "balancer_v3":
      return new BalancerV3Adapter(entry);
    case "woofi":
      return new WooFiAdapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`DEX interface '${entry.interface}' not yet implemented`);
  }
}
function createLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveV3Adapter(entry, rpcUrl);
    case "aave_v2":
      return new AaveV2Adapter(entry, rpcUrl);
    case "morpho_blue":
      return new MorphoBlueAdapter(entry, rpcUrl);
    case "euler_v2":
      return new EulerV2Adapter(entry, rpcUrl);
    case "compound_v2":
      return new CompoundV2Adapter(entry, rpcUrl);
    case "compound_v3":
      return new CompoundV3Adapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`Lending interface '${entry.interface}' not yet implemented`);
  }
}
function createCdp(entry, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixCdpAdapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`CDP interface '${entry.interface}' not yet implemented`);
  }
}
function createVault(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc4626":
    case "beefy_vault":
      return new ERC4626VaultAdapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`Vault interface '${entry.interface}' not yet implemented`);
  }
}
function createLiquidStaking(entry, rpcUrl) {
  switch (entry.interface) {
    case "kinetiq_staking":
      return new KinetiqAdapter(entry, rpcUrl);
    case "sthype_staking":
      return new StHypeAdapter(entry, rpcUrl);
    case "hyperbeat_lst":
    case "kintsu":
      return new GenericLstAdapter(entry, rpcUrl);
    default:
      return new GenericLstAdapter(entry, rpcUrl);
  }
}
function createGauge(entry, rpcUrl, tokens) {
  if (entry.interface === "hybra" || entry.contracts?.["gauge_manager"]) {
    return new HybraGaugeAdapter(entry, rpcUrl);
  }
  switch (entry.interface) {
    case "solidly_v2":
    case "solidly_cl":
    case "algebra_v3":
      return new SolidlyGaugeAdapter(entry, rpcUrl, tokens);
    // uniswap_v3 with voter = ve(3,3) CL (e.g., Aerodrome Slipstream, Ramses CL)
    case "uniswap_v3":
      if (entry.contracts?.["voter"]) return new SolidlyGaugeAdapter(entry, rpcUrl, tokens);
      throw DefiError34.unsupported(`Gauge interface '${entry.interface}' not supported (no voter contract)`);
    default:
      throw DefiError34.unsupported(`Gauge interface '${entry.interface}' not supported`);
  }
}
function createMasterChef(entry, rpcUrl) {
  return new MasterChefAdapter(entry, rpcUrl);
}
function createYieldSource(entry, rpcUrl) {
  switch (entry.interface) {
    case "pendle_v2":
      return new PendleAdapter(entry, rpcUrl);
    default:
      return new GenericYieldAdapter(entry, rpcUrl);
  }
}
function createDerivatives(entry, rpcUrl) {
  switch (entry.interface) {
    case "hlp_vault":
      return new HlpVaultAdapter(entry, rpcUrl);
    default:
      return new GenericDerivativesAdapter(entry, rpcUrl);
  }
}
function createOptions(entry, rpcUrl) {
  switch (entry.interface) {
    case "rysk":
      return new RyskAdapter(entry, rpcUrl);
    default:
      return new GenericOptionsAdapter(entry, rpcUrl);
  }
}
function createNft(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc721":
      return new ERC721Adapter(entry, rpcUrl);
    case "marketplace":
      throw DefiError34.unsupported(`NFT marketplace '${entry.name}' is not queryable as ERC-721. Use a specific collection address.`);
    default:
      throw DefiError34.unsupported(`NFT interface '${entry.interface}' not supported`);
  }
}
function createOracleFromLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`Oracle not available for lending interface '${entry.interface}'`);
  }
}
function createOracleFromCdp(entry, _asset, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError34.unsupported(`Oracle not available for CDP interface '${entry.interface}'`);
  }
}
function createMerchantMoeLB(entry, rpcUrl) {
  return new MerchantMoeLBAdapter(entry, rpcUrl);
}
function createKittenSwapFarming(entry, rpcUrl) {
  const farmingCenter = entry.contracts?.["farming_center"];
  if (!farmingCenter) {
    throw new DefiError34("CONTRACT_ERROR", `[${entry.name}] Missing 'farming_center' contract address`);
  }
  const eternalFarming = entry.contracts?.["eternal_farming"];
  if (!eternalFarming) {
    throw new DefiError34("CONTRACT_ERROR", `[${entry.name}] Missing 'eternal_farming' contract address`);
  }
  const positionManager = entry.contracts?.["position_manager"];
  if (!positionManager) {
    throw new DefiError34("CONTRACT_ERROR", `[${entry.name}] Missing 'position_manager' contract address`);
  }
  const factory = entry.contracts?.["factory"];
  return new KittenSwapFarmingAdapter(entry.name, farmingCenter, eternalFarming, positionManager, rpcUrl, factory);
}

// src/dex/dex_price.ts
var DexSpotPrice = class {
  /**
   * Get the spot price for `token` denominated in `quoteToken` (e.g. USDC).
   *
   * `tokenDecimals` — decimals of the input token (to know how much "1 unit" is)
   * `quoteDecimals` — decimals of the quote token (to convert the output to number)
   */
  static async getPrice(dex, token, tokenDecimals, quoteToken, quoteDecimals) {
    const amountIn = 10n ** BigInt(tokenDecimals);
    const quoteParams = {
      protocol: "",
      token_in: token,
      token_out: quoteToken,
      amount_in: amountIn
    };
    const quote = await dex.quote(quoteParams);
    const priceF64 = Number(quote.amount_out) / 10 ** quoteDecimals;
    let priceUsd;
    if (quoteDecimals < 18) {
      priceUsd = quote.amount_out * 10n ** BigInt(18 - quoteDecimals);
    } else if (quoteDecimals > 18) {
      priceUsd = quote.amount_out / 10n ** BigInt(quoteDecimals - 18);
    } else {
      priceUsd = quote.amount_out;
    }
    return {
      source: `dex:${dex.name()}`,
      source_type: "dex_spot",
      asset: token,
      price_usd: priceUsd,
      price_f64: priceF64,
      block_number: void 0,
      timestamp: void 0
    };
  }
};
export {
  AaveOracleAdapter,
  AaveV2Adapter,
  AaveV3Adapter,
  AlgebraV3Adapter,
  BalancerV3Adapter,
  CompoundV2Adapter,
  CompoundV3Adapter,
  CurveStableSwapAdapter,
  DexSpotPrice,
  ERC4626VaultAdapter,
  ERC721Adapter,
  EulerV2Adapter,
  FelixCdpAdapter,
  FelixOracleAdapter,
  GenericDerivativesAdapter,
  GenericLstAdapter,
  GenericOptionsAdapter,
  GenericYieldAdapter,
  HlpVaultAdapter,
  HybraGaugeAdapter,
  KinetiqAdapter,
  KittenSwapFarmingAdapter,
  MasterChefAdapter,
  MerchantMoeLBAdapter,
  MorphoBlueAdapter,
  PendleAdapter,
  RyskAdapter,
  SolidlyAdapter,
  SolidlyGaugeAdapter,
  StHypeAdapter,
  ThenaCLAdapter,
  UniswapV2Adapter,
  UniswapV3Adapter,
  WooFiAdapter,
  createCdp,
  createDerivatives,
  createDex,
  createGauge,
  createKittenSwapFarming,
  createLending,
  createLiquidStaking,
  createMasterChef,
  createMerchantMoeLB,
  createNft,
  createOptions,
  createOracleFromCdp,
  createOracleFromLending,
  createVault,
  createYieldSource
};
//# sourceMappingURL=index.js.map