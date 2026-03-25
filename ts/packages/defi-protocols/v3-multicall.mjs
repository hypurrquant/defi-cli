import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const W = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const account = privateKeyToAccount(PK);
const RPC = "http://127.0.0.1:8546";
const base = { id: 8453, name: "Base", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const client = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const block = await client.getBlock();

const mintAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function refundETH() external payable"
]);

// Single-side USDC above current tick (-199613)
const mintData = encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
  token0: WETH, token1: USDC, fee: 500,
  tickLower: -199600, tickUpper: -199500,
  amount0Desired: 0n,
  amount1Desired: 1000000000n,
  amount0Min: 0n, amount1Min: 0n,
  recipient: W, deadline: block.timestamp + 600n
}]});

// Try via multicall
console.log("=== Via multicall ===");
try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "multicall", args: [[mintData]] })
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("multicall status:", r.status);
} catch(e) { console.log("multicall ERR:", e.shortMessage?.slice(0,200)); }

// Sanity check: try mint that WORKED before (both tokens, current tick inside)
console.log("\n=== Sanity: both tokens (should work) ===");
try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
      token0: WETH, token1: USDC, fee: 500,
      tickLower: -199700, tickUpper: -199600,
      amount0Desired: 100000000000000n,
      amount1Desired: 250000n,
      amount0Min: 0n, amount1Min: 0n,
      recipient: W, deadline: block.timestamp + 600n
    }]})
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("both tokens status:", r.status);
} catch(e) { console.log("ERR:", e.shortMessage?.slice(0,200)); }

// KEY TEST: both tokens but amount1=1 (tiny, almost single-side)
console.log("\n=== Both tokens, amount1=1 wei USDC ===");
try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
      token0: WETH, token1: USDC, fee: 500,
      tickLower: -199700, tickUpper: -199600,
      amount0Desired: 1000000000000000000n,
      amount1Desired: 1n,
      amount0Min: 0n, amount1Min: 0n,
      recipient: W, deadline: block.timestamp + 600n
    }]})
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("amount1=1 status:", r.status);
} catch(e) { console.log("ERR:", e.shortMessage?.slice(0,200)); }
