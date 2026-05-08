// PancakeSwap V3 MasterChef stake → harvest → withdraw cycle
// Runs fully with viem from pnpm store
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from '/work/ts/node_modules/.pnpm/viem@2.47.6_typescript@6.0.2_zod@4.3.6/node_modules/viem/index.js';
import { privateKeyToAccount } from '/work/ts/node_modules/.pnpm/viem@2.47.6_typescript@6.0.2_zod@4.3.6/node_modules/viem/accounts/index.js';
import { bsc } from '/work/ts/node_modules/.pnpm/viem@2.47.6_typescript@6.0.2_zod@4.3.6/node_modules/viem/chains/index.js';

const WALLET = '0x147F9D7d85E8CBb4871ba83C6491BDACC2431F0e';
const NPM = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const MASTERCHEF = '0x556B9306565093C855AEA9AE92A594704c2Cd59e';
const TOKEN_ID = 6815781n;
const RPC = 'https://bsc-dataseed1.binance.org';

const pk = process.env.DEFI_PRIVATE_KEY;
if (!pk) { console.error('DEFI_PRIVATE_KEY not set'); process.exit(1); }
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);

const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: bsc, transport: http(RPC) });

async function sendAndWait(description, to, data) {
  console.log(`\n[${description}] Estimating gas...`);
  const gas = await publicClient.estimateGas({ account: account.address, to, data });
  const gasLimit = (gas * 12000n) / 10000n; // 20% buffer
  const block = await publicClient.getBlock();
  const baseFee = block.baseFeePerGas ?? 3000000000n;
  const maxPriorityFeePerGas = 3000000000n; // 3 gwei
  const maxFeePerGas = (baseFee * 125n) / 100n + maxPriorityFeePerGas;

  console.log(`  gas estimate: ${gas}, with buffer: ${gasLimit}`);
  const hash = await walletClient.sendTransaction({
    to,
    data,
    gas: gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  console.log(`  tx sent: ${hash}`);
  console.log(`  explorer: https://bscscan.com/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  status: ${receipt.status} | block: ${receipt.blockNumber} | gasUsed: ${receipt.gasUsed}`);
  if (receipt.status !== 'success') throw new Error(`[${description}] TX reverted`);
  return receipt;
}

// ABI fragments
const NPM_ABI = parseAbi(['function safeTransferFrom(address from, address to, uint256 tokenId)']);
const MC_ABI = parseAbi([
  'function harvest(uint256 tokenId, address to) external returns (uint256 reward)',
  'function withdraw(uint256 tokenId, address to) external returns (uint256 reward)',
]);

async function main() {
  // Step 2: stake — safeTransferFrom(wallet, masterchef, tokenId)
  console.log('\n=== STEP 2: Stake NFT into MasterChef V3 ===');
  const stakeData = encodeFunctionData({
    abi: NPM_ABI,
    functionName: 'safeTransferFrom',
    args: [WALLET, MASTERCHEF, TOKEN_ID],
  });
  await sendAndWait('safeTransferFrom → MasterChef', NPM, stakeData);

  // Step 3: wait 30s then harvest
  console.log('\n=== STEP 3: Waiting 30s for CAKE emissions... ===');
  await new Promise(r => setTimeout(r, 30000));

  const harvestData = encodeFunctionData({
    abi: MC_ABI,
    functionName: 'harvest',
    args: [TOKEN_ID, WALLET],
  });
  await sendAndWait('harvest(tokenId, to)', MASTERCHEF, harvestData);

  // Step 4: withdraw (unstakes NFT back to wallet)
  console.log('\n=== STEP 4: Withdraw (unstake) from MasterChef V3 ===');
  const withdrawData = encodeFunctionData({
    abi: MC_ABI,
    functionName: 'withdraw',
    args: [TOKEN_ID, WALLET],
  });
  await sendAndWait('withdraw(tokenId, to)', MASTERCHEF, withdrawData);

  console.log('\nDone. NFT 6815781 is back in wallet. Proceed with lp remove.');
}

main().catch(e => { console.error(e); process.exit(1); });
