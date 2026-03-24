# Lesson Learned: Multi-Chain E2E Testing (Mantle, Base, HyperEVM)

Generated: 2026-03-24
Chains: Mantle (5000), Base (8453), HyperEVM (999)
Mode: Mainnet + Anvil Fork

## Test Results Summary

### Lending: 7/7 ✅ (mainnet)
| Protocol | Chain | Method | Result |
|----------|-------|--------|--------|
| Aave V3 | Mantle | supply/withdraw WMNT, USDC | ✅ |
| Lendle | Mantle | deposit WMNT (aave_v2) | ✅ |
| Aave V3 | Base | supply WETH | ✅ |
| HyperLend | HyperEVM | supply WHYPE | ✅ |
| HypurrFi | HyperEVM | supply WHYPE | ✅ |
| Felix Morpho | HyperEVM | deposit WHYPE (ERC4626) | ✅ |
| PrimeFi | HyperEVM | supply (aave_v2) | ✅ |

### DEX LP: 6/10
| Protocol | Chain | Method | Result |
|----------|-------|--------|--------|
| Merchant Moe V2 | Mantle | addLiquidity | ✅ mainnet |
| Merchant Moe LB | Mantle | single-side USDC | ✅ mainnet |
| Cleopatra | Mantle | addLiquidityETH | ✅ mainnet |
| HyperSwap V3 | HyperEVM | mint (both tokens) | ✅ anvil |
| Ramses HL | HyperEVM | addLiquidity | ✅ anvil |
| Aerodrome Slipstream | Base | mint (both tokens) | ✅ anvil |
| Uniswap V3 | Base | single-side mint | ❌ see Finding #1 |
| KittenSwap | HyperEVM | Algebra mint | ❌ shared NPM issue |
| Hybra | HyperEVM | poolByPair | ❌ no WHYPE/USDC pool |

### Gauge Staking + Emission: 2/2 ✅
| Protocol | Chain | Deposit | Emission | Result |
|----------|-------|---------|----------|--------|
| Aerodrome Slipstream | Base | NFT → gauge | AERO 193.8T wei | ✅ anvil |
| Merchant Moe LB | Mantle | LB position | MOE rewarder 활성 | ✅ mainnet |

### DEX Quote: 12/17
| Status | Protocols |
|--------|-----------|
| ✅ | Agni, FusionX V3/V2, UniV3 Mantle/Base, Merchant Moe LB, Cleopatra, Aerodrome, SushiSwap, HyperSwap V3/V2 |
| ❌ | iZiSwap, PCS V3, Ramses CL/HL, KittenSwap |

---

## Critical Findings

### Finding #1: V3 Single-Side LP — amount=0이면 liquidity=0 (CRITICAL)

**문제:** Uniswap V3 NPM의 `mint()`에서 `amount0Desired=0` 또는 `amount1Desired=0`을 전달하면, NPM 내부의 `getLiquidityForAmounts()`가 `min(L_from_amount0, L_from_amount1)`을 계산하여 **liquidity=0**을 반환. pool.mint(liquidity=0)은 항상 revert.

**영향:** 모든 V3 계열 DEX (Uniswap, Aerodrome Slipstream, HyperSwap) 동일 현상. single-side LP mint가 불가능해 보이지만 실제로는 해결 가능.

**해결법:**
```typescript
// ❌ WRONG: amount1Desired=0 → liquidity=0 → revert
{ amount0Desired: parseEther("1"), amount1Desired: 0n }

// ✅ CORRECT: amount1Desired=1 (1 wei) → liquidity > 0 → success
{ amount0Desired: parseEther("1"), amount1Desired: 1n }
```

**원리:** getLiquidityForAmounts에서 min(L0, L1)을 사용하므로, 한쪽이 0이면 결과가 0. 반대쪽 토큰을 1 wei만 넣으면 L이 매우 작지만 > 0이 되어, 실제로는 amount0 기준으로 liquidity가 결정됨.

**검증:** Anvil fork에서 amount1=0 → FAIL, amount1=1 → SUCCESS 확인.

---

### Finding #2: Aave V3 APY = Base Rate Only, 프론트엔드는 Incentive 포함

**문제:** CLI에서 `getReserveData()`로 가져온 `currentLiquidityRate`는 **base supply rate만** 반영. Aave 프론트엔드는 IncentivesController의 추가 보상 APY를 합산하여 보여줌.

**예시 (Mantle USDC):**
| | CLI (base) | Frontend (base+incentive) |
|--|-----------|--------------------------|
| Supply APY | 1.26% | 3.90% |
| Borrow APY | 2.52% | 1.84% |

**해결:**
1. aToken에서 `getIncentivesController()` → RewardsController 주소 획득
2. `getRewardsByAsset(aTokenAddress)` → 보상 토큰 목록
3. `getRewardsData(aTokenAddress, rewardToken)` → emissionsPerSecond
4. emission을 APY로 변환하려면 보상 토큰 가격 + totalSupply USD 필요

**현재 구현:** emission rate + reward token 주소까지 반환. APY 변환은 가격 피드 필요로 미구현.

---

### Finding #3: Merchant Moe는 LB (Liquidity Book)가 메인 — V2 유동성 거의 없음

**문제:** Merchant Moe V2 router `getAmountsOut()`은 ~175 USDC 반환, 프론트엔드(LB)는 ~719 USDC. V2 풀에 유동성이 거의 없음.

**해결:**
```typescript
// LB Quoter: findBestPathFromAmountIn(route, amountIn)
// 주의: LB V2.2 Quoter는 uint128 사용 (uint256 아닌)
const lbQuoterAbi = parseAbi([
  "function findBestPathFromAmountIn(address[] calldata route, uint128 amountIn) external view returns (...)"
]);
```

**멀티홉 필수:** WMNT→USDC 직접 경로보다 WMNT→USDT→USDC 경로가 더 좋은 경우가 많음. intermediary 토큰을 config에 `lb_mid_*` 키로 등록.

---

### Finding #4: Solidly/Aerodrome V2 getAmountsOut — ABI가 두 가지

**V1 (Velodrome/Cleopatra 등):**
```solidity
struct Route { address from; address to; bool stable; }
function getAmountsOut(uint256 amountIn, Route[] routes) returns (uint256[])
```

**V2 (Aerodrome 등):**
```solidity
struct Route { address from; address to; bool stable; address factory; }
function getAmountsOut(uint256 amountIn, Route[] routes) returns (uint256[])
```

**해결:** factory 주소가 config에 있으면 V2 ABI, 없으면 V1 ABI로 시도. 둘 다 volatile + stable 조합을 병렬 시도.

---

### Finding #5: V3 Quoter Multi-Fee Tier 필수

**문제:** V3 quoter에 fee=3000만 하드코딩하면 대부분 revert. 많은 풀이 fee=500이나 fee=10000을 사용.

**해결:**
```typescript
const feeTiers = [500, 3000, 10000, 100];
const results = await Promise.allSettled(feeTiers.map(fee => quoter.quoteExactInputSingle(..., fee)));
// Pick best amountOut
```

---

### Finding #6: Aerodrome Slipstream NPM은 tickSpacing 사용 (fee 아닌)

**Uniswap V3 NPM MintParams:**
```solidity
struct MintParams { ..., uint24 fee, ... }
```

**Aerodrome Slipstream NPM MintParams:**
```solidity
struct MintParams { ..., int24 tickSpacing, ..., uint160 sqrtPriceX96 }
```

- `sqrtPriceX96 = 0` → 기존 풀 사용 (풀 생성 안 함)
- `sqrtPriceX96 > 0` → 새 풀 생성 시도
- **Function selector가 다름!** `0x88316456` (Uni V3) vs `0xb5007d1f` (Aero)

---

### Finding #7: Ramses x(3,3) — 자동 스테이킹 모델

**Ramses는 gauge deposit 불필요.** LP 포지션 보유 자체가 스테이킹으로 인식되어 RAM emission을 자동 수령. `gaugeForPool()` → zero address가 정상.

---

### Finding #8: Aerodrome CL Gauge — earned(address, uint256)

**Aerodrome CL gauge의 `earned()` 시그니처:**
```solidity
// ❌ Solidly V2 style
function earned(address account) returns (uint256)

// ✅ Aerodrome CL gauge (NFT-based)
function earned(address account, uint256 tokenId) returns (uint256)
```

CL 포지션은 NFT이므로 tokenId가 필요.

---

### Finding #9: Aave V2 vs V3 getReserveData 차이

**V3 (15 fields):** `configuration, liquidityIndex, currentLiquidityRate, variableBorrowIndex, currentVariableBorrowRate, ...`
- Rate indices: [2], [4], [5]
- aToken: [8], variableDebtToken: [10]

**V2 (12 fields):** `configuration, liquidityIndex, variableBorrowIndex, currentLiquidityRate, currentVariableBorrowRate, ...`
- Rate indices: [3], [4], [5]
- aToken: [7], variableDebtToken: [9]

**주의:** PrimeFi는 V3 pool 주소이지만 V2 ABI를 사용. interface를 `aave_v2`로 설정해야 함.

---

### Finding #10: BigInt JSON 직렬화

**문제:** `JSON.stringify()`에서 BigInt는 직렬화 불가. 커스텀 replacer 필요.

```typescript
// ❌ hex string (읽기 어려움)
"amount_out": "0xa78d13f"

// ✅ decimal string
"amount_out": "717676182"
```

---

### Finding #11: Base Public RPC Rate Limiting

**`https://mainnet.base.org`** — 429 에러 빈번 (연속 5+ call 시)
**해결:** `https://base.drpc.org` 또는 `https://base-rpc.publicnode.com` 사용

---

### Finding #12: USDC storage slot (Anvil fork에서 밸런스 세팅)

| Chain | USDC Contract | balanceOf slot |
|-------|--------------|----------------|
| Mantle | 0x09Bc...0dF9 | **9** |
| HyperEVM | 0xb883...630f | **9** |
| Base | - | whale impersonate 사용 |

```bash
STORAGE_KEY=$(cast index address $WALLET 9)
cast rpc anvil_setStorageAt $USDC $STORAGE_KEY 0x...amount --rpc-url $RPC
```

---

## Gas Costs (실측)

| Chain | Gas Price | Tx당 비용 | 10 tx |
|-------|-----------|----------|-------|
| Mantle | 0.02 Gwei | $0.000003 | $0.00003 |
| Base | 0.006 Gwei | $0.003 | $0.03 |
| HyperEVM | 0.1 Gwei | $0.0004 | $0.004 |

**3개 체인 전체 테스트 가스비: ~$0.04**

---

## Protocol-Specific Notes

### Merchant Moe
- `addLiquidityNATIVE()` (Trader Joe 포크, `addLiquidityETH` 아닌)
- `wNative()` 있음, `WETH()` 없음
- MasterChef `getNumberOfFarms()` = 0 (farming 비활성)
- LB Rewarder: hooks 패턴 (`getLBHooksParameters()` → rewarder address)
- LB emission pool: USDC/USDT0 binStep=1, REWARDS 태그

### Cleopatra (Mantle)
- Solidly V1 ABI (factory 없는 Route struct)
- Gauge deposit: 비표준 인터페이스 (deposit(uint256), deposit(uint256,uint256), depositAll() 전부 revert)
- LP 토큰은 정상 수령됨

### Aerodrome (Base)
- Solidly V2 ABI (factory 포함 Route struct)
- Slipstream CL: tickSpacing 기반 MintParams
- CL Gauge: NFT deposit, `earned(address, tokenId)`
- archive RPC 필요 시 `https://base-rpc.publicnode.com` 사용

### Ramses (HyperEVM)
- x(3,3) 모델: LP = 자동 스테이킹, gauge deposit 불필요
- V2: Solidly V2 ABI
- CL: V3 fork이지만 quoter 시그니처가 다름 (tickSpacing 기반?)
- WHYPE/USDC V2 pair 유동성 거의 0

### KittenSwap / Hybra (HyperEVM)
- Algebra protocol (Uniswap V3 아닌)
- `globalState()` 사용 (`slot0()` 아닌)
- NPM 공유 (`0xcc9E...2568`) — 두 프로토콜이 같은 NPM 사용
- KittenSwap factory: `0x5f95...61A7`, Hybra factory: `0x32b9...1c2`
- WHYPE/USDC pool: KittenSwap만 존재, Hybra 없음
