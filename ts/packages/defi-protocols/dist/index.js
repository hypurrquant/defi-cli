// src/factory.ts
import { DefiError as DefiError31 } from "@hypurrquant/defi-core";

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
var algebraPositionManagerAbi = parseAbi3([
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
    const amount0 = rawAmount0 === 0n && rawAmount1 > 0n ? 1n : rawAmount0;
    const amount1 = rawAmount1 === 0n && rawAmount0 > 0n ? 1n : rawAmount1;
    const data = encodeFunctionData3({
      abi: algebraPositionManagerAbi,
      functionName: "mint",
      args: [
        {
          token0,
          token1,
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

// src/dex/woofi.ts
import { encodeFunctionData as encodeFunctionData7, parseAbi as parseAbi7, zeroAddress as zeroAddress3 } from "viem";
import { DefiError as DefiError7 } from "@hypurrquant/defi-core";
var abi5 = parseAbi7([
  "function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) external payable returns (uint256 realToAmount)"
]);
var WooFiAdapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError7("CONTRACT_ERROR", "Missing 'router' contract");
    }
    this.router = router;
  }
  name() {
    return this.protocolName;
  }
  async buildSwap(params) {
    const minToAmount = 0n;
    const data = encodeFunctionData7({
      abi: abi5,
      functionName: "swap",
      args: [
        params.token_in,
        params.token_out,
        params.amount_in,
        minToAmount,
        params.recipient,
        zeroAddress3
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
    throw DefiError7.unsupported(`[${this.protocolName}] quote requires RPC`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError7.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError7.unsupported(`[${this.protocolName}] WOOFi does not support LP positions via router`);
  }
};

// src/dex/solidly_gauge.ts
import { createPublicClient as createPublicClient4, encodeFunctionData as encodeFunctionData8, http as http4, parseAbi as parseAbi8, zeroAddress as zeroAddress4 } from "viem";
import { DefiError as DefiError8 } from "@hypurrquant/defi-core";
var gaugeAbi = parseAbi8([
  "function deposit(uint256 amount) external",
  "function depositFor(uint256 amount, uint256 tokenId) external",
  "function withdraw(uint256 amount) external",
  "function getReward(address account) external",
  "function getReward(address account, address[] tokens) external",
  "function earned(address account) external view returns (uint256)",
  "function earned(address token, address account) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function rewardsListLength() external view returns (uint256)",
  "function isReward(address token) external view returns (bool)"
]);
var veAbi = parseAbi8([
  "function create_lock(uint256 value, uint256 lock_duration) external returns (uint256)",
  "function increase_amount(uint256 tokenId, uint256 value) external",
  "function increase_unlock_time(uint256 tokenId, uint256 lock_duration) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
  "function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)"
]);
var voterAbi = parseAbi8([
  "function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external",
  "function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external",
  "function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external",
  "function gauges(address pool) external view returns (address)"
]);
var SolidlyGaugeAdapter = class {
  protocolName;
  voter;
  veToken;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const voter = entry.contracts?.["voter"];
    if (!voter) {
      throw new DefiError8("CONTRACT_ERROR", "Missing 'voter' contract");
    }
    const veToken = entry.contracts?.["ve_token"];
    if (!veToken) {
      throw new DefiError8("CONTRACT_ERROR", "Missing 've_token' contract");
    }
    this.voter = voter;
    this.veToken = veToken;
    this.rpcUrl = rpcUrl;
  }
  name() {
    return this.protocolName;
  }
  // IGauge
  async buildDeposit(gauge, amount, tokenId, lpToken) {
    if (tokenId !== void 0) {
      const data2 = encodeFunctionData8({
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
    const data = encodeFunctionData8({
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
    const data = encodeFunctionData8({
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
  async buildClaimRewards(gauge, account) {
    if (account && this.rpcUrl) {
      try {
        const client = createPublicClient4({ transport: http4(this.rpcUrl) });
        const listLen = await client.readContract({
          address: gauge,
          abi: gaugeAbi,
          functionName: "rewardsListLength"
        });
        if (listLen > 0n) {
          const data2 = encodeFunctionData8({
            abi: gaugeAbi,
            functionName: "getReward",
            args: [account, []]
          });
          return {
            description: `[${this.protocolName}] Claim gauge rewards`,
            to: gauge,
            data: data2,
            value: 0n,
            gas_estimate: 3e5
          };
        }
      } catch {
      }
    }
    const data = encodeFunctionData8({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [account ?? zeroAddress4]
    });
    return {
      description: `[${this.protocolName}] Claim gauge rewards`,
      to: gauge,
      data,
      value: 0n,
      gas_estimate: 2e5
    };
  }
  async getPendingRewards(_gauge, _user) {
    throw DefiError8.unsupported(`[${this.protocolName}] get_pending_rewards requires RPC`);
  }
  // IVoteEscrow
  async buildCreateLock(amount, lockDuration) {
    const data = encodeFunctionData8({
      abi: veAbi,
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
    const data = encodeFunctionData8({
      abi: veAbi,
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
    const data = encodeFunctionData8({
      abi: veAbi,
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
    const data = encodeFunctionData8({
      abi: veAbi,
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
    const data = encodeFunctionData8({
      abi: voterAbi,
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
    const data = encodeFunctionData8({
      abi: voterAbi,
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
    const data = encodeFunctionData8({
      abi: voterAbi,
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
import { encodeFunctionData as encodeFunctionData9, parseAbi as parseAbi9, createPublicClient as createPublicClient5, http as http5 } from "viem";
import { DefiError as DefiError9 } from "@hypurrquant/defi-core";
var masterchefAbi = parseAbi9([
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
      throw new DefiError9("CONTRACT_ERROR", "Missing 'masterchef' contract");
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
    const data = encodeFunctionData9({
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
    const data = encodeFunctionData9({
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
    const data = encodeFunctionData9({
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
    const data = encodeFunctionData9({
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
    const data = encodeFunctionData9({
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
      throw DefiError9.unsupported(`[${this.protocolName}] getPendingRewards requires RPC`);
    }
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
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
  encodeFunctionData as encodeFunctionData10,
  decodeFunctionResult as decodeFunctionResult2,
  parseAbi as parseAbi10,
  createPublicClient as createPublicClient6,
  http as http6
} from "viem";
import { DefiError as DefiError10, multicallRead as multicallRead2 } from "@hypurrquant/defi-core";
var lbRouterAbi = parseAbi10([
  "struct LiquidityParameters { address tokenX; address tokenY; uint256 binStep; uint256 amountX; uint256 amountY; uint256 amountXMin; uint256 amountYMin; uint256 activeIdDesired; uint256 idSlippage; int256[] deltaIds; uint256[] distributionX; uint256[] distributionY; address to; address refundTo; uint256 deadline; }",
  "function addLiquidity(LiquidityParameters calldata liquidityParameters) external returns (uint256 amountXAdded, uint256 amountYAdded, uint256 amountXLeft, uint256 amountYLeft, uint256[] memory depositIds, uint256[] memory liquidityMinted)",
  "function removeLiquidity(address tokenX, address tokenY, uint16 binStep, uint256 amountXMin, uint256 amountYMin, uint256[] memory ids, uint256[] memory amounts, address to, uint256 deadline) external returns (uint256 amountX, uint256 amountY)"
]);
var lbFactoryAbi = parseAbi10([
  "function getNumberOfLBPairs() external view returns (uint256)",
  "function getLBPairAtIndex(uint256 index) external view returns (address)"
]);
var lbPairAbi = parseAbi10([
  "function getLBHooksParameters() external view returns (bytes32)",
  "function getActiveId() external view returns (uint24)",
  "function getBinStep() external view returns (uint16)",
  "function getTokenX() external view returns (address)",
  "function getTokenY() external view returns (address)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)"
]);
var lbRewarderAbi = parseAbi10([
  "function getRewardToken() external view returns (address)",
  "function getRewardedRange() external view returns (uint256 minBinId, uint256 maxBinId)",
  "function getPendingRewards(address user, uint256[] calldata ids) external view returns (uint256 pendingRewards)",
  "function claim(address user, uint256[] calldata ids) external",
  "function getPid() external view returns (uint256)",
  "function isStopped() external view returns (bool)",
  "function getLBPair() external view returns (address)",
  "function getMasterChef() external view returns (address)"
]);
var masterChefAbi = parseAbi10([
  "function getMoePerSecond() external view returns (uint256)",
  "function getTreasuryShare() external view returns (uint256)",
  "function getStaticShare() external view returns (uint256)",
  "function getVeMoe() external view returns (address)"
]);
var veMoeAbi = parseAbi10([
  "function getWeight(uint256 pid) external view returns (uint256)",
  "function getTotalWeight() external view returns (uint256)",
  "function getTopPoolIds() external view returns (uint256[] memory)"
]);
var lbPairBinAbi = parseAbi10([
  "function getBin(uint24 id) external view returns (uint128 reserveX, uint128 reserveY)",
  "function getActiveId() external view returns (uint24)"
]);
var lbQuoterAbi2 = parseAbi10([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns ((address[] route, address[] pairs, uint256[] binSteps, uint256[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees))"
]);
var erc20Abi = parseAbi10([
  "function symbol() external view returns (string)"
]);
var _addressAbi = parseAbi10(["function f() external view returns (address)"]);
function decodeAddressResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _addressAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256Abi = parseAbi10(["function f() external view returns (uint256)"]);
function decodeUint256Result(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _uint256Abi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _boolAbi = parseAbi10(["function f() external view returns (bool)"]);
function decodeBoolResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _boolAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
function decodeStringResult(data) {
  if (!data) return "?";
  try {
    return decodeFunctionResult2({ abi: erc20Abi, functionName: "symbol", data });
  } catch {
    return "?";
  }
}
var _rangeAbi = parseAbi10(["function f() external view returns (uint256 minBinId, uint256 maxBinId)"]);
function decodeRangeResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _rangeAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _binAbi = parseAbi10(["function f() external view returns (uint128 reserveX, uint128 reserveY)"]);
function decodeBinResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _binAbi, functionName: "f", data });
  } catch {
    return null;
  }
}
var _uint256ArrayAbi = parseAbi10(["function f() external view returns (uint256[] memory)"]);
function decodeUint256ArrayResult(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult2({ abi: _uint256ArrayAbi, functionName: "f", data });
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
      throw new DefiError10("CONTRACT_ERROR", "Missing 'lb_router' contract address");
    }
    const lbFactory = entry.contracts?.["lb_factory"];
    if (!lbFactory) {
      throw new DefiError10("CONTRACT_ERROR", "Missing 'lb_factory' contract address");
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
      throw DefiError10.rpcError(`[${this.protocolName}] RPC URL required`);
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
      const client = createPublicClient6({ transport: http6(rpcUrl) });
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
    const data = encodeFunctionData10({
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
    const data = encodeFunctionData10({
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
    const client = createPublicClient6({ transport: http6(rpcUrl) });
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
    const client = createPublicClient6({ transport: http6(rpcUrl) });
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
    const client = createPublicClient6({ transport: http6(rpcUrl) });
    const hooksParams = await client.readContract({
      address: pool,
      abi: lbPairAbi,
      functionName: "getLBHooksParameters"
    });
    const rewarder = extractRewarderAddress(hooksParams);
    if (!rewarder) {
      throw new DefiError10("CONTRACT_ERROR", `[${this.protocolName}] Pool ${pool} has no active rewarder`);
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
    const data = encodeFunctionData10({
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
    const client = createPublicClient6({ transport: http6(rpcUrl) });
    const pairCount = await client.readContract({
      address: this.lbFactory,
      abi: lbFactoryAbi,
      functionName: "getNumberOfLBPairs"
    });
    const count = Number(pairCount);
    if (count === 0) return [];
    const batch1Calls = Array.from({ length: count }, (_, i) => [
      this.lbFactory,
      encodeFunctionData10({ abi: lbFactoryAbi, functionName: "getLBPairAtIndex", args: [BigInt(i)] })
    ]);
    const batch1Results = await multicallRead2(rpcUrl, batch1Calls);
    const pairAddresses = batch1Results.map((r) => decodeAddressResult(r)).filter((a) => a !== null);
    if (pairAddresses.length === 0) return [];
    const batch2Calls = pairAddresses.map((pair) => [
      pair,
      encodeFunctionData10({ abi: lbPairAbi, functionName: "getLBHooksParameters" })
    ]);
    const batch2Results = await multicallRead2(rpcUrl, batch2Calls);
    const rewardedPairs = [];
    for (let i = 0; i < pairAddresses.length; i++) {
      const raw = batch2Results[i];
      if (!raw) continue;
      let hooksBytes;
      try {
        const _bytes32Abi = parseAbi10(["function f() external view returns (bytes32)"]);
        hooksBytes = decodeFunctionResult2({ abi: _bytes32Abi, functionName: "f", data: raw });
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
      batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "isStopped" })]);
      batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getRewardedRange" })]);
      batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getRewardToken" })]);
      batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getPid" })]);
      batch3Calls.push([rewarder, encodeFunctionData10({ abi: lbRewarderAbi, functionName: "getMasterChef" })]);
    }
    const batch3Results = await multicallRead2(rpcUrl, batch3Calls);
    const batch4aCalls = [];
    for (const { pool } of rewardedPairs) {
      batch4aCalls.push([pool, encodeFunctionData10({ abi: lbPairAbi, functionName: "getTokenX" })]);
      batch4aCalls.push([pool, encodeFunctionData10({ abi: lbPairAbi, functionName: "getTokenY" })]);
    }
    const batch4aResults = await multicallRead2(rpcUrl, batch4aCalls);
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
      encodeFunctionData10({ abi: erc20Abi, functionName: "symbol" })
    ]);
    const batch4bResults = await multicallRead2(rpcUrl, batch4bCalls);
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
        [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getMoePerSecond" })],
        [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getTreasuryShare" })],
        [masterChefAddr, encodeFunctionData10({ abi: masterChefAbi, functionName: "getStaticShare" })],
        [veMoeAddr, encodeFunctionData10({ abi: veMoeAbi, functionName: "getTotalWeight" })],
        [veMoeAddr, encodeFunctionData10({ abi: veMoeAbi, functionName: "getTopPoolIds" })]
      ];
      const batch5Results = await multicallRead2(rpcUrl, batch5Calls);
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
        encodeFunctionData10({ abi: veMoeAbi, functionName: "getWeight", args: [BigInt(d.pid)] })
      ]);
      const batch6Results = await multicallRead2(rpcUrl, batch6Calls);
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
        encodeFunctionData10({ abi: lbPairBinAbi, functionName: "getBin", args: [binId] })
      ]);
      const batch7Results = await multicallRead2(rpcUrl, batch7Calls);
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
    const stableSymbols = /* @__PURE__ */ new Set(["USDT", "USDC", "MUSD", "AUSD", "USDY", "FDUSD"]);
    const mntSymbols = /* @__PURE__ */ new Set(["WMNT", "MNT"]);
    const moeSymbols = /* @__PURE__ */ new Set(["MOE"]);
    const sixDecimalStables = /* @__PURE__ */ new Set(["USDT", "USDC", "FDUSD"]);
    const getTokenPriceUsd = (sym) => {
      if (stableSymbols.has(sym)) return 1;
      if (mntSymbols.has(sym)) return wmntPriceUsd;
      if (moeSymbols.has(sym)) return moePriceUsd;
      return 0;
    };
    const getTokenDecimals = (sym) => {
      return sixDecimalStables.has(sym) ? 6 : 18;
    };
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
          const priceX = getTokenPriceUsd(symX);
          const priceY = getTokenPriceUsd(symY);
          const decX = getTokenDecimals(symX);
          const decY = getTokenDecimals(symY);
          for (let b = minBin; b <= maxBin; b++) {
            const rx = rxMap.get(b) ?? 0n;
            const ry = ryMap.get(b) ?? 0n;
            rangeTvlUsd += Number(rx) / 10 ** decX * priceX;
            rangeTvlUsd += Number(ry) / 10 ** decY * priceY;
          }
        }
      }
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
        aprPercent,
        rewardedBins
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
    const client = createPublicClient6({ transport: http6(rpcUrl) });
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

// src/lending/aave_v3.ts
import { createPublicClient as createPublicClient7, http as http7, parseAbi as parseAbi11, encodeFunctionData as encodeFunctionData11, decodeFunctionResult as decodeFunctionResult3, zeroAddress as zeroAddress5 } from "viem";
import {
  DefiError as DefiError11,
  multicallRead as multicallRead3,
  decodeU256,
  InterestRateMode
} from "@hypurrquant/defi-core";
var POOL_ABI = parseAbi11([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)"
]);
var ERC20_ABI = parseAbi11([
  "function totalSupply() external view returns (uint256)"
]);
var INCENTIVES_ABI = parseAbi11([
  "function getIncentivesController() external view returns (address)"
]);
var REWARDS_CONTROLLER_ABI = parseAbi11([
  "function getRewardsByAsset(address asset) external view returns (address[])",
  "function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionsPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)"
]);
var POOL_PROVIDER_ABI = parseAbi11([
  "function ADDRESSES_PROVIDER() external view returns (address)"
]);
var ADDRESSES_PROVIDER_ABI = parseAbi11([
  "function getPriceOracle() external view returns (address)"
]);
var ORACLE_ABI = parseAbi11([
  "function getAssetPrice(address asset) external view returns (uint256)",
  "function BASE_CURRENCY_UNIT() external view returns (uint256)"
]);
var ERC20_DECIMALS_ABI = parseAbi11([
  "function decimals() external view returns (uint8)"
]);
function u256ToF64(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
function decodeAddress(data) {
  if (!data || data.length < 66) return null;
  return `0x${data.slice(26, 66)}`;
}
function decodeAddressArray(data) {
  if (!data) return [];
  try {
    return decodeFunctionResult3({
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
    return decodeFunctionResult3({
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
    return decodeFunctionResult3({
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
    if (!pool) throw DefiError11.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    if (!this.rpcUrl) throw DefiError11.rpcError("No RPC URL configured");
    const reserveCallData = encodeFunctionData11({
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset]
    });
    const [reserveRaw] = await multicallRead3(this.rpcUrl, [
      [this.pool, reserveCallData]
    ]).catch((e) => {
      throw DefiError11.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const reserveDecoded = decodeReserveData(reserveRaw ?? null);
    if (!reserveDecoded) {
      throw DefiError11.rpcError(`[${this.protocolName}] getReserveData returned no data`);
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
    const [supplyRaw, borrowRaw] = await multicallRead3(this.rpcUrl, [
      [aTokenAddress, encodeFunctionData11({ abi: ERC20_ABI, functionName: "totalSupply" })],
      [variableDebtTokenAddress, encodeFunctionData11({ abi: ERC20_ABI, functionName: "totalSupply" })]
    ]);
    const totalSupply = decodeU256(supplyRaw ?? null);
    const totalBorrow = decodeU256(borrowRaw ?? null);
    const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;
    const supplyRewardTokens = [];
    const borrowRewardTokens = [];
    const supplyEmissions = [];
    const borrowEmissions = [];
    try {
      const [controllerRaw] = await multicallRead3(this.rpcUrl, [
        [aTokenAddress, encodeFunctionData11({ abi: INCENTIVES_ABI, functionName: "getIncentivesController" })]
      ]);
      const controllerAddr = decodeAddress(controllerRaw ?? null);
      if (controllerAddr && controllerAddr !== zeroAddress5) {
        const [supplyRewardsRaw, borrowRewardsRaw] = await multicallRead3(this.rpcUrl, [
          [controllerAddr, encodeFunctionData11({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [aTokenAddress] })],
          [controllerAddr, encodeFunctionData11({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsByAsset", args: [variableDebtTokenAddress] })]
        ]);
        const supplyRewards = decodeAddressArray(supplyRewardsRaw ?? null);
        const borrowRewards = decodeAddressArray(borrowRewardsRaw ?? null);
        const rewardsDataCalls = [
          ...supplyRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData11({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [aTokenAddress, reward] })
          ]),
          ...borrowRewards.map((reward) => [
            controllerAddr,
            encodeFunctionData11({ abi: REWARDS_CONTROLLER_ABI, functionName: "getRewardsData", args: [variableDebtTokenAddress, reward] })
          ])
        ];
        if (rewardsDataCalls.length > 0) {
          const rewardsDataResults = await multicallRead3(this.rpcUrl, rewardsDataCalls);
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
        const [providerRaw] = await multicallRead3(this.rpcUrl, [
          [this.pool, encodeFunctionData11({ abi: POOL_PROVIDER_ABI, functionName: "ADDRESSES_PROVIDER" })]
        ]);
        const providerAddr = decodeAddress(providerRaw ?? null);
        if (!providerAddr) throw new Error("No provider address");
        const [oracleRaw] = await multicallRead3(this.rpcUrl, [
          [providerAddr, encodeFunctionData11({ abi: ADDRESSES_PROVIDER_ABI, functionName: "getPriceOracle" })]
        ]);
        const oracleAddr = decodeAddress(oracleRaw ?? null);
        if (!oracleAddr) throw new Error("No oracle address");
        const [assetPriceRaw, baseCurrencyUnitRaw, assetDecimalsRaw] = await multicallRead3(this.rpcUrl, [
          [oracleAddr, encodeFunctionData11({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [asset] })],
          [oracleAddr, encodeFunctionData11({ abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" })],
          [asset, encodeFunctionData11({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const assetPrice = decodeU256(assetPriceRaw ?? null);
        const baseCurrencyUnit = decodeU256(baseCurrencyUnitRaw ?? null);
        const assetDecimals = assetDecimalsRaw ? Number(decodeU256(assetDecimalsRaw)) : 18;
        const priceUnit = Number(baseCurrencyUnit) || 1e8;
        const assetPriceF = Number(assetPrice) / priceUnit;
        const assetDecimalsDivisor = 10 ** assetDecimals;
        const allRewardTokens = Array.from(/* @__PURE__ */ new Set([...supplyRewardTokens, ...borrowRewardTokens]));
        const rewardPriceCalls = allRewardTokens.flatMap((token) => [
          [oracleAddr, encodeFunctionData11({ abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] })],
          [token, encodeFunctionData11({ abi: ERC20_DECIMALS_ABI, functionName: "decimals" })]
        ]);
        const rewardPriceResults = rewardPriceCalls.length > 0 ? await multicallRead3(this.rpcUrl, rewardPriceCalls) : [];
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
    if (!this.rpcUrl) throw DefiError11.rpcError("No RPC URL configured");
    const client = createPublicClient7({ transport: http7(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError11.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvBps = u256ToF64(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress5, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress5, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
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
import { createPublicClient as createPublicClient8, http as http8, parseAbi as parseAbi12, encodeFunctionData as encodeFunctionData12, zeroAddress as zeroAddress6 } from "viem";
import {
  DefiError as DefiError12,
  InterestRateMode as InterestRateMode2
} from "@hypurrquant/defi-core";
var POOL_ABI2 = parseAbi12([
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
var ERC20_ABI2 = parseAbi12([
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
    if (!pool) throw DefiError12.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    if (!this.rpcUrl) throw DefiError12.rpcError("No RPC URL configured");
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getReserveData",
      args: [asset]
    }).catch((e) => {
      throw DefiError12.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
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
    if (!this.rpcUrl) throw DefiError12.rpcError("No RPC URL configured");
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI2,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError12.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF642(totalCollateralBase) / 1e18;
    const debtUsd = u256ToF642(totalDebtBase) / 1e18;
    const ltvBps = u256ToF642(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress6, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress6, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
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
import { createPublicClient as createPublicClient9, http as http9, parseAbi as parseAbi13 } from "viem";
import { DefiError as DefiError13 } from "@hypurrquant/defi-core";
var ORACLE_ABI2 = parseAbi13([
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
    if (!rpcUrl) throw DefiError13.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const oracle = entry.contracts?.["oracle"];
    if (!oracle) throw DefiError13.contractError(`[${entry.name}] Missing 'oracle' contract address`);
    this.oracle = oracle;
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError13.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const priceVal = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetPrice",
      args: [asset]
    }).catch((e) => {
      throw DefiError13.rpcError(`[${this.protocolName}] getAssetPrice failed: ${e}`);
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
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError13.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const rawPrices = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI2,
      functionName: "getAssetsPrices",
      args: [assets]
    }).catch((e) => {
      throw DefiError13.rpcError(`[${this.protocolName}] getAssetsPrices failed: ${e}`);
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
import { createPublicClient as createPublicClient10, http as http10, parseAbi as parseAbi14, encodeFunctionData as encodeFunctionData13 } from "viem";
import {
  DefiError as DefiError14
} from "@hypurrquant/defi-core";
var CTOKEN_ABI = parseAbi14([
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
    if (!vtoken) throw DefiError14.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    if (!this.rpcUrl) throw DefiError14.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    const [supplyRate, borrowRate, totalSupply, totalBorrows] = await Promise.all([
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e) => {
        throw DefiError14.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e) => {
        throw DefiError14.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`);
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
    throw DefiError14.unsupported(
      `[${this.protocolName}] User position requires querying individual vToken balances`
    );
  }
};

// src/lending/compound_v3.ts
import { createPublicClient as createPublicClient11, http as http11, parseAbi as parseAbi15, encodeFunctionData as encodeFunctionData14 } from "viem";
import {
  DefiError as DefiError15
} from "@hypurrquant/defi-core";
var COMET_ABI = parseAbi15([
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
    if (!comet) throw DefiError15.contractError("Missing 'comet_usdc' or 'comet' address");
    this.comet = comet;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData14({
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
    const data = encodeFunctionData14({
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
    const data = encodeFunctionData14({
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
    const data = encodeFunctionData14({
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
    if (!this.rpcUrl) throw DefiError15.rpcError("No RPC URL configured");
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const utilization = await client.readContract({
      address: this.comet,
      abi: COMET_ABI,
      functionName: "getUtilization"
    }).catch((e) => {
      throw DefiError15.rpcError(`[${this.protocolName}] getUtilization failed: ${e}`);
    });
    const [supplyRate, borrowRate, totalSupply, totalBorrow] = await Promise.all([
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [utilization] }).catch((e) => {
        throw DefiError15.rpcError(`[${this.protocolName}] getSupplyRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [utilization] }).catch((e) => {
        throw DefiError15.rpcError(`[${this.protocolName}] getBorrowRate failed: ${e}`);
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
    throw DefiError15.unsupported(
      `[${this.protocolName}] User position requires querying Comet balanceOf + borrowBalanceOf`
    );
  }
};

// src/lending/euler_v2.ts
import { createPublicClient as createPublicClient12, http as http12, parseAbi as parseAbi16, encodeFunctionData as encodeFunctionData15 } from "viem";
import {
  DefiError as DefiError16
} from "@hypurrquant/defi-core";
var EULER_VAULT_ABI = parseAbi16([
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
    if (!euler) throw DefiError16.contractError("Missing 'evk_vault' or 'euler' contract address");
    this.euler = euler;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData15({
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
    const data = encodeFunctionData15({
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
    const data = encodeFunctionData15({
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
    const data = encodeFunctionData15({
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
    if (!this.rpcUrl) throw DefiError16.rpcError("No RPC URL configured");
    const client = createPublicClient12({ transport: http12(this.rpcUrl) });
    const [totalSupply, totalBorrows, interestRate] = await Promise.all([
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError16.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalBorrows" }).catch((e) => {
        throw DefiError16.rpcError(`[${this.protocolName}] totalBorrows failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "interestRate" }).catch((e) => {
        throw DefiError16.rpcError(`[${this.protocolName}] interestRate failed: ${e}`);
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
    throw DefiError16.unsupported(
      `[${this.protocolName}] Euler V2 user positions require querying individual vault balances. Use the vault address directly to check balanceOf(user) for supply positions.`
    );
  }
};

// src/lending/morpho.ts
import { parseAbi as parseAbi17, encodeFunctionData as encodeFunctionData16, decodeFunctionResult as decodeFunctionResult4, zeroAddress as zeroAddress7 } from "viem";
import {
  DefiError as DefiError17,
  multicallRead as multicallRead4,
  decodeU256 as decodeU2562
} from "@hypurrquant/defi-core";
var MORPHO_ABI = parseAbi17([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)"
]);
var META_MORPHO_ABI = parseAbi17([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
]);
var IRM_ABI = parseAbi17([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)"
]);
var SECONDS_PER_YEAR3 = 365.25 * 24 * 3600;
function defaultMarketParams(loanToken = zeroAddress7) {
  return {
    loanToken,
    collateralToken: zeroAddress7,
    oracle: zeroAddress7,
    irm: zeroAddress7,
    lltv: 0n
  };
}
function decodeMarket(data) {
  if (!data) return null;
  try {
    return decodeFunctionResult4({
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
    return decodeFunctionResult4({
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
    if (!morpho) throw DefiError17.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault = contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData16({
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
    const data = encodeFunctionData16({
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
    const data = encodeFunctionData16({
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
    const data = encodeFunctionData16({
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
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      throw DefiError17.contractError(`[${this.protocolName}] No MetaMorpho vault configured for rate query`);
    }
    const [queueLenRaw] = await multicallRead4(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData16({ abi: META_MORPHO_ABI, functionName: "supplyQueueLength" })]
    ]).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`);
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
    const [marketIdRaw] = await multicallRead4(this.rpcUrl, [
      [this.defaultVault, encodeFunctionData16({ abi: META_MORPHO_ABI, functionName: "supplyQueue", args: [0n] })]
    ]).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`);
    });
    if (!marketIdRaw || marketIdRaw.length < 66) {
      throw DefiError17.rpcError(`[${this.protocolName}] supplyQueue(0) returned no data`);
    }
    const marketId = marketIdRaw.slice(0, 66);
    const [marketRaw, paramsRaw] = await multicallRead4(this.rpcUrl, [
      [this.morpho, encodeFunctionData16({ abi: MORPHO_ABI, functionName: "market", args: [marketId] })],
      [this.morpho, encodeFunctionData16({ abi: MORPHO_ABI, functionName: "idToMarketParams", args: [marketId] })]
    ]).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] market/idToMarketParams failed: ${e}`);
    });
    const mktDecoded = decodeMarket(marketRaw ?? null);
    if (!mktDecoded) throw DefiError17.rpcError(`[${this.protocolName}] market() returned no data`);
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mktDecoded;
    const paramsDecoded = decodeMarketParams(paramsRaw ?? null);
    if (!paramsDecoded) throw DefiError17.rpcError(`[${this.protocolName}] idToMarketParams returned no data`);
    const [loanToken, collateralToken, oracle, irm, lltv] = paramsDecoded;
    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;
    const irmMarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };
    const borrowRatePerSec = await (async () => {
      const [borrowRateRaw] = await multicallRead4(this.rpcUrl, [
        [irm, encodeFunctionData16({ abi: IRM_ABI, functionName: "borrowRateView", args: [irmMarketParams, irmMarket] })]
      ]).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`);
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
    throw DefiError17.unsupported(
      `[${this.protocolName}] Morpho Blue user positions are per-market \u2014 use vault deposit/withdraw instead`
    );
  }
};

// src/cdp/felix.ts
import { createPublicClient as createPublicClient13, http as http13, parseAbi as parseAbi18, encodeFunctionData as encodeFunctionData17, zeroAddress as zeroAddress8 } from "viem";
import {
  DefiError as DefiError18
} from "@hypurrquant/defi-core";
var BORROWER_OPS_ABI = parseAbi18([
  "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
  "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
  "function closeTrove(uint256 _troveId) external"
]);
var TROVE_MANAGER_ABI = parseAbi18([
  "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)"
]);
var HINT_HELPERS_ABI = parseAbi18([
  "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)"
]);
var SORTED_TROVES_ABI = parseAbi18([
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
    if (!bo) throw DefiError18.contractError("Missing 'borrower_operations' contract");
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
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
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
    const data = encodeFunctionData17({
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
    const data = encodeFunctionData17({
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
    const data = encodeFunctionData17({
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
    if (!this.rpcUrl) throw DefiError18.rpcError(`[${this.protocolName}] getCdpInfo requires RPC \u2014 set HYPEREVM_RPC_URL`);
    if (!this.troveManager) throw DefiError18.contractError(`[${this.protocolName}] trove_manager contract not configured`);
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    const data = await client.readContract({
      address: this.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getLatestTroveData",
      args: [cdpId]
    }).catch((e) => {
      throw DefiError18.invalidParam(`[${this.protocolName}] Trove ${cdpId} not found: ${e}`);
    });
    const [entireDebt, entireColl] = data;
    if (entireDebt === 0n && entireColl === 0n) {
      throw DefiError18.invalidParam(`[${this.protocolName}] Trove ${cdpId} does not exist`);
    }
    const collRatio = entireDebt > 0n ? Number(entireColl) / Number(entireDebt) : 0;
    return {
      protocol: this.protocolName,
      cdp_id: cdpId,
      collateral: {
        token: zeroAddress8,
        symbol: "WHYPE",
        amount: entireColl,
        decimals: 18
      },
      debt: {
        token: zeroAddress8,
        symbol: "feUSD",
        amount: entireDebt,
        decimals: 18
      },
      collateral_ratio: collRatio
    };
  }
};

// src/cdp/felix_oracle.ts
import { createPublicClient as createPublicClient14, http as http14, parseAbi as parseAbi19 } from "viem";
import { DefiError as DefiError19 } from "@hypurrquant/defi-core";
var PRICE_FEED_ABI = parseAbi19([
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
    if (!rpcUrl) throw DefiError19.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const feed = contracts["price_feed"];
    if (!feed) throw DefiError19.contractError(`[${entry.name}] Missing 'price_feed' contract address`);
    this.priceFeed = feed;
    this.asset = contracts["asset"] ?? "0x0000000000000000000000000000000000000000";
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    if (asset !== this.asset && this.asset !== "0x0000000000000000000000000000000000000000") {
      throw DefiError19.unsupported(`[${this.protocolName}] Felix PriceFeed only supports asset ${this.asset}`);
    }
    const client = createPublicClient14({ transport: http14(this.rpcUrl) });
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
        throw DefiError19.rpcError(`[${this.protocolName}] lastGoodPrice failed: ${e}`);
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
import { createPublicClient as createPublicClient15, http as http15, parseAbi as parseAbi20, encodeFunctionData as encodeFunctionData18 } from "viem";
import {
  DefiError as DefiError20
} from "@hypurrquant/defi-core";
var ERC4626_ABI = parseAbi20([
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
    if (!vault) throw DefiError20.contractError("Missing 'vault' contract address");
    this.vaultAddress = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildDeposit(assets, receiver) {
    const data = encodeFunctionData18({
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
    const data = encodeFunctionData18({
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
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets"
    }).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
    });
  }
  async convertToShares(assets) {
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets]
    }).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] convertToShares failed: ${e}`);
    });
  }
  async convertToAssets(shares) {
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares]
    }).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] convertToAssets failed: ${e}`);
    });
  }
  async getVaultInfo() {
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    const client = createPublicClient15({ transport: http15(this.rpcUrl) });
    const [totalAssets, totalSupply, asset] = await Promise.all([
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalAssets" }).catch((e) => {
        throw DefiError20.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError20.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "asset" }).catch((e) => {
        throw DefiError20.rpcError(`[${this.protocolName}] asset failed: ${e}`);
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
import { parseAbi as parseAbi21, encodeFunctionData as encodeFunctionData19 } from "viem";
import {
  DefiError as DefiError21
} from "@hypurrquant/defi-core";
var GENERIC_LST_ABI = parseAbi21([
  "function stake() external payable returns (uint256)",
  "function unstake(uint256 amount) external returns (uint256)"
]);
var GenericLstAdapter = class {
  protocolName;
  staking;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError21.contractError("Missing 'staking' contract");
    this.staking = staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData19({ abi: GENERIC_LST_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData19({
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
    throw DefiError21.unsupported(`[${this.protocolName}] getInfo requires RPC`);
  }
};

// src/liquid_staking/sthype.ts
import { createPublicClient as createPublicClient16, http as http16, parseAbi as parseAbi22, encodeFunctionData as encodeFunctionData20, zeroAddress as zeroAddress9 } from "viem";
import {
  DefiError as DefiError22
} from "@hypurrquant/defi-core";
var STHYPE_ABI = parseAbi22([
  "function submit(address referral) external payable returns (uint256)",
  "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)"
]);
var ERC20_ABI3 = parseAbi22([
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
    if (!staking) throw DefiError22.contractError("Missing 'staking' contract");
    this.staking = staking;
    this.sthypeToken = entry.contracts?.["sthype_token"];
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData20({
      abi: STHYPE_ABI,
      functionName: "submit",
      args: [zeroAddress9]
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
    const data = encodeFunctionData20({
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
    if (!this.rpcUrl) throw DefiError22.rpcError("No RPC URL configured");
    const client = createPublicClient16({ transport: http16(this.rpcUrl) });
    const tokenAddr = this.sthypeToken ?? this.staking;
    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI3,
      functionName: "totalSupply"
    }).catch((e) => {
      throw DefiError22.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
    });
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress9,
      liquid_token: tokenAddr,
      exchange_rate: 1,
      total_staked: totalSupply
    };
  }
};

// src/liquid_staking/kinetiq.ts
import { createPublicClient as createPublicClient17, http as http17, parseAbi as parseAbi23, encodeFunctionData as encodeFunctionData21, zeroAddress as zeroAddress10 } from "viem";
import {
  DefiError as DefiError23
} from "@hypurrquant/defi-core";
var KINETIQ_ABI = parseAbi23([
  "function stake() external payable returns (uint256)",
  "function requestUnstake(uint256 amount) external returns (uint256)",
  "function totalStaked() external view returns (uint256)"
]);
var ORACLE_ABI3 = parseAbi23([
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
    if (!staking) throw DefiError23.contractError("Missing 'staking' contract address");
    this.staking = staking;
    this.liquidToken = entry.contracts?.["khype_token"] ?? staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData21({ abi: KINETIQ_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 3e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData21({
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
    if (!this.rpcUrl) throw DefiError23.rpcError("No RPC URL configured");
    const client = createPublicClient17({ transport: http17(this.rpcUrl) });
    const totalStaked = await client.readContract({
      address: this.staking,
      abi: KINETIQ_ABI,
      functionName: "totalStaked"
    }).catch((e) => {
      throw DefiError23.rpcError(`[${this.protocolName}] totalStaked failed: ${e}`);
    });
    const [khypePrice, hypePrice] = await Promise.all([
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [this.liquidToken] }).catch(() => 0n),
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI3, functionName: "getAssetPrice", args: [WHYPE] }).catch(() => 0n)
    ]);
    const rateF64 = hypePrice > 0n && khypePrice > 0n ? Number(khypePrice * 10n ** 18n / hypePrice) / 1e18 : 1;
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress10,
      liquid_token: this.liquidToken,
      exchange_rate: rateF64,
      total_staked: totalStaked
    };
  }
};

// src/yield_source/pendle.ts
import {
  DefiError as DefiError24
} from "@hypurrquant/defi-core";
var PendleAdapter = class {
  protocolName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    if (!entry.contracts?.["router"]) {
      throw DefiError24.contractError("Missing 'router' contract");
    }
  }
  name() {
    return this.protocolName;
  }
  async getYields() {
    throw DefiError24.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError24.unsupported(
      `[${this.protocolName}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError24.unsupported(
      `[${this.protocolName}] Pendle withdraw requires market-specific params`
    );
  }
};

// src/yield_source/generic_yield.ts
import {
  DefiError as DefiError25
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
    throw DefiError25.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError25.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError25.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.`
    );
  }
};

// src/derivatives/hlp.ts
import { parseAbi as parseAbi24, encodeFunctionData as encodeFunctionData22 } from "viem";
import {
  DefiError as DefiError26
} from "@hypurrquant/defi-core";
var HLP_ABI = parseAbi24([
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)"
]);
var HlpVaultAdapter = class {
  protocolName;
  vault;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError26.contractError("Missing 'vault' contract");
    this.vault = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildOpenPosition(params) {
    const data = encodeFunctionData22({
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
    const data = encodeFunctionData22({
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
  DefiError as DefiError27
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
    throw DefiError27.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
  async buildClosePosition(_params) {
    throw DefiError27.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
};

// src/options/rysk.ts
import { parseAbi as parseAbi25, encodeFunctionData as encodeFunctionData23 } from "viem";
import {
  DefiError as DefiError28
} from "@hypurrquant/defi-core";
var RYSK_ABI = parseAbi25([
  "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
  "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)"
]);
var RyskAdapter = class {
  protocolName;
  controller;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const controller = entry.contracts?.["controller"];
    if (!controller) throw DefiError28.contractError("Missing 'controller' contract");
    this.controller = controller;
  }
  name() {
    return this.protocolName;
  }
  async buildBuy(params) {
    const data = encodeFunctionData23({
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
    const data = encodeFunctionData23({
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
  DefiError as DefiError29
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
    throw DefiError29.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
  async buildSell(_params) {
    throw DefiError29.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
};

// src/nft/erc721.ts
import { createPublicClient as createPublicClient18, http as http18, parseAbi as parseAbi26 } from "viem";
import { DefiError as DefiError30 } from "@hypurrquant/defi-core";
var ERC721_ABI = parseAbi26([
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
    if (!this.rpcUrl) throw DefiError30.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    const [collectionName, symbol, totalSupply] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "name" }).catch((e) => {
        throw DefiError30.rpcError(`[${this.protocolName}] name failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "symbol" }).catch((e) => {
        throw DefiError30.rpcError(`[${this.protocolName}] symbol failed: ${e}`);
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
    if (!this.rpcUrl) throw DefiError30.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    const [owner, tokenUri] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] }).catch((e) => {
        throw DefiError30.rpcError(`[${this.protocolName}] ownerOf failed: ${e}`);
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
    if (!this.rpcUrl) throw DefiError30.rpcError("No RPC URL configured");
    const client = createPublicClient18({ transport: http18(this.rpcUrl) });
    return client.readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] }).catch((e) => {
      throw DefiError30.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
    });
  }
};

// src/factory.ts
function createDex(entry, rpcUrl) {
  switch (entry.interface) {
    case "uniswap_v3":
      return new UniswapV3Adapter(entry, rpcUrl);
    case "uniswap_v4":
      throw DefiError31.unsupported(
        `[${entry.name}] Uniswap V4 (singleton PoolManager) is not yet supported \u2014 use HyperSwap V3 or another V3-compatible DEX for quotes`
      );
    case "algebra_v3":
      return new AlgebraV3Adapter(entry, rpcUrl);
    case "uniswap_v2":
      return new UniswapV2Adapter(entry, rpcUrl);
    case "solidly_v2":
    case "solidly_cl":
      return new SolidlyAdapter(entry, rpcUrl);
    case "curve_stableswap":
      return new CurveStableSwapAdapter(entry);
    case "balancer_v3":
      return new BalancerV3Adapter(entry);
    case "woofi":
      return new WooFiAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`DEX interface '${entry.interface}' not yet implemented`);
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
      throw DefiError31.unsupported(`Lending interface '${entry.interface}' not yet implemented`);
  }
}
function createCdp(entry, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixCdpAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`CDP interface '${entry.interface}' not yet implemented`);
  }
}
function createVault(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc4626":
    case "beefy_vault":
      return new ERC4626VaultAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`Vault interface '${entry.interface}' not yet implemented`);
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
function createGauge(entry, rpcUrl) {
  switch (entry.interface) {
    case "solidly_v2":
    case "solidly_cl":
    case "algebra_v3":
    case "hybra":
      return new SolidlyGaugeAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`Gauge interface '${entry.interface}' not supported`);
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
      throw DefiError31.unsupported(`NFT marketplace '${entry.name}' is not queryable as ERC-721. Use a specific collection address.`);
    default:
      throw DefiError31.unsupported(`NFT interface '${entry.interface}' not supported`);
  }
}
function createOracleFromLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`Oracle not available for lending interface '${entry.interface}'`);
  }
}
function createOracleFromCdp(entry, _asset, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError31.unsupported(`Oracle not available for CDP interface '${entry.interface}'`);
  }
}
function createMerchantMoeLB(entry, rpcUrl) {
  return new MerchantMoeLBAdapter(entry, rpcUrl);
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
  KinetiqAdapter,
  MasterChefAdapter,
  MerchantMoeLBAdapter,
  MorphoBlueAdapter,
  PendleAdapter,
  RyskAdapter,
  SolidlyAdapter,
  SolidlyGaugeAdapter,
  StHypeAdapter,
  UniswapV2Adapter,
  UniswapV3Adapter,
  WooFiAdapter,
  createCdp,
  createDerivatives,
  createDex,
  createGauge,
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