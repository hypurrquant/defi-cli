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

// Setup
const wrapAbi = parseAbi(["function deposit() external payable"]);
await wallet.writeContract({ address: WETH, abi: wrapAbi, functionName: "deposit", value: 5000000000000000000n });
const erc20 = parseAbi(["function approve(address,uint256) external returns (bool)", "function balanceOf(address) external view returns (uint256)"]);
await wallet.writeContract({ address: WETH, abi: erc20, functionName: "approve", args: [UNI_NPM, 2n**256n-1n] });

// Standard Uniswap V3 NPM mint (fee, not tickSpacing)
const mintAbi = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
]);

// Pool: WETH/USDC fee=500, spacing=10, currentTick≈-199652
const poolAbi = parseAbi(["function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"]);
const slot0 = await client.readContract({ address: "0xd0b53D9277642d899DF5C87A3966A349A798F224", abi: poolAbi, functionName: "slot0" });
const currentTick = Number(slot0[1]);
console.log("currentTick:", currentTick);

const block = await client.getBlock();
const deadline = block.timestamp + 600n;

// Test 1: single-side token0 (WETH) = range BELOW current tick
// tickUpper must be < currentTick, aligned to spacing=10
const tickUpper = Math.floor(currentTick / 10) * 10; // round down
const tickLower = tickUpper - 100;
console.log("\n=== Test 1: single-side WETH ===");
console.log("ticks:", tickLower, "to", tickUpper, "(current:", currentTick, ")");
console.log("tickUpper < currentTick?", tickUpper < currentTick);

try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
      token0: WETH, token1: USDC, fee: 500,
      tickLower, tickUpper,
      amount0Desired: 1000000000000000000n, // 1 WETH
      amount1Desired: 0n,
      amount0Min: 0n, amount1Min: 0n,
      recipient: W, deadline
    }]})
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("status:", r.status);
  if (r.status === "reverted") {
    // Trace
    const trace = await fetch(RPC, { method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({jsonrpc:"2.0",method:"trace_transaction",params:[h],id:1})
    }).then(r => r.json());
    console.log("trace available:", !!trace.result);
  }
} catch(e) { console.log("ERR:", e.shortMessage?.slice(0,200)); }

// Test 2: same but tickUpper = currentTick - 10 (definitely below)
const tu2 = Math.floor(currentTick / 10) * 10 - 10;
const tl2 = tu2 - 100;
console.log("\n=== Test 2: tickUpper clearly below ===");
console.log("ticks:", tl2, "to", tu2, "(current:", currentTick, ")");

try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
      token0: WETH, token1: USDC, fee: 500,
      tickLower: tl2, tickUpper: tu2,
      amount0Desired: 1000000000000000000n,
      amount1Desired: 0n,
      amount0Min: 0n, amount1Min: 0n,
      recipient: W, deadline
    }]})
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("status:", r.status);
  if (r.status === "success") {
    const nftBal = await client.readContract({ address: UNI_NPM, abi: erc20, functionName: "balanceOf", args: [W] });
    console.log("SUCCESS! NFT count:", nftBal);
  }
} catch(e) { console.log("ERR:", e.shortMessage?.slice(0,200)); }

// Test 3: single-side token1 (USDC) = range ABOVE current tick
// Mint USDC first
const USDC_SLOT = "0x" + "0".repeat(24) + W.slice(2).toLowerCase();
// Use whale
const whale = "0xaac391f166f33CdaEfaa4AfA6616A3BEA66B694d";
await fetch(RPC, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",method:"anvil_impersonateAccount",params:[whale],id:1}) });
await fetch(RPC, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",method:"anvil_setBalance",params:[whale,"0x56BC75E2D63100000"],id:2}) });
await fetch(RPC, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",method:"eth_sendTransaction",params:[{from:whale,to:USDC,data:encodeFunctionData({abi:parseAbi(["function transfer(address,uint256) external returns (bool)"]),functionName:"transfer",args:[W,5000000000n]}),gas:"0x30000"}],id:3}) });
await wallet.writeContract({ address: USDC, abi: erc20, functionName: "approve", args: [UNI_NPM, 2n**256n-1n] });

const tl3 = Math.floor(currentTick / 10) * 10 + 10;
const tu3 = tl3 + 100;
console.log("\n=== Test 3: single-side USDC (token1 above) ===");
console.log("ticks:", tl3, "to", tu3);

try {
  const h = await wallet.sendTransaction({
    to: UNI_NPM, gas: 1000000n,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{
      token0: WETH, token1: USDC, fee: 500,
      tickLower: tl3, tickUpper: tu3,
      amount0Desired: 0n,
      amount1Desired: 1000000000n, // 1000 USDC
      amount0Min: 0n, amount1Min: 0n,
      recipient: W, deadline
    }]})
  });
  const r = await client.waitForTransactionReceipt({ hash: h });
  console.log("status:", r.status);
  if (r.status === "success") {
    const nftBal = await client.readContract({ address: UNI_NPM, abi: erc20, functionName: "balanceOf", args: [W] });
    console.log("SUCCESS! NFT count:", nftBal);
  }
} catch(e) { console.log("ERR:", e.shortMessage?.slice(0,200)); }
