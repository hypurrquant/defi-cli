# DeFi Protocol Testing Specification

> 모든 프로토콜 어댑터는 이 규칙에 따라 테스트해야 합니다.
> Anvil fork 환경에서 실행하며, 각 함수는 최소 1회 broadcast 테스트를 포함합니다.

---

## AI Agent Instructions

> **이 문서는 AI 에이전트가 자동으로 테스트를 실행하기 위한 지시서입니다.**
> AI는 이 문서 + `test/fixtures/{chain}.yaml` 파일만 읽고 전체 테스트를 자동 수행합니다.

### Quick Start (AI용)
1. YAML fixture 로드: `const fixture = yaml.parse(readFileSync('test/fixtures/{chain}.yaml', 'utf-8'))`
2. Anvil fork 시작: `anvil --fork-url {fixture.chain.rpc_url} --port 8900 --auto-impersonate --no-storage-caching`
3. 토큰 펀딩: deal pattern (아래 참조)
4. 테스트 실행: fixture의 protocols 배열을 순회하며 각 함수 호출
5. 결과 검증: 각 함수별 assertion 실행

### YAML Fixture 구조

`test/fixtures/{chain}.yaml` 예시:
```yaml
chain:
  slug: ethereum
  chain_id: 1
  rpc_url: https://eth.llamarpc.com
  native_symbol: ETH

tokens:
  wrapped:
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    symbol: WETH
    decimals: 18
    balance_slot: 3
  stablecoin:
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    symbol: USDC
    decimals: 6
    balance_slot: 9

funding:
  native_amount: "0x56BC75E2D63100000"   # 100 ETH in hex
  wrapped_amount: "10ether"
  stablecoin_amount: "1000000000"         # 1000 USDC (6 decimals)

protocols:
  dex:
    - slug: uniswap-v3-eth
      interface: uniswap-v3
      contracts:
        router: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
        quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
      test:
        fee: 3000
        amount_in: "1000000000000000000"  # 1 WETH
  lending:
    - slug: aave-v3-eth
      interface: aave-v3
      contracts:
        pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
      test:
        supply_amount: "1000000000"       # 1000 USDC
        borrow_amount: "500000000"        # 500 USDC
```

### Token Deal Pattern (Anvil Cheatcode)

whale 주소에 의존하지 않고 직접 ERC20 잔액을 설정하는 방법:

#### Native Token
```bash
cast rpc anvil_setBalance {TEST_ACCOUNT} 0x56BC75E2D63100000  # 100 ETH
```

#### Wrapped Native (WETH deposit)
```bash
cast send {WETH_ADDRESS} "deposit()" --value 10ether --from {TEST_ACCOUNT} --unlocked
```

#### ERC20 via Storage Slot Deal
```bash
# USDC balanceOf mapping은 storage slot 9에 있음
# keccak256(abi.encode(address, uint256(slot))) = storage key
SLOT=$(cast index address {TEST_ACCOUNT} 9)
cast rpc anvil_setStorageAt {USDC_ADDRESS} $SLOT 0x000000000000000000000000000000000000000000000000000000003B9ACA00
# 0x3B9ACA00 = 1,000,000,000 = 1000 USDC (6 decimals)
```

#### TypeScript dealERC20 Helper
```typescript
import { execSync } from 'child_process';

function dealERC20(
  tokenAddress: string,
  recipient: string,
  amount: bigint,
  balanceSlot: number,
  rpcUrl: string,
): void {
  const CAST = process.env.CAST_PATH ?? 'cast';
  // Compute mapping slot: keccak256(abi.encode(recipient, slot))
  const storageKey = execSync(
    `${CAST} index address ${recipient} ${balanceSlot}`,
    { encoding: 'utf-8' }
  ).trim();
  const paddedAmount = '0x' + amount.toString(16).padStart(64, '0');
  execSync(
    `${CAST} rpc anvil_setStorageAt ${tokenAddress} ${storageKey} ${paddedAmount} --rpc-url ${rpcUrl}`,
    { encoding: 'utf-8' }
  );
}

// Usage:
dealERC20(
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',  // TEST_ACCOUNT
  1_000_000_000n,   // 1000 USDC
  9,                // USDC balance slot
  'http://127.0.0.1:8900'
);
```

#### Common ERC20 Balance Slots
| Token | Balance Slot | Notes |
|-------|-------------|-------|
| USDC (most chains) | 9 | OpenZeppelin proxy pattern |
| USDT | 2 | Direct mapping |
| DAI | 2 | Direct mapping |
| WETH | 3 | Standard WETH9 |
| Most ERC20 | 0 | Default OpenZeppelin |

> **검증**: `cast call {token} "balanceOf(address)(uint256)" {account} --rpc-url {rpc}` 로 확인

---

## 테스트 환경 설정 규칙

### 1. Anvil Fork Setup
```
anvil --fork-url <RPC> --port <PORT> --auto-impersonate --no-storage-caching
```
- **대기**: `cast block-number` 가 > 0 반환할 때까지 poll (max 30회 × 2초)
- **계정**: Anvil default `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **펀딩**: `anvil_setBalance` 로 100 native token
- **ERC20**: whale impersonate → transfer, 또는 `deal` 사용

### 2. 토큰 사전 준비
| Action | Method | 비고 |
|--------|--------|------|
| Native 펀딩 | `anvil_setBalance(addr, 0x56BC75E2D63100000)` | 100 ETH |
| Wrapped Native | `WETH.deposit{value: 10 ether}()` | msg.value로 wrap |
| Stablecoin | `impersonate(whale) → transfer(testAddr, amount)` | whale 잔액 확인 필수 |
| Approve | `token.approve(spender, type(uint256).max)` | 모든 interaction 전 필수 |

### 3. 검증 기준
- **pass**: 기대 결과와 일치하는 JSON 출력 또는 tx 성공
- **fail**: revert, 잘못된 값, timeout
- **skip**: 해당 체인에 프로토콜 미배포 (문서화 필수)

---

## DEX 테스트 규칙

### Interface: `IDex`

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 필수 사전조건 |
|---|----------|-----|----------------|----------|-------------|
| D1 | `quote()` | `quoteExactInputSingle(address,address,uint24,uint256,uint160)` (V3) | 1 WETH → USDC quote | `amount_out > 0` | quoter 컨트랙트 주소 필요 |
| D2 | `buildSwap()` | `exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))` (V3) | dry-run swap tx 생성 | calldata 생성됨, `status=dry_run` | — |
| D3 | `swap (broadcast)` | 위와 동일 | 실제 스왑 실행 | USDC 잔액 증가, WETH 잔액 감소 | WETH 잔액 + approve 완료 |
| D4 | `buildAddLiquidity()` | `mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))` (V3) | LP 포지션 생성 dry-run | calldata 생성됨 | 양쪽 토큰 잔액 + approve |
| D5 | `buildRemoveLiquidity()` | `decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))` (V3) | LP 제거 dry-run | calldata 생성됨 | LP position 존재 |

#### DEX Interface별 ABI 차이

**Uniswap V2:**
```
swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)
getAmountsOut(uint256 amountIn, address[] path) → uint256[] amounts  [quote용]
```

**Uniswap V3:**
```
exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) → uint256 amountOut
```
- fee: 500 (0.05%), 3000 (0.3%), 10000 (1%)
- sqrtPriceLimitX96: 0 = 제한 없음
- deadline: `Math.floor(Date.now()/1000) + 3600`

**Algebra V3:**
```
exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) → uint256 amountOut
```
- fee 파라미터 없음 (pool이 동적 fee 관리)
- `limitSqrtPrice` = V3의 `sqrtPriceLimitX96`

**Solidly V2:**
```
swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) → uint256[] amounts
```
- `stable: true` = stableswap pool, `false` = volatile pool

**Curve StableSwap:**
```
exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) → uint256
```
- i, j = pool 내 token index (0, 1, 2...)
- pool마다 토큰 순서가 다름 — `coins(i)` 로 확인 필수

**Balancer V3:**
```
swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes userData) → uint256 amountOut
```

**WooFi:**
```
swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) → uint256 realToAmount
```
- `rebateTo` = 보통 zero address

### Calldata Encoding Examples (viem)

#### Uniswap V3 — exactInputSingle
```typescript
import { encodeFunctionData, parseAbi } from 'viem';

const uniV3RouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256)',
]);

const calldata = encodeFunctionData({
  abi: uniV3RouterAbi,
  functionName: 'exactInputSingle',
  args: [{
    tokenIn:              fixture.tokens.wrapped.address,
    tokenOut:             fixture.tokens.stablecoin.address,
    fee:                  3000,   // 0.3% pool
    recipient:            TEST_ACCOUNT,
    deadline:             BigInt(Math.floor(Date.now() / 1000) + 3600),
    amountIn:             1_000_000_000_000_000_000n,  // 1 WETH
    amountOutMinimum:     0n,
    sqrtPriceLimitX96:    0n,
  }],
});
// Execute: cast send {router} {calldata} --from {TEST_ACCOUNT} --unlocked --rpc-url {rpc}
```

#### Algebra V3 — exactInputSingle (no fee param)
```typescript
const algebraRouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) returns (uint256)',
]);

const calldata = encodeFunctionData({
  abi: algebraRouterAbi,
  functionName: 'exactInputSingle',
  args: [{
    tokenIn:           fixture.tokens.wrapped.address,
    tokenOut:          fixture.tokens.stablecoin.address,
    recipient:         TEST_ACCOUNT,
    deadline:          BigInt(Math.floor(Date.now() / 1000) + 3600),
    amountIn:          1_000_000_000_000_000_000n,
    amountOutMinimum:  0n,
    limitSqrtPrice:    0n,
  }],
});
```

#### Uniswap V2 / Solidly V2 — swapExactTokensForTokens
```typescript
// Uniswap V2
const uniV2RouterAbi = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]);

const calldataV2 = encodeFunctionData({
  abi: uniV2RouterAbi,
  functionName: 'swapExactTokensForTokens',
  args: [
    1_000_000_000_000_000_000n,  // amountIn: 1 WETH
    0n,                           // amountOutMin: 0 (no slippage protection in test)
    [fixture.tokens.wrapped.address, fixture.tokens.stablecoin.address],
    TEST_ACCOUNT,
    BigInt(Math.floor(Date.now() / 1000) + 3600),
  ],
});

// Solidly V2 (routes struct)
const solidlyRouterAbi = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) returns (uint256[])',
]);

const calldataSolidly = encodeFunctionData({
  abi: solidlyRouterAbi,
  functionName: 'swapExactTokensForTokens',
  args: [
    1_000_000_000_000_000_000n,
    0n,
    [{ from: fixture.tokens.wrapped.address, to: fixture.tokens.stablecoin.address, stable: false }],
    TEST_ACCOUNT,
    BigInt(Math.floor(Date.now() / 1000) + 3600),
  ],
});
```

#### Curve StableSwap — exchange
```typescript
const curvePoolAbi = parseAbi([
  'function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) returns (uint256)',
  'function coins(uint256 i) view returns (address)',
]);

// 먼저 coins(0), coins(1) 로 token 순서 확인
// i=0 이 tokenIn, j=1 이 tokenOut이라고 가정
const calldataCurve = encodeFunctionData({
  abi: curvePoolAbi,
  functionName: 'exchange',
  args: [0n, 1n, 1_000_000_000_000_000_000n, 0n],
});
```

#### Balancer V3 — swapSingleTokenExactIn
```typescript
const balancerRouterAbi = parseAbi([
  'function swapSingleTokenExactIn(address pool, address tokenIn, address tokenOut, uint256 exactAmountIn, uint256 minAmountOut, uint256 deadline, bool wethIsEth, bytes userData) returns (uint256)',
]);

const calldataBalancer = encodeFunctionData({
  abi: balancerRouterAbi,
  functionName: 'swapSingleTokenExactIn',
  args: [
    dex.contracts.pool,
    fixture.tokens.wrapped.address,
    fixture.tokens.stablecoin.address,
    1_000_000_000_000_000_000n,
    0n,
    BigInt(Math.floor(Date.now() / 1000) + 3600),
    false,
    '0x',
  ],
});
```

---

## Lending 테스트 규칙

### Interface: `ILending`

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| L1 | `getRates()` | `getReserveData(address asset)` | USDC rates 조회 | `supply_apy > 0`, `borrow_variable_apy > 0` | — |
| L2 | `getUserPosition()` | `getUserAccountData(address user)` | 빈 포지션 조회 | JSON 반환, supplies/borrows 배열 | — |
| L3 | `buildSupply()` | `supply(address,uint256,address,uint16)` | dry-run supply | calldata 생성됨 | — |
| L4 | `supply (broadcast)` | 위와 동일 | **실제 supply** | position에 supply 잔액 생김 | 토큰 잔액 + approve |
| L5 | `buildBorrow()` | `borrow(address,uint256,uint256,uint16,address)` | dry-run borrow | calldata 생성됨 | collateral 존재 |
| L6 | `buildRepay()` | `repay(address,uint256,uint256,address)` | dry-run repay | calldata 생성됨 | borrow 존재 |
| L7 | `buildWithdraw()` | `withdraw(address,uint256,address)` | **실제 withdraw** | supply 잔액 감소 또는 0 | supply 존재 |

#### Lending Interface별 ABI 차이

**Aave V3:**
```
supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) → uint256
withdraw(address asset, uint256 amount, address to) → uint256
getUserAccountData(address user) → (totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor)
getReserveData(address asset) → ReserveData struct
```
- `interestRateMode`: 1=stable, 2=variable
- `referralCode`: 0 (no referral)
- `amount = type(uint256).max` → withdraw/repay all
- rates는 RAY 단위 (1e27): `APY = rate / 1e27 * 100`
- healthFactor는 1e18 단위: `HF = healthFactor / 1e18`

**Compound V2:**
```
mint(uint256 mintAmount) → uint256  [cToken에 직접 호출]
redeem(uint256 redeemTokens) → uint256
borrow(uint256 borrowAmount) → uint256
repayBorrow(uint256 repayAmount) → uint256
balanceOf(address owner) → uint256  [cToken 잔액]
borrowBalanceCurrent(address account) → uint256
exchangeRateCurrent() → uint256
```
- cToken 주소에 직접 호출 (Pool 패턴 아님)
- exchangeRate = cToken가치 / underlying가치 (1e18 스케일)
- APY 계산: `(1 + ratePerBlock * blocksPerYear) - 1`

**Compound V3 (Comet):**
```
supply(address asset, uint256 amount)
withdraw(address asset, uint256 amount)
balanceOf(address account) → uint256
borrowBalanceOf(address account) → uint256
getSupplyRate(uint256 utilization) → uint64
getBorrowRate(uint256 utilization) → uint64
```
- 단일 Comet 컨트랙트에 모든 함수
- rate는 per-second 단위: `APY = rate * SECONDS_PER_YEAR / 1e18 * 100`

**Euler V2:**
```
deposit(uint256 amount, address receiver) → uint256 shares  [EVK vault]
withdraw(uint256 amount, address receiver, address owner) → uint256 shares
borrow(uint256 amount, address receiver) → uint256
repay(uint256 amount, address receiver) → uint256
```
- ERC-4626 기반 vault 패턴
- rate는 per-second, 1e27 스케일

**Morpho Blue:**
```
supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) → uint256 assetsSupplied, uint256 sharesSupplied
borrow(...) → uint256 assetsBorrowed, uint256 sharesBorrowed
repay(...) → uint256 assetsRepaid, uint256 sharesRepaid
withdraw(...) → uint256 assetsWithdrawn, uint256 sharesWithdrawn
```
- MarketParams struct를 첫 인자로 받음 (tuple 인코딩 주의)
- `assets` 또는 `shares` 중 하나만 non-zero (다른 하나는 0)

### Calldata Encoding Examples (viem)

#### Aave V3 — supply
```typescript
import { encodeFunctionData, parseAbi, maxUint256 } from 'viem';

const aavePoolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
]);

// Supply 1000 USDC
const supplyCalldata = encodeFunctionData({
  abi: aavePoolAbi,
  functionName: 'supply',
  args: [
    fixture.tokens.stablecoin.address,
    1_000_000_000n,  // 1000 USDC (6 decimals)
    TEST_ACCOUNT,
    0,               // referralCode: 0
  ],
});

// Withdraw all
const withdrawCalldata = encodeFunctionData({
  abi: aavePoolAbi,
  functionName: 'withdraw',
  args: [fixture.tokens.stablecoin.address, maxUint256, TEST_ACCOUNT],
});

// Borrow 500 USDC (variable rate = 2)
const borrowCalldata = encodeFunctionData({
  abi: aavePoolAbi,
  functionName: 'borrow',
  args: [fixture.tokens.stablecoin.address, 500_000_000n, 2n, 0, TEST_ACCOUNT],
});
```

#### Compound V3 (Comet) — supply / withdraw
```typescript
const cometAbi = parseAbi([
  'function supply(address asset, uint256 amount)',
  'function withdraw(address asset, uint256 amount)',
]);

const supplyCalldata = encodeFunctionData({
  abi: cometAbi,
  functionName: 'supply',
  args: [fixture.tokens.stablecoin.address, 1_000_000_000n],
});
```

#### Morpho Blue — supply (tuple encoding)
```typescript
const morphoAbi = parseAbi([
  'function supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)',
]);

const supplyCalldata = encodeFunctionData({
  abi: morphoAbi,
  functionName: 'supply',
  args: [
    {
      loanToken:       fixture.tokens.stablecoin.address,
      collateralToken: fixture.tokens.wrapped.address,
      oracle:          lending.contracts.oracle,
      irm:             lending.contracts.irm,
      lltv:            lending.test.lltv,
    },
    1_000_000_000n,  // assets (non-zero)
    0n,              // shares (must be 0 when assets is non-zero)
    TEST_ACCOUNT,
    '0x',
  ],
});
```

---

## Vault 테스트 규칙

### Interface: `IVault` (ERC-4626)

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| V1 | `getVaultInfo()` | `totalAssets()`, `totalSupply()` | vault 정보 조회 | `total_assets >= 0` | — |
| V2 | `convertToShares()` | `convertToShares(uint256 assets)` | asset→share 변환 | `shares > 0` (amount > 0일 때) | — |
| V3 | `convertToAssets()` | `convertToAssets(uint256 shares)` | share→asset 변환 | `assets > 0` (shares > 0일 때) | — |
| V4 | `buildDeposit()` | `deposit(uint256 assets, address receiver)` | dry-run deposit | calldata 생성됨 | — |
| V5 | `deposit (broadcast)` | 위와 동일 | **실제 deposit** | share 잔액 증가 | underlying 잔액 + approve |
| V6 | `buildWithdraw()` | `withdraw(uint256 assets, address receiver, address owner)` | **실제 withdraw** | underlying 잔액 복구 | share 존재 |

#### ERC-4626 ABI
```
deposit(uint256 assets, address receiver) → uint256 shares
withdraw(uint256 assets, address receiver, address owner) → uint256 shares
redeem(uint256 shares, address receiver, address owner) → uint256 assets
totalAssets() → uint256
totalSupply() → uint256
convertToShares(uint256 assets) → uint256
convertToAssets(uint256 shares) → uint256
asset() → address  [underlying token]
```

### Calldata Encoding Examples (viem)

#### ERC-4626 — deposit / withdraw
```typescript
import { encodeFunctionData, parseAbi, maxUint256 } from 'viem';

const erc4626Abi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
]);

// Deposit 1000 USDC
const depositCalldata = encodeFunctionData({
  abi: erc4626Abi,
  functionName: 'deposit',
  args: [1_000_000_000n, TEST_ACCOUNT],
});

// Withdraw (use maxUint256 to withdraw all)
const withdrawCalldata = encodeFunctionData({
  abi: erc4626Abi,
  functionName: 'withdraw',
  args: [maxUint256, TEST_ACCOUNT, TEST_ACCOUNT],
});
// Execute: cast send {vault} {depositCalldata} --from {TEST_ACCOUNT} --unlocked --rpc-url {rpc}
```

---

## CDP 테스트 규칙

### Interface: `ICdp` (Liquity V2 / Felix)

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| C1 | `getCdpInfo()` | `Troves(uint256)`, `getCurrentICR()` | trove 정보 조회 | collateral, debt, ratio | trove 존재 |
| C2 | `buildOpen()` | `openTrove(...)` | trove 생성 dry-run | calldata 생성됨 | collateral + HintHelpers |
| C3 | `buildAdjust()` | `adjustTrove(...)` | trove 조정 dry-run | calldata 생성됨 | trove 존재 |
| C4 | `buildClose()` | `closeTrove(uint256)` | trove 종료 dry-run | calldata 생성됨 | trove 존재 + debt 상환 가능 |

---

## Liquid Staking 테스트 규칙

### Interface: `ILiquidStaking`

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| S1 | `getInfo()` | `totalSupply()`, `exchangeRate()` | staking 정보 | exchange_rate > 0, apy 존재 | — |
| S2 | `buildStake()` | `submit()` (stETH) / `deposit()` | stake dry-run | calldata + value 생성됨 | native token 잔액 |
| S3 | `buildUnstake()` | `requestWithdrawals(uint256[])` | unstake dry-run | calldata 생성됨 | LST 잔액 |

---

## NFT 테스트 규칙

### Interface: `INft` (ERC-721)

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| N1 | `getCollectionInfo()` | `name()`, `symbol()`, `totalSupply()` | collection 정보 | name, symbol 문자열 반환 | — |
| N2 | `getTokenInfo()` | `ownerOf(uint256)`, `tokenURI(uint256)` | token #1 정보 | owner 주소, URI 문자열 | tokenId 존재 |
| N3 | `getBalance()` | `balanceOf(address)` | 주소의 NFT 보유 수 | `balance >= 0` | — |

#### ERC-721 ABI
```
name() → string
symbol() → string
totalSupply() → uint256           // OPTIONAL — 없는 컬렉션 있음
balanceOf(address owner) → uint256
ownerOf(uint256 tokenId) → address
tokenURI(uint256 tokenId) → string // IPFS/Arweave URL 반환
approve(address to, uint256 tokenId)
transferFrom(address from, address to, uint256 tokenId)
```
- `totalSupply()` 는 ERC-721 필수가 아님 (ERC-721Enumerable에만 있음)
- `tokenURI()` 는 IPFS gateway 변환 필요할 수 있음

---

## Gauge 테스트 규칙

### Interface: `IGaugeSystem` (ve(3,3))

| # | Function | ABI | 테스트 시나리오 | 검증 기준 | 사전조건 |
|---|----------|-----|----------------|----------|---------|
| G1 | `buildDeposit()` | `deposit(uint256 amount, uint256 tokenId)` | gauge deposit dry-run | calldata | LP 토큰 잔액 |
| G2 | `buildWithdraw()` | `withdraw(uint256 amount)` | gauge withdraw dry-run | calldata | staked LP |
| G3 | `buildClaimRewards()` | `getReward(address account)` | rewards claim | calldata | pending rewards |
| G4 | `buildCreateLock()` | `create_lock(uint256 value, uint256 lock_duration)` | veNFT 생성 | calldata | governance token |
| G5 | `buildVote()` | `vote(uint256 tokenId, address[] pools, uint256[] weights)` | 투표 | calldata | veNFT 보유 |

---

## Bridge 테스트 규칙 (Read-only)

Bridge 프로토콜은 config 등록만 되어 있고 어댑터가 없음. 테스트는 status 조회로 제한.

| # | Function | 테스트 시나리오 | 검증 기준 |
|---|----------|----------------|----------|
| B1 | `status --verify` | 컨트랙트 존재 확인 | `has_code = true` |

---

## 테스트 실행 순서 (Full Lifecycle)

```
Chain별 테스트 플로우:

1. SETUP
   ├── Anvil fork 시작 (max 60초 대기)
   ├── 테스트 계정 native 펀딩 (100 tokens)
   ├── Wrapped native 생성 (10 tokens → WETH/WHYPE 등)
   └── Stablecoin 획득 (whale impersonate → 1000 USDC)

2. TOKEN
   ├── D1: DEX에 wrapped native approve
   ├── L1: Lending pool에 stablecoin approve
   └── V1: Vault에 underlying approve

3. DEX (모든 DEX 프로토콜)
   ├── D1: quote (wrapped → stable)
   ├── D2: swap dry-run
   └── D3: swap broadcast → 잔액 변화 확인

4. LENDING (모든 Lending 프로토콜)
   ├── L1: rates 조회 (supply_apy > 0)
   ├── L2: 빈 position 확인
   ├── L4: supply broadcast → position 확인 (L2)
   ├── L5: borrow dry-run (collateral 있으므로)
   └── L7: withdraw broadcast → 잔액 복구

5. VAULT (모든 Vault 프로토콜)
   ├── V1: vault info (totalAssets)
   ├── V2: convertToShares
   ├── V5: deposit broadcast → share 확인
   └── V6: withdraw broadcast → underlying 복구

6. NFT (해당 체인에 있으면)
   ├── N1: collection info
   ├── N2: token info (tokenId=1)
   └── N3: balance 확인

7. SCAN
   └── exploit detection (1회)

8. TEARDOWN
   ├── 최종 잔액 확인 (native + wrapped + stable)
   ├── Anvil 종료
   └── 결과 JSON 저장
```

---

## 체인별 테스트 커버리지 매트릭스

각 체인은 보유한 프로토콜에 따라 아래 테스트를 실행:

| 체인 유형 | DEX | Lending | Vault | NFT | Scan | 예상 테스트 수 |
|----------|-----|---------|-------|-----|------|-------------|
| Full (HyperEVM, Ethereum, Arbitrum, Base) | D1-D3 | L1-L7 | V1-V6 | N1-N3 | ✅ | 20+ |
| Standard (대부분 체인) | D1-D3 | L1-L4,L7 | V1 | N1,N3 | ✅ | 12+ |
| Minimal (Zircuit, Harmony) | D1-D2 | — | — | — | ✅ | 3+ |

---

## AI Test Runner Template

AI 에이전트는 아래 패턴을 사용하여 각 체인을 테스트합니다.
파일 위치: `test/e2e/ai-runner.ts`

```typescript
#!/usr/bin/env npx tsx
/**
 * AI Test Runner — fixture 기반 자동 테스트
 * Usage: npx tsx test/e2e/ai-runner.ts --chain ethereum
 */
import { execSync, spawn, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { encodeFunctionData, parseAbi, maxUint256 } from 'viem';

const CAST       = process.env.CAST_PATH  ?? '/Users/hik/.foundry/bin/cast';
const ANVIL      = process.env.ANVIL_PATH ?? '/Users/hik/.foundry/bin/anvil';
const TS_ROOT    = resolve(import.meta.dirname!, '../..');
const CLI        = `node ${resolve(TS_ROOT, 'packages/defi-cli/dist/main.js')}`;
const ANVIL_PORT = 8900;
const ANVIL_RPC  = `http://127.0.0.1:${ANVIL_PORT}`;

const TEST_ACCOUNT    = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MAX_UINT256      = maxUint256;

// ── Types ────────────────────────────────────────────────────────────────────

interface Fixture {
  chain: { slug: string; chain_id: number; rpc_url: string; native_symbol: string };
  tokens: {
    wrapped:    { address: string; symbol: string; decimals: number; balance_slot: number };
    stablecoin: { address: string; symbol: string; decimals: number; balance_slot: number };
  };
  funding: { native_amount: string; wrapped_amount: string; stablecoin_amount: string };
  protocols: {
    dex?:     Array<{ slug: string; interface: string; contracts: Record<string, string>; test: Record<string, any> }>;
    lending?: Array<{ slug: string; interface: string; contracts: Record<string, string>; test: Record<string, any> }>;
    vault?:   Array<{ slug: string; interface: string; contracts: Record<string, string>; test: Record<string, any> }>;
  };
}

interface TestResult { step: string; status: 'pass' | 'fail' | 'skip'; detail: string; ms: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

function cast(args: string): string {
  try {
    return execSync(`${CAST} ${args} --rpc-url ${ANVIL_RPC}`, { encoding: 'utf-8', timeout: 15_000 }).trim();
  } catch (e: any) {
    return `ERROR: ${String(e.message ?? '').slice(0, 120)}`;
  }
}

function cli(args: string, chainSlug: string): any {
  try {
    const env = {
      ...process.env,
      [`${chainSlug.toUpperCase()}_RPC_URL`]: ANVIL_RPC,
      DEFI_WALLET_ADDRESS: TEST_ACCOUNT,
      DEFI_PRIVATE_KEY: TEST_PRIVATE_KEY,
    };
    const out = execSync(`${CLI} ${args}`, { encoding: 'utf-8', timeout: 30_000, cwd: TS_ROOT, env });
    return JSON.parse(out.trim());
  } catch (e: any) {
    try { return JSON.parse((e.stdout ?? e.stderr ?? '').trim()); } catch {}
    return { error: String(e.message ?? '').slice(0, 100) };
  }
}

/** Set ERC20 balance via storage slot manipulation (no whale needed) */
function dealERC20(tokenAddress: string, recipient: string, amount: bigint, balanceSlot: number): void {
  const storageKey = execSync(`${CAST} index address ${recipient} ${balanceSlot} --rpc-url ${ANVIL_RPC}`, { encoding: 'utf-8' }).trim();
  const paddedAmount = '0x' + amount.toString(16).padStart(64, '0');
  cast(`rpc anvil_setStorageAt ${tokenAddress} ${storageKey} ${paddedAmount}`);
}

/** Wait for Anvil to be ready (polls cast block-number) */
async function waitForAnvil(maxRetries = 30, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const result = cast('block-number');
    if (!result.startsWith('ERROR') && parseInt(result) > 0) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Calldata builders ────────────────────────────────────────────────────────

function encodeSwap(
  iface: string,
  contracts: Record<string, string>,
  tokens: Fixture['tokens'],
  testParams: Record<string, any>,
): string {
  const amountIn = BigInt(testParams.amount_in ?? '1000000000000000000');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  if (iface === 'uniswap-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256)']),
      functionName: 'exactInputSingle',
      args: [{ tokenIn: tokens.wrapped.address as `0x${string}`, tokenOut: tokens.stablecoin.address as `0x${string}`, fee: testParams.fee ?? 3000, recipient: TEST_ACCOUNT as `0x${string}`, deadline, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
    });
  }
  if (iface === 'algebra-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) returns (uint256)']),
      functionName: 'exactInputSingle',
      args: [{ tokenIn: tokens.wrapped.address as `0x${string}`, tokenOut: tokens.stablecoin.address as `0x${string}`, recipient: TEST_ACCOUNT as `0x${string}`, deadline, amountIn, amountOutMinimum: 0n, limitSqrtPrice: 0n }],
    });
  }
  if (iface === 'uniswap-v2') {
    return encodeFunctionData({
      abi: parseAbi(['function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])']),
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, 0n, [tokens.wrapped.address as `0x${string}`, tokens.stablecoin.address as `0x${string}`], TEST_ACCOUNT as `0x${string}`, deadline],
    });
  }
  throw new Error(`Unknown DEX interface: ${iface}`);
}

function encodeSupply(iface: string, contracts: Record<string, string>, assetAddress: string, amount: bigint): string {
  if (iface === 'aave-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)']),
      functionName: 'supply',
      args: [assetAddress as `0x${string}`, amount, TEST_ACCOUNT as `0x${string}`, 0],
    });
  }
  if (iface === 'compound-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function supply(address asset, uint256 amount)']),
      functionName: 'supply',
      args: [assetAddress as `0x${string}`, amount],
    });
  }
  throw new Error(`Unknown lending interface: ${iface}`);
}

function encodeWithdraw(iface: string, assetAddress: string): string {
  if (iface === 'aave-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function withdraw(address asset, uint256 amount, address to) returns (uint256)']),
      functionName: 'withdraw',
      args: [assetAddress as `0x${string}`, MAX_UINT256, TEST_ACCOUNT as `0x${string}`],
    });
  }
  if (iface === 'compound-v3') {
    return encodeFunctionData({
      abi: parseAbi(['function withdraw(address asset, uint256 amount)']),
      functionName: 'withdraw',
      args: [assetAddress as `0x${string}`, MAX_UINT256],
    });
  }
  throw new Error(`Unknown lending interface: ${iface}`);
}

function encodeApprove(spender: string, amount: bigint = MAX_UINT256): string {
  return encodeFunctionData({
    abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
    functionName: 'approve',
    args: [spender as `0x${string}`, amount],
  });
}

function getERC20Balance(tokenAddress: string, owner: string): bigint {
  const result = cast(`call ${tokenAddress} "balanceOf(address)(uint256)" ${owner}`);
  if (result.startsWith('ERROR')) return 0n;
  return BigInt(result.trim());
}

// ── Main runner ──────────────────────────────────────────────────────────────

async function runChain(chain: string): Promise<void> {
  const fixturePath = resolve(TS_ROOT, `test/fixtures/${chain}.yaml`);
  const fixture = yaml.load(readFileSync(fixturePath, 'utf-8')) as Fixture;
  const results: TestResult[] = [];
  let anvilProc: ChildProcess | null = null;

  const record = (step: string, status: TestResult['status'], detail: string, t: number) => {
    results.push({ step, status, detail, ms: Date.now() - t });
    const mark = status === 'pass' ? '[PASS]' : status === 'fail' ? '[FAIL]' : '[SKIP]';
    console.log(`  ${mark} ${step}: ${detail}`);
  };

  // ── 1. Setup ──────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}\nRunning: ${chain}\n${'='.repeat(60)}`);
  const t0 = Date.now();

  anvilProc = spawn(ANVIL, [
    '--fork-url', fixture.chain.rpc_url,
    '--port', String(ANVIL_PORT),
    '--auto-impersonate',
    '--no-storage-caching',
    '--silent',
  ], { stdio: 'ignore' });

  const ready = await waitForAnvil();
  if (!ready) { record('setup', 'fail', 'Anvil did not start', t0); return; }

  // Fund native
  cast(`rpc anvil_setBalance ${TEST_ACCOUNT} ${fixture.funding.native_amount}`);

  // Fund wrapped native via deposit()
  cast(`send ${fixture.tokens.wrapped.address} "deposit()" --value ${fixture.funding.wrapped_amount} --from ${TEST_ACCOUNT} --unlocked`);

  // Fund stablecoin via storage slot deal (no whale)
  dealERC20(
    fixture.tokens.stablecoin.address,
    TEST_ACCOUNT,
    BigInt(fixture.funding.stablecoin_amount),
    fixture.tokens.stablecoin.balance_slot,
  );

  const stableBal = getERC20Balance(fixture.tokens.stablecoin.address, TEST_ACCOUNT);
  record('setup', stableBal > 0n ? 'pass' : 'fail', `stablecoin balance=${stableBal}`, t0);

  // ── 2. DEX ────────────────────────────────────────────────────────────────
  for (const dex of fixture.protocols.dex ?? []) {
    const t = Date.now();

    // Approve wrapped native for router
    const approveCalldata = encodeApprove(dex.contracts.router);
    cast(`send ${fixture.tokens.wrapped.address} ${approveCalldata} --from ${TEST_ACCOUNT} --unlocked`);

    // Quote (if quoter exists)
    if (dex.contracts.quoter) {
      const quote = cli(`dex quote --json --protocol ${dex.slug} --token-in ${fixture.tokens.wrapped.address} --token-out ${fixture.tokens.stablecoin.address} --amount ${dex.test.amount_in ?? '1000000000000000000'} --chain ${chain}`, chain);
      record(`dex.${dex.slug}.quote`, quote.amount_out && !quote.error ? 'pass' : 'fail', quote.amount_out ?? quote.error ?? 'no result', t);
    }

    // Swap broadcast
    const t2 = Date.now();
    const balBefore = getERC20Balance(fixture.tokens.stablecoin.address, TEST_ACCOUNT);
    const swapCalldata = encodeSwap(dex.interface, dex.contracts, fixture.tokens, dex.test);
    const swapResult = cast(`send ${dex.contracts.router} ${swapCalldata} --from ${TEST_ACCOUNT} --unlocked`);
    const balAfter = getERC20Balance(fixture.tokens.stablecoin.address, TEST_ACCOUNT);
    record(
      `dex.${dex.slug}.swap`,
      balAfter > balBefore ? 'pass' : 'fail',
      `stablecoin delta=${balAfter - balBefore} ${swapResult.startsWith('ERROR') ? swapResult.slice(0, 80) : ''}`,
      t2,
    );
  }

  // ── 3. Lending ───────────────────────────────────────────────────────────
  for (const lending of fixture.protocols.lending ?? []) {
    const t = Date.now();
    const supplyAmount = BigInt(lending.test.supply_amount ?? '1000000000');

    // Rates
    const rates = cli(`lending rates --json --protocol ${lending.slug} --asset ${fixture.tokens.stablecoin.address} --chain ${chain}`, chain);
    record(`lending.${lending.slug}.rates`, rates.supply_apy !== undefined && !rates.error ? 'pass' : 'fail', `supply=${rates.supply_apy?.toFixed(2) ?? 'err'}%`, t);

    // Approve stablecoin for pool
    const approveCalldata = encodeApprove(lending.contracts.pool, MAX_UINT256);
    cast(`send ${fixture.tokens.stablecoin.address} ${approveCalldata} --from ${TEST_ACCOUNT} --unlocked`);

    // Supply broadcast
    const t2 = Date.now();
    const supplyCalldata = encodeSupply(lending.interface, lending.contracts, fixture.tokens.stablecoin.address, supplyAmount);
    const supplyResult = cast(`send ${lending.contracts.pool} ${supplyCalldata} --from ${TEST_ACCOUNT} --unlocked`);
    record(`lending.${lending.slug}.supply`, !supplyResult.startsWith('ERROR') ? 'pass' : 'fail', supplyResult.startsWith('ERROR') ? supplyResult.slice(0, 80) : 'tx ok', t2);

    // Verify position exists
    const t3 = Date.now();
    const pos = cli(`lending position --json --protocol ${lending.slug} --address ${TEST_ACCOUNT} --chain ${chain}`, chain);
    record(`lending.${lending.slug}.position`, pos.protocol && !pos.error ? 'pass' : 'fail', `supplies=${pos.supplies?.length ?? 0}`, t3);

    // Withdraw broadcast
    const t4 = Date.now();
    const withdrawCalldata = encodeWithdraw(lending.interface, fixture.tokens.stablecoin.address);
    const withdrawResult = cast(`send ${lending.contracts.pool} ${withdrawCalldata} --from ${TEST_ACCOUNT} --unlocked`);
    record(`lending.${lending.slug}.withdraw`, !withdrawResult.startsWith('ERROR') ? 'pass' : 'fail', withdrawResult.startsWith('ERROR') ? withdrawResult.slice(0, 80) : 'tx ok', t4);
  }

  // ── 4. Vault ─────────────────────────────────────────────────────────────
  for (const vault of fixture.protocols.vault ?? []) {
    const t = Date.now();
    const info = cli(`vault info --json --protocol ${vault.slug} --chain ${chain}`, chain);
    record(`vault.${vault.slug}.info`, info.total_assets !== undefined && !info.error ? 'pass' : 'fail', `total_assets=${info.total_assets}`, t);
  }

  // ── 5. Teardown ──────────────────────────────────────────────────────────
  anvilProc?.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));

  // ── Summary ───────────────────────────────────────────────────────────────
  const p = results.filter(r => r.status === 'pass').length;
  const f = results.filter(r => r.status === 'fail').length;
  const s = results.filter(r => r.status === 'skip').length;
  console.log(`\n  Summary: ${p} pass, ${f} fail, ${s} skip`);
  if (f > 0) process.exitCode = 1;
}

// Entry point
const chain = process.argv.find(a => a.startsWith('--chain'))
  ? process.argv[process.argv.indexOf('--chain') + 1]
  : 'ethereum';

runChain(chain).catch(e => { console.error(e); process.exit(1); });
```

---

## 에러 처리 규칙

| 에러 유형 | 원인 | 처리 |
|----------|------|------|
| `insufficient allowance` | approve 미실행 | 테스트 순서 오류 — approve 먼저 |
| `transfer amount exceeds balance` | 잔액 부족 | whale 잔액 확인, 금액 축소 |
| `execution reverted` | 컨트랙트 로직 실패 | ABI 파라미터 확인, 상태 조건 확인 |
| `Unknown block` | RPC가 fork block 미지원 | 다른 RPC 사용 |
| `rate limited` / `502` | 공개 RPC 제한 | 유료 RPC 또는 재시도 |
| `The contract function returned no data` | 컨트랙트 미배포 | 주소 확인, 체인 확인 |
| `Transaction too old` | deadline 만료 | `Date.now()/1000 + 3600` 사용 |

---

## Decimal 규칙 (필수 확인)

| Token | Decimals | 1 token in wei |
|-------|----------|---------------|
| ETH/WETH/HYPE | 18 | `1000000000000000000` |
| USDC | 6 | `1000000` |
| USDT | 6 | `1000000` |
| WBTC | 8 | `100000000` |
| DAI | 18 | `1000000000000000000` |

**항상 `decimals()` 호출로 확인** — 체인마다 다를 수 있음.
