# Lesson Learned: Ethereum E2E DeFi Lifecycle Test

Generated: 2026-03-22T10:33:06.269Z

## Overview
Full DeFi lifecycle tested on Ethereum via Anvil fork with REAL broadcast transactions.

## Protocol Interactions

### WETH

#### `deposit`
- **ABI:** `function deposit() payable`
- **Contract:** `0x5555555555555555555555555555555555555555`
- **Params:** {"value":"10 ETH"}
- **Result:** success
- **Detail:** Wrap ETH to WETH
- **Notes:** WETH uses deposit() with msg.value

### USDC

#### `transfer`
- **ABI:** `function transfer(address to, uint256 amount) returns (bool)`
- **Contract:** `0xb88339CB7199b77E23DB6E890353E22632Ba630f`
- **Params:** {"to":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","amount":"10000 USDC (10000e6)"}
- **Result:** fail
- **Detail:** Transfer USDC from whale via impersonation
- **Notes:** USDC has 6 decimals. Use anvil_impersonateAccount for whale transfers.

### Uniswap V3

#### `approve`
- **ABI:** `function approve(address spender, uint256 amount) returns (bool)`
- **Contract:** `0x5555555555555555555555555555555555555555`
- **Params:** {"spender":"0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D","amount":"type(uint256).max"}
- **Result:** success
- **Detail:** Approve WETH for Uniswap V3 Router
- **Notes:** Max approval (type(uint256).max) common for DEX interactions

#### `exactInputSingle`
- **ABI:** `function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)`
- **Contract:** `0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D`
- **Params:** {"tokenIn":"WETH","tokenOut":"USDC","fee":"3000 (0.3%)","amountIn":"1 WETH","amountOutMinimum":"0","recipient":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}
- **Result:** success
- **Detail:** Real swap: 1 WETH → USDC on Uniswap V3
- **Notes:** fee=3000 is 0.3% pool. sqrtPriceLimitX96=0 means no price limit. deadline should be future timestamp.

### Aave V3

#### `approve`
- **ABI:** `function approve(address spender, uint256 amount) returns (bool)`
- **Contract:** `0xb88339CB7199b77E23DB6E890353E22632Ba630f`
- **Params:** {"spender":"0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b","amount":"type(uint256).max"}
- **Result:** success
- **Detail:** Approve USDC for Aave V3 Pool

#### `supply`
- **ABI:** `function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external`
- **Contract:** `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`
- **Params:** {"asset":"USDC","amount":"1000 USDC (1000e6)","onBehalfOf":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","referralCode":"0"}
- **Result:** success
- **Detail:** Supply 1000 USDC to Aave V3
- **Notes:** referralCode=0 for no referral. Asset must be approved first. onBehalfOf can be different from msg.sender.

#### `getReserveData`
- **ABI:** `function getReserveData(address asset) returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, ...)`
- **Contract:** `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`
- **Params:** {"asset":"USDC"}
- **Result:** success
- **Detail:** supply=4.38% borrow=7.49%
- **Notes:** Rates are in RAY (1e27). Convert: APY = (rate / 1e27) * 100. liquidityRate=supply, variableBorrowRate=borrow.

#### `withdraw`
- **ABI:** `function withdraw(address asset, uint256 amount, address to) returns (uint256)`
- **Contract:** `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`
- **Params:** {"asset":"USDC","amount":"1000 USDC","to":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}
- **Result:** success
- **Detail:** Withdraw 20 USDC from HyperLend
- **Notes:** Use type(uint256).max to withdraw all. Returns actual amount withdrawn.

## Key Takeaways

### Token Operations
- WETH wrapping uses `deposit()` with `msg.value` — no parameters needed
- USDC has 6 decimals (not 18) — always check `decimals()` before amount calculation
- Max approval: `type(uint256).max = 2^256-1` — standard for DEX/lending interactions

### DEX (Uniswap V3)
- `exactInputSingle` takes a tuple parameter — must encode struct correctly
- Fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%) — most pairs use 3000
- `sqrtPriceLimitX96 = 0` means no price limit (accept any price)
- Deadline should be a future Unix timestamp

### Lending (Aave V3)
- `supply(asset, amount, onBehalfOf, referralCode)` — referralCode=0 for no referral
- `withdraw(asset, amount, to)` — use `type(uint256).max` to withdraw everything
- Rates are in RAY (1e27) — convert: `APY = rate / 1e27 * 100`
- `getUserAccountData()` returns health factor in 1e18 format

### NFT (ERC-721)
- `totalSupply()` is optional in ERC-721 — not all collections implement it
- `tokenURI()` may return IPFS/Arweave URLs that need gateway resolution
- `balanceOf()` returns count, not token IDs

### Anvil Fork Testing
- Use `anvil_setBalance` to fund test accounts with native tokens
- Use `anvil_impersonateAccount` to transfer ERC20 from whale addresses
- Use `--auto-impersonate` flag for easier testing (any address can send tx)
- Fork state is a snapshot — oracle prices are frozen at fork block
- 502/rate limit errors from public RPCs are transient — retry or use paid RPCs

### Common Pitfalls
- Wrong decimal places (USDC=6, WETH=18) causes amount errors
- Missing approve before supply/swap causes "insufficient allowance" revert
- Expired deadline causes "Transaction too old" revert
- Zero address as asset in Aave returns empty data (not an error)
