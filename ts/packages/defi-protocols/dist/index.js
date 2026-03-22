// src/factory.ts
import { DefiError as DefiError28 } from "@hypurrquant/defi-core";

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
var positionManagerAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);
var UniswapV3Adapter = class {
  protocolName;
  router;
  quoter;
  positionManager;
  fee;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.quoter = entry.contracts?.["quoter"];
    this.positionManager = entry.contracts?.["position_manager"];
    this.fee = DEFAULT_FEE;
    this.rpcUrl = rpcUrl;
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
      gas_estimate: 2e5
    };
  }
  async quote(params) {
    if (!this.rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured");
    }
    if (this.quoter) {
      const client2 = createPublicClient({ transport: http(this.rpcUrl) });
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
              fee: this.fee,
              sqrtPriceLimitX96: 0n
            }
          ]
        })
      });
      if (!result.data) {
        throw DefiError.rpcError(`[${this.protocolName}] quoteExactInputSingle returned no data`);
      }
      const [amountOut2] = decodeAbiParameters(
        [{ name: "amountOut", type: "uint256" }],
        result.data
      );
      return {
        protocol: this.protocolName,
        amount_out: amountOut2,
        price_impact_bps: void 0,
        fee_bps: Math.floor(this.fee / 10),
        route: [`${params.token_in} -> ${params.token_out}`]
      };
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
    const [token0, token1, amount0, amount1] = params.token_a.toLowerCase() < params.token_b.toLowerCase() ? [params.token_a, params.token_b, params.amount_a, params.amount_b] : [params.token_b, params.token_a, params.amount_b, params.amount_a];
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
      gas_estimate: 5e5
    };
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError.unsupported(
      `[${this.protocolName}] remove_liquidity requires tokenId \u2014 use NFT position manager directly`
    );
  }
};

// src/dex/uniswap_v2.ts
import { encodeFunctionData as encodeFunctionData2, parseAbi as parseAbi2 } from "viem";
import { DefiError as DefiError2 } from "@hypurrquant/defi-core";
var abi = parseAbi2([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)"
]);
var UniswapV2Adapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError2("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
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
      gas_estimate: 15e4
    };
  }
  async quote(_params) {
    throw DefiError2.unsupported(`[${this.protocolName}] quote requires RPC connection`);
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
      gas_estimate: 3e5
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
import { encodeFunctionData as encodeFunctionData3, parseAbi as parseAbi3 } from "viem";
import { DefiError as DefiError3 } from "@hypurrquant/defi-core";
var abi2 = parseAbi3([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 limitSqrtPrice; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)"
]);
var AlgebraV3Adapter = class {
  protocolName;
  router;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError3("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
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
      gas_estimate: 25e4
    };
  }
  async quote(_params) {
    throw DefiError3.unsupported(`[${this.protocolName}] quote requires RPC connection`);
  }
  async buildAddLiquidity(_params) {
    throw DefiError3.unsupported(`[${this.protocolName}] add_liquidity not yet implemented`);
  }
  async buildRemoveLiquidity(_params) {
    throw DefiError3.unsupported(`[${this.protocolName}] remove_liquidity not yet implemented`);
  }
};

// src/dex/balancer_v3.ts
import { encodeFunctionData as encodeFunctionData4, parseAbi as parseAbi4, zeroAddress } from "viem";
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
        zeroAddress,
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
import { encodeFunctionData as encodeFunctionData6, parseAbi as parseAbi6 } from "viem";
import { DefiError as DefiError6 } from "@hypurrquant/defi-core";
var abi4 = parseAbi6([
  "struct Route { address from; address to; bool stable; }",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)"
]);
var SolidlyAdapter = class {
  protocolName;
  router;
  /** Default to volatile (false). True for stablecoin pairs. */
  defaultStable;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const router = entry.contracts?.["router"];
    if (!router) {
      throw new DefiError6("CONTRACT_ERROR", "Missing 'router' contract address");
    }
    this.router = router;
    this.defaultStable = false;
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
      gas_estimate: 2e5
    };
  }
  async quote(_params) {
    throw DefiError6.unsupported(`[${this.protocolName}] quote requires RPC connection`);
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
      gas_estimate: 35e4
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
import { encodeFunctionData as encodeFunctionData7, parseAbi as parseAbi7, zeroAddress as zeroAddress2 } from "viem";
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
        zeroAddress2
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
import { encodeFunctionData as encodeFunctionData8, parseAbi as parseAbi8, zeroAddress as zeroAddress3 } from "viem";
import { DefiError as DefiError8 } from "@hypurrquant/defi-core";
var gaugeAbi = parseAbi8([
  "function deposit(uint256 amount) external",
  "function depositFor(uint256 amount, uint256 tokenId) external",
  "function withdraw(uint256 amount) external",
  "function getReward(address account) external",
  "function earned(address account) external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
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
  constructor(entry, _rpcUrl) {
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
  }
  name() {
    return this.protocolName;
  }
  // IGauge
  async buildDeposit(gauge, amount, tokenId) {
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
        gas_estimate: 2e5
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
      gas_estimate: 2e5
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
  async buildClaimRewards(gauge) {
    const data = encodeFunctionData8({
      abi: gaugeAbi,
      functionName: "getReward",
      args: [zeroAddress3]
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

// src/lending/aave_v3.ts
import { createPublicClient as createPublicClient2, http as http2, parseAbi as parseAbi9, encodeFunctionData as encodeFunctionData9, zeroAddress as zeroAddress4 } from "viem";
import {
  DefiError as DefiError9,
  InterestRateMode
} from "@hypurrquant/defi-core";
var POOL_ABI = parseAbi9([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)"
]);
function u256ToF64(v) {
  const MAX_U128 = (1n << 128n) - 1n;
  if (v > MAX_U128) return Infinity;
  return Number(v);
}
var AaveV3Adapter = class {
  protocolName;
  pool;
  rpcUrl;
  constructor(entry, rpcUrl) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const pool = entry.contracts?.["pool"];
    if (!pool) throw DefiError9.contractError(`[${entry.name}] Missing 'pool' contract address`);
    this.pool = pool;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData9({
      abi: POOL_ABI,
      functionName: "supply",
      args: [params.asset, params.amount, params.on_behalf_of, 0]
    });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildBorrow(params) {
    const rateMode = params.interest_rate_mode === InterestRateMode.Stable ? 1n : 2n;
    const data = encodeFunctionData9({
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
    const data = encodeFunctionData9({
      abi: POOL_ABI,
      functionName: "repay",
      args: [params.asset, params.amount, rateMode, params.on_behalf_of]
    });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} to pool`,
      to: this.pool,
      data,
      value: 0n,
      gas_estimate: 3e5
    };
  }
  async buildWithdraw(params) {
    const data = encodeFunctionData9({
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
    if (!this.rpcUrl) throw DefiError9.rpcError("No RPC URL configured");
    const client = createPublicClient2({ transport: http2(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getReserveData",
      args: [asset]
    }).catch((e) => {
      throw DefiError9.rpcError(`[${this.protocolName}] getReserveData failed: ${e}`);
    });
    const ray = 1e27;
    const supplyRate = Number(result[2]) / ray * 100;
    const variableRate = Number(result[4]) / ray * 100;
    const stableRate = Number(result[5]) / ray * 100;
    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyRate,
      borrow_variable_apy: variableRate,
      borrow_stable_apy: stableRate,
      utilization: 0,
      total_supply: 0n,
      total_borrow: 0n
    };
  }
  async getUserPosition(user) {
    if (!this.rpcUrl) throw DefiError9.rpcError("No RPC URL configured");
    const client = createPublicClient2({ transport: http2(this.rpcUrl) });
    const result = await client.readContract({
      address: this.pool,
      abi: POOL_ABI,
      functionName: "getUserAccountData",
      args: [user]
    }).catch((e) => {
      throw DefiError9.rpcError(`[${this.protocolName}] getUserAccountData failed: ${e}`);
    });
    const [totalCollateralBase, totalDebtBase, , , ltv, healthFactor] = result;
    const MAX_UINT256 = 2n ** 256n - 1n;
    const hf = healthFactor >= MAX_UINT256 ? Infinity : Number(healthFactor) / 1e18;
    const collateralUsd = u256ToF64(totalCollateralBase) / 1e8;
    const debtUsd = u256ToF64(totalDebtBase) / 1e8;
    const ltvBps = u256ToF64(ltv);
    const supplies = collateralUsd > 0 ? [{ asset: zeroAddress4, symbol: "Total Collateral", amount: totalCollateralBase, value_usd: collateralUsd }] : [];
    const borrows = debtUsd > 0 ? [{ asset: zeroAddress4, symbol: "Total Debt", amount: totalDebtBase, value_usd: debtUsd }] : [];
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
import { createPublicClient as createPublicClient3, http as http3, parseAbi as parseAbi10 } from "viem";
import { DefiError as DefiError10 } from "@hypurrquant/defi-core";
var ORACLE_ABI = parseAbi10([
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
    if (!rpcUrl) throw DefiError10.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const oracle = entry.contracts?.["oracle"];
    if (!oracle) throw DefiError10.contractError(`[${entry.name}] Missing 'oracle' contract address`);
    this.oracle = oracle;
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    const client = createPublicClient3({ transport: http3(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError10.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const priceVal = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "getAssetPrice",
      args: [asset]
    }).catch((e) => {
      throw DefiError10.rpcError(`[${this.protocolName}] getAssetPrice failed: ${e}`);
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
    const client = createPublicClient3({ transport: http3(this.rpcUrl) });
    const baseUnit = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "BASE_CURRENCY_UNIT"
    }).catch((e) => {
      throw DefiError10.rpcError(`[${this.protocolName}] BASE_CURRENCY_UNIT failed: ${e}`);
    });
    const rawPrices = await client.readContract({
      address: this.oracle,
      abi: ORACLE_ABI,
      functionName: "getAssetsPrices",
      args: [assets]
    }).catch((e) => {
      throw DefiError10.rpcError(`[${this.protocolName}] getAssetsPrices failed: ${e}`);
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
import { createPublicClient as createPublicClient4, http as http4, parseAbi as parseAbi11, encodeFunctionData as encodeFunctionData10 } from "viem";
import {
  DefiError as DefiError11
} from "@hypurrquant/defi-core";
var CTOKEN_ABI = parseAbi11([
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
    if (!vtoken) throw DefiError11.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData10({
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
    const data = encodeFunctionData10({
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
    const data = encodeFunctionData10({
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
    const data = encodeFunctionData10({
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
    if (!this.rpcUrl) throw DefiError11.rpcError("No RPC URL configured");
    const client = createPublicClient4({ transport: http4(this.rpcUrl) });
    const [supplyRate, borrowRate, totalSupply, totalBorrows] = await Promise.all([
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e) => {
        throw DefiError11.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`);
      }),
      client.readContract({ address: this.defaultVtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e) => {
        throw DefiError11.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`);
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
    throw DefiError11.unsupported(
      `[${this.protocolName}] User position requires querying individual vToken balances`
    );
  }
};

// src/lending/compound_v3.ts
import { createPublicClient as createPublicClient5, http as http5, parseAbi as parseAbi12, encodeFunctionData as encodeFunctionData11 } from "viem";
import {
  DefiError as DefiError12
} from "@hypurrquant/defi-core";
var COMET_ABI = parseAbi12([
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
    if (!comet) throw DefiError12.contractError("Missing 'comet_usdc' or 'comet' address");
    this.comet = comet;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    const data = encodeFunctionData11({
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
    if (!this.rpcUrl) throw DefiError12.rpcError("No RPC URL configured");
    const client = createPublicClient5({ transport: http5(this.rpcUrl) });
    const utilization = await client.readContract({
      address: this.comet,
      abi: COMET_ABI,
      functionName: "getUtilization"
    }).catch((e) => {
      throw DefiError12.rpcError(`[${this.protocolName}] getUtilization failed: ${e}`);
    });
    const [supplyRate, borrowRate, totalSupply, totalBorrow] = await Promise.all([
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [utilization] }).catch((e) => {
        throw DefiError12.rpcError(`[${this.protocolName}] getSupplyRate failed: ${e}`);
      }),
      client.readContract({ address: this.comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [utilization] }).catch((e) => {
        throw DefiError12.rpcError(`[${this.protocolName}] getBorrowRate failed: ${e}`);
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
    throw DefiError12.unsupported(
      `[${this.protocolName}] User position requires querying Comet balanceOf + borrowBalanceOf`
    );
  }
};

// src/lending/euler_v2.ts
import { createPublicClient as createPublicClient6, http as http6, parseAbi as parseAbi13, encodeFunctionData as encodeFunctionData12 } from "viem";
import {
  DefiError as DefiError13
} from "@hypurrquant/defi-core";
var EULER_VAULT_ABI = parseAbi13([
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
    if (!euler) throw DefiError13.contractError("Missing 'evk_vault' or 'euler' contract address");
    this.euler = euler;
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    const data = encodeFunctionData12({
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
    if (!this.rpcUrl) throw DefiError13.rpcError("No RPC URL configured");
    const client = createPublicClient6({ transport: http6(this.rpcUrl) });
    const [totalSupply, totalBorrows, interestRate] = await Promise.all([
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError13.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "totalBorrows" }).catch((e) => {
        throw DefiError13.rpcError(`[${this.protocolName}] totalBorrows failed: ${e}`);
      }),
      client.readContract({ address: this.euler, abi: EULER_VAULT_ABI, functionName: "interestRate" }).catch((e) => {
        throw DefiError13.rpcError(`[${this.protocolName}] interestRate failed: ${e}`);
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
    throw DefiError13.unsupported(
      `[${this.protocolName}] Euler V2 user positions require querying individual vault balances. Use the vault address directly to check balanceOf(user) for supply positions.`
    );
  }
};

// src/lending/morpho.ts
import { createPublicClient as createPublicClient7, http as http7, parseAbi as parseAbi14, encodeFunctionData as encodeFunctionData13, zeroAddress as zeroAddress5 } from "viem";
import {
  DefiError as DefiError14
} from "@hypurrquant/defi-core";
var MORPHO_ABI = parseAbi14([
  "function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)",
  "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed)",
  "function repay((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsRepaid, uint256 sharesRepaid)",
  "function withdraw((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)"
]);
var META_MORPHO_ABI = parseAbi14([
  "function supplyQueueLength() external view returns (uint256)",
  "function supplyQueue(uint256 index) external view returns (bytes32)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
]);
var IRM_ABI = parseAbi14([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)"
]);
var SECONDS_PER_YEAR3 = 365.25 * 24 * 3600;
function defaultMarketParams(loanToken = zeroAddress5) {
  return {
    loanToken,
    collateralToken: zeroAddress5,
    oracle: zeroAddress5,
    irm: zeroAddress5,
    lltv: 0n
  };
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
    if (!morpho) throw DefiError14.contractError("Missing 'morpho_blue' contract address");
    this.morpho = morpho;
    this.defaultVault = contracts["fehype"] ?? contracts["vault"] ?? contracts["feusdc"];
  }
  name() {
    return this.protocolName;
  }
  async buildSupply(params) {
    const market = defaultMarketParams(params.asset);
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    const data = encodeFunctionData13({
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
    if (!this.rpcUrl) throw DefiError14.rpcError("No RPC URL configured");
    if (!this.defaultVault) {
      throw DefiError14.contractError(`[${this.protocolName}] No MetaMorpho vault configured for rate query`);
    }
    const client = createPublicClient7({ transport: http7(this.rpcUrl) });
    const queueLen = await client.readContract({
      address: this.defaultVault,
      abi: META_MORPHO_ABI,
      functionName: "supplyQueueLength"
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] supplyQueueLength failed: ${e}`);
    });
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
    const marketId = await client.readContract({
      address: this.defaultVault,
      abi: META_MORPHO_ABI,
      functionName: "supplyQueue",
      args: [0n]
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] supplyQueue(0) failed: ${e}`);
    });
    const mkt = await client.readContract({
      address: this.morpho,
      abi: MORPHO_ABI,
      functionName: "market",
      args: [marketId]
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] market() failed: ${e}`);
    });
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mkt;
    const supplyF = Number(totalSupplyAssets);
    const borrowF = Number(totalBorrowAssets);
    const util = supplyF > 0 ? borrowF / supplyF : 0;
    const params2 = await client.readContract({
      address: this.morpho,
      abi: MORPHO_ABI,
      functionName: "idToMarketParams",
      args: [marketId]
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] idToMarketParams failed: ${e}`);
    });
    const [loanToken, collateralToken, oracle, irm, lltv] = params2;
    const irmMarketParams = { loanToken, collateralToken, oracle, irm, lltv };
    const irmMarket = { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };
    const borrowRatePerSec = await client.readContract({
      address: irm,
      abi: IRM_ABI,
      functionName: "borrowRateView",
      args: [irmMarketParams, irmMarket]
    }).catch((e) => {
      throw DefiError14.rpcError(`[${this.protocolName}] borrowRateView failed: ${e}`);
    });
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
    throw DefiError14.unsupported(
      `[${this.protocolName}] Morpho Blue user positions are per-market \u2014 use vault deposit/withdraw instead`
    );
  }
};

// src/cdp/felix.ts
import { createPublicClient as createPublicClient8, http as http8, parseAbi as parseAbi15, encodeFunctionData as encodeFunctionData14, zeroAddress as zeroAddress6 } from "viem";
import {
  DefiError as DefiError15
} from "@hypurrquant/defi-core";
var BORROWER_OPS_ABI = parseAbi15([
  "function openTrove(address _owner, uint256 _ownerIndex, uint256 _collAmount, uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint, uint256 _annualInterestRate, uint256 _maxUpfrontFee, address _addManager, address _removeManager, address _receiver) external returns (uint256)",
  "function adjustTrove(uint256 _troveId, uint256 _collChange, bool _isCollIncrease, uint256 _debtChange, bool _isDebtIncrease, uint256 _upperHint, uint256 _lowerHint, uint256 _maxUpfrontFee) external",
  "function closeTrove(uint256 _troveId) external"
]);
var TROVE_MANAGER_ABI = parseAbi15([
  "function getLatestTroveData(uint256 _troveId) external view returns (uint256 entireDebt, uint256 entireColl, uint256 redistDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 accruedBatchManagementFee, uint256 weightedRecordedDebt, uint256 lastInterestRateAdjTime)"
]);
var HINT_HELPERS_ABI = parseAbi15([
  "function getApproxHint(uint256 _collIndex, uint256 _interestRate, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (uint256 hintId, uint256 diff, uint256 latestRandomSeed)"
]);
var SORTED_TROVES_ABI = parseAbi15([
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
    if (!bo) throw DefiError15.contractError("Missing 'borrower_operations' contract");
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
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
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
    const data = encodeFunctionData14({
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
    const data = encodeFunctionData14({
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
    const data = encodeFunctionData14({
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
    if (!this.rpcUrl) throw DefiError15.rpcError(`[${this.protocolName}] getCdpInfo requires RPC \u2014 set HYPEREVM_RPC_URL`);
    if (!this.troveManager) throw DefiError15.contractError(`[${this.protocolName}] trove_manager contract not configured`);
    const client = createPublicClient8({ transport: http8(this.rpcUrl) });
    const data = await client.readContract({
      address: this.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getLatestTroveData",
      args: [cdpId]
    }).catch((e) => {
      throw DefiError15.invalidParam(`[${this.protocolName}] Trove ${cdpId} not found: ${e}`);
    });
    const [entireDebt, entireColl] = data;
    if (entireDebt === 0n && entireColl === 0n) {
      throw DefiError15.invalidParam(`[${this.protocolName}] Trove ${cdpId} does not exist`);
    }
    const collRatio = entireDebt > 0n ? Number(entireColl) / Number(entireDebt) : 0;
    return {
      protocol: this.protocolName,
      cdp_id: cdpId,
      collateral: {
        token: zeroAddress6,
        symbol: "WHYPE",
        amount: entireColl,
        decimals: 18
      },
      debt: {
        token: zeroAddress6,
        symbol: "feUSD",
        amount: entireDebt,
        decimals: 18
      },
      collateral_ratio: collRatio
    };
  }
};

// src/cdp/felix_oracle.ts
import { createPublicClient as createPublicClient9, http as http9, parseAbi as parseAbi16 } from "viem";
import { DefiError as DefiError16 } from "@hypurrquant/defi-core";
var PRICE_FEED_ABI = parseAbi16([
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
    if (!rpcUrl) throw DefiError16.rpcError(`[${entry.name}] RPC URL required for oracle`);
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const feed = contracts["price_feed"];
    if (!feed) throw DefiError16.contractError(`[${entry.name}] Missing 'price_feed' contract address`);
    this.priceFeed = feed;
    this.asset = contracts["asset"] ?? "0x0000000000000000000000000000000000000000";
  }
  name() {
    return this.protocolName;
  }
  async getPrice(asset) {
    if (asset !== this.asset && this.asset !== "0x0000000000000000000000000000000000000000") {
      throw DefiError16.unsupported(`[${this.protocolName}] Felix PriceFeed only supports asset ${this.asset}`);
    }
    const client = createPublicClient9({ transport: http9(this.rpcUrl) });
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
        throw DefiError16.rpcError(`[${this.protocolName}] lastGoodPrice failed: ${e}`);
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
import { createPublicClient as createPublicClient10, http as http10, parseAbi as parseAbi17, encodeFunctionData as encodeFunctionData15 } from "viem";
import {
  DefiError as DefiError17
} from "@hypurrquant/defi-core";
var ERC4626_ABI = parseAbi17([
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
    if (!vault) throw DefiError17.contractError("Missing 'vault' contract address");
    this.vaultAddress = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildDeposit(assets, receiver) {
    const data = encodeFunctionData15({
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
    const data = encodeFunctionData15({
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
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets"
    }).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
    });
  }
  async convertToShares(assets) {
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets]
    }).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] convertToShares failed: ${e}`);
    });
  }
  async convertToAssets(shares) {
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    return client.readContract({
      address: this.vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares]
    }).catch((e) => {
      throw DefiError17.rpcError(`[${this.protocolName}] convertToAssets failed: ${e}`);
    });
  }
  async getVaultInfo() {
    if (!this.rpcUrl) throw DefiError17.rpcError("No RPC URL configured");
    const client = createPublicClient10({ transport: http10(this.rpcUrl) });
    const [totalAssets, totalSupply, asset] = await Promise.all([
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalAssets" }).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] totalAssets failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "totalSupply" }).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
      }),
      client.readContract({ address: this.vaultAddress, abi: ERC4626_ABI, functionName: "asset" }).catch((e) => {
        throw DefiError17.rpcError(`[${this.protocolName}] asset failed: ${e}`);
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
import { parseAbi as parseAbi18, encodeFunctionData as encodeFunctionData16 } from "viem";
import {
  DefiError as DefiError18
} from "@hypurrquant/defi-core";
var GENERIC_LST_ABI = parseAbi18([
  "function stake() external payable returns (uint256)",
  "function unstake(uint256 amount) external returns (uint256)"
]);
var GenericLstAdapter = class {
  protocolName;
  staking;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const staking = entry.contracts?.["staking"];
    if (!staking) throw DefiError18.contractError("Missing 'staking' contract");
    this.staking = staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData16({ abi: GENERIC_LST_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 2e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData16({
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
    throw DefiError18.unsupported(`[${this.protocolName}] getInfo requires RPC`);
  }
};

// src/liquid_staking/sthype.ts
import { createPublicClient as createPublicClient11, http as http11, parseAbi as parseAbi19, encodeFunctionData as encodeFunctionData17, zeroAddress as zeroAddress7 } from "viem";
import {
  DefiError as DefiError19
} from "@hypurrquant/defi-core";
var STHYPE_ABI = parseAbi19([
  "function submit(address referral) external payable returns (uint256)",
  "function requestWithdrawals(uint256[] amounts, address owner) external returns (uint256[] requestIds)"
]);
var ERC20_ABI = parseAbi19([
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
    if (!staking) throw DefiError19.contractError("Missing 'staking' contract");
    this.staking = staking;
    this.sthypeToken = entry.contracts?.["sthype_token"];
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData17({
      abi: STHYPE_ABI,
      functionName: "submit",
      args: [zeroAddress7]
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
    const data = encodeFunctionData17({
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
    if (!this.rpcUrl) throw DefiError19.rpcError("No RPC URL configured");
    const client = createPublicClient11({ transport: http11(this.rpcUrl) });
    const tokenAddr = this.sthypeToken ?? this.staking;
    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: "totalSupply"
    }).catch((e) => {
      throw DefiError19.rpcError(`[${this.protocolName}] totalSupply failed: ${e}`);
    });
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress7,
      liquid_token: tokenAddr,
      exchange_rate: 1,
      total_staked: totalSupply
    };
  }
};

// src/liquid_staking/kinetiq.ts
import { createPublicClient as createPublicClient12, http as http12, parseAbi as parseAbi20, encodeFunctionData as encodeFunctionData18, zeroAddress as zeroAddress8 } from "viem";
import {
  DefiError as DefiError20
} from "@hypurrquant/defi-core";
var KINETIQ_ABI = parseAbi20([
  "function stake() external payable returns (uint256)",
  "function requestUnstake(uint256 amount) external returns (uint256)",
  "function totalStaked() external view returns (uint256)"
]);
var ORACLE_ABI2 = parseAbi20([
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
    if (!staking) throw DefiError20.contractError("Missing 'staking' contract address");
    this.staking = staking;
    this.liquidToken = entry.contracts?.["khype_token"] ?? staking;
  }
  name() {
    return this.protocolName;
  }
  async buildStake(params) {
    const data = encodeFunctionData18({ abi: KINETIQ_ABI, functionName: "stake" });
    return {
      description: `[${this.protocolName}] Stake ${params.amount} HYPE for kHYPE`,
      to: this.staking,
      data,
      value: params.amount,
      gas_estimate: 3e5
    };
  }
  async buildUnstake(params) {
    const data = encodeFunctionData18({
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
    if (!this.rpcUrl) throw DefiError20.rpcError("No RPC URL configured");
    const client = createPublicClient12({ transport: http12(this.rpcUrl) });
    const totalStaked = await client.readContract({
      address: this.staking,
      abi: KINETIQ_ABI,
      functionName: "totalStaked"
    }).catch((e) => {
      throw DefiError20.rpcError(`[${this.protocolName}] totalStaked failed: ${e}`);
    });
    const [khypePrice, hypePrice] = await Promise.all([
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI2, functionName: "getAssetPrice", args: [this.liquidToken] }).catch(() => 0n),
      client.readContract({ address: HYPERLEND_ORACLE, abi: ORACLE_ABI2, functionName: "getAssetPrice", args: [WHYPE] }).catch(() => 0n)
    ]);
    const rateF64 = hypePrice > 0n && khypePrice > 0n ? Number(khypePrice * 10n ** 18n / hypePrice) / 1e18 : 1;
    return {
      protocol: this.protocolName,
      staked_token: zeroAddress8,
      liquid_token: this.liquidToken,
      exchange_rate: rateF64,
      total_staked: totalStaked
    };
  }
};

// src/yield_source/pendle.ts
import {
  DefiError as DefiError21
} from "@hypurrquant/defi-core";
var PendleAdapter = class {
  protocolName;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    if (!entry.contracts?.["router"]) {
      throw DefiError21.contractError("Missing 'router' contract");
    }
  }
  name() {
    return this.protocolName;
  }
  async getYields() {
    throw DefiError21.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError21.unsupported(
      `[${this.protocolName}] Pendle deposit requires market address and token routing params. Use Pendle-specific CLI.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError21.unsupported(
      `[${this.protocolName}] Pendle withdraw requires market-specific params`
    );
  }
};

// src/yield_source/generic_yield.ts
import {
  DefiError as DefiError22
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
    throw DefiError22.unsupported(`[${this.protocolName}] getYields requires RPC`);
  }
  async buildDeposit(_pool, _amount, _recipient) {
    throw DefiError22.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom deposit logic.`
    );
  }
  async buildWithdraw(_pool, _amount, _recipient) {
    throw DefiError22.unsupported(
      `[${this.protocolName}] Yield interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'pendle_v2' (Pendle). Protocols like Steer (managed liquidity), Liminal (yield optimization), and Altura (gaming yield) need custom withdraw logic.`
    );
  }
};

// src/derivatives/hlp.ts
import { parseAbi as parseAbi21, encodeFunctionData as encodeFunctionData19 } from "viem";
import {
  DefiError as DefiError23
} from "@hypurrquant/defi-core";
var HLP_ABI = parseAbi21([
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)"
]);
var HlpVaultAdapter = class {
  protocolName;
  vault;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const vault = entry.contracts?.["vault"];
    if (!vault) throw DefiError23.contractError("Missing 'vault' contract");
    this.vault = vault;
  }
  name() {
    return this.protocolName;
  }
  async buildOpenPosition(params) {
    const data = encodeFunctionData19({
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
    const data = encodeFunctionData19({
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
  DefiError as DefiError24
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
    throw DefiError24.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
  async buildClosePosition(_params) {
    throw DefiError24.unsupported(
      `[${this.protocolName}] Derivatives interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'hlp_vault' (HLP Vault). Protocols like Rumpel need custom position management logic.`
    );
  }
};

// src/options/rysk.ts
import { parseAbi as parseAbi22, encodeFunctionData as encodeFunctionData20 } from "viem";
import {
  DefiError as DefiError25
} from "@hypurrquant/defi-core";
var RYSK_ABI = parseAbi22([
  "function openOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 premium)",
  "function closeOption(address underlying, uint256 strikePrice, uint256 expiry, bool isCall, uint256 amount) external returns (uint256 payout)"
]);
var RyskAdapter = class {
  protocolName;
  controller;
  constructor(entry, _rpcUrl) {
    this.protocolName = entry.name;
    const controller = entry.contracts?.["controller"];
    if (!controller) throw DefiError25.contractError("Missing 'controller' contract");
    this.controller = controller;
  }
  name() {
    return this.protocolName;
  }
  async buildBuy(params) {
    const data = encodeFunctionData20({
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
    const data = encodeFunctionData20({
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
  DefiError as DefiError26
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
    throw DefiError26.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
  async buildSell(_params) {
    throw DefiError26.unsupported(
      `[${this.protocolName}] Options interface '${this.interfaceName}' requires a protocol-specific adapter. Supported: 'rysk' (Rysk Finance). Other options protocols need custom strike/expiry handling.`
    );
  }
};

// src/nft/erc721.ts
import { createPublicClient as createPublicClient13, http as http13, parseAbi as parseAbi23 } from "viem";
import { DefiError as DefiError27 } from "@hypurrquant/defi-core";
var ERC721_ABI = parseAbi23([
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
    if (!this.rpcUrl) throw DefiError27.rpcError("No RPC URL configured");
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    const [collectionName, symbol, totalSupply] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "name" }).catch((e) => {
        throw DefiError27.rpcError(`[${this.protocolName}] name failed: ${e}`);
      }),
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "symbol" }).catch((e) => {
        throw DefiError27.rpcError(`[${this.protocolName}] symbol failed: ${e}`);
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
    if (!this.rpcUrl) throw DefiError27.rpcError("No RPC URL configured");
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    const [owner, tokenUri] = await Promise.all([
      client.readContract({ address: collection, abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] }).catch((e) => {
        throw DefiError27.rpcError(`[${this.protocolName}] ownerOf failed: ${e}`);
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
    if (!this.rpcUrl) throw DefiError27.rpcError("No RPC URL configured");
    const client = createPublicClient13({ transport: http13(this.rpcUrl) });
    return client.readContract({ address: collection, abi: ERC721_ABI, functionName: "balanceOf", args: [owner] }).catch((e) => {
      throw DefiError27.rpcError(`[${this.protocolName}] balanceOf failed: ${e}`);
    });
  }
};

// src/factory.ts
function createDex(entry, rpcUrl) {
  switch (entry.interface) {
    case "uniswap_v3":
      return new UniswapV3Adapter(entry, rpcUrl);
    case "algebra_v3":
      return new AlgebraV3Adapter(entry, rpcUrl);
    case "uniswap_v2":
      return new UniswapV2Adapter(entry);
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
      throw DefiError28.unsupported(`DEX interface '${entry.interface}' not yet implemented`);
  }
}
function createLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveV3Adapter(entry, rpcUrl);
    case "morpho_blue":
      return new MorphoBlueAdapter(entry, rpcUrl);
    case "euler_v2":
      return new EulerV2Adapter(entry, rpcUrl);
    case "compound_v2":
      return new CompoundV2Adapter(entry, rpcUrl);
    case "compound_v3":
      return new CompoundV3Adapter(entry, rpcUrl);
    default:
      throw DefiError28.unsupported(`Lending interface '${entry.interface}' not yet implemented`);
  }
}
function createCdp(entry, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixCdpAdapter(entry, rpcUrl);
    default:
      throw DefiError28.unsupported(`CDP interface '${entry.interface}' not yet implemented`);
  }
}
function createVault(entry, rpcUrl) {
  switch (entry.interface) {
    case "erc4626":
    case "beefy_vault":
      return new ERC4626VaultAdapter(entry, rpcUrl);
    default:
      throw DefiError28.unsupported(`Vault interface '${entry.interface}' not yet implemented`);
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
function createGauge(entry) {
  switch (entry.interface) {
    case "solidly_v2":
    case "solidly_cl":
    case "algebra_v3":
    case "hybra":
      return new SolidlyGaugeAdapter(entry);
    default:
      throw DefiError28.unsupported(`Gauge interface '${entry.interface}' not supported`);
  }
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
      throw DefiError28.unsupported(`NFT marketplace '${entry.name}' is not queryable as ERC-721. Use a specific collection address.`);
    default:
      throw DefiError28.unsupported(`NFT interface '${entry.interface}' not supported`);
  }
}
function createOracleFromLending(entry, rpcUrl) {
  switch (entry.interface) {
    case "aave_v3":
    case "aave_v3_isolated":
      return new AaveOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError28.unsupported(`Oracle not available for lending interface '${entry.interface}'`);
  }
}
function createOracleFromCdp(entry, _asset, rpcUrl) {
  switch (entry.interface) {
    case "liquity_v2":
      return new FelixOracleAdapter(entry, rpcUrl);
    default:
      throw DefiError28.unsupported(`Oracle not available for CDP interface '${entry.interface}'`);
  }
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
  createNft,
  createOptions,
  createOracleFromCdp,
  createOracleFromLending,
  createVault,
  createYieldSource
};
//# sourceMappingURL=index.js.map