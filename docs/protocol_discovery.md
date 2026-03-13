# DeFi Protocol Discovery Report

> Generated 2026-03-13 via DeFiLlama API + Foundry on-chain fork testing (`cast call`)
> Covers 4 chains: Arbitrum, Base, BSC, HyperEVM

## Executive Summary

| Chain | Existing | New Found | Top New by TVL |
|-------|----------|-----------|----------------|
| Arbitrum | 8 protocols | 12 new | GMX V2 ($252M), Fluid ($168M), Pendle ($147M) |
| Base | 7 protocols | 8 new | Morpho Blue ($2.19B), PancakeSwap V3 ($403M), Moonwell ($117M) |
| BSC | 5 protocols | 6 new | Venus ($1.46B), Lista DAO ($1.31B), Thena ($8.6M) |
| HyperEVM | 7 protocols | 6 new | Morpho Blue ($520M), Pendle ($85M), Curve ($619K) |

**Total: 32 new protocols discovered, 27 already supported.**

---

## Interface Reuse Matrix

Protocols grouped by which existing interface they can reuse vs requiring new code:

### Can Reuse Existing Interface (Easy Wins)

| Protocol | Chain(s) | Interface | Effort |
|----------|----------|-----------|--------|
| Seamless | Base | `aave_v3` (identical) | Address-only |
| PancakeSwap V3 | Arbitrum, Base | `uniswap_v3_router` | Address-only |
| Thena FUSION | BSC | `algebra_v3` (same as KittenSwap) | Address-only |
| Radiant V2 | Arbitrum | `aave_v2` (new but similar to V3) | Small adapter |
| SushiSwap V2 | Base | `uniswap_v2` (new interface type) | Small adapter |
| PancakeSwap V2 | BSC | `uniswap_v2` | Small adapter |
| Thena V1 | BSC | `solidly_v2` (same as Aerodrome) | Address-only |
| Ramses V3 | HyperEVM | Near `uniswap_v3` (tickSpacing vs fee) | Small adapter |

### New Interface Required

| Interface Type | Protocols | Chains | Combined TVL |
|----------------|-----------|--------|-------------|
| `compound_v2` | Venus, Moonwell | BSC, Base | $1.58B |
| `compound_v3` | Compound III | Arbitrum, Base | $114M |
| `morpho_blue` | Morpho Blue + MetaMorpho | Base, HyperEVM | $2.71B |
| `curve_stableswap` | Curve | Arbitrum, Base, HyperEVM | $50M+ |
| `pendle_v4` | Pendle | Arbitrum, Base, HyperEVM | $250M |
| `liquidity_book` | Trader Joe V2.1 | Arbitrum | $5M |
| `balancer_v3` | Balancer V3 | Arbitrum, HyperEVM | $13M |
| `lista_dao` | Lista DAO | BSC | $1.31B |
| `woofi` | WOOFi | HyperEVM | $6M |

---

## Per-Chain Details

---

## Arbitrum (Chain ID: 42161)

RPC: `https://arb1.arbitrum.io/rpc`

### Already Supported
uniswap_v3, camelot, gmx_v1, aave_v3, across, lifi, debridge, cctp

### New Protocols

#### 1. PancakeSwap V3 (DEX) -- $93M TVL

**Interface:** `uniswap_v3_router` (existing -- reuse directly)

| Contract | Address | Verified |
|----------|---------|----------|
| SmartRouter | `0x32226588378236Fd0c7c4053999F88aC0e5cAc77` | factory() confirmed |
| V3 Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | owner verified |

**Usage:**
```bash
# Quote: exactInputSingle uses same selector as uniswap_v3_router (0x414bf389)
cast call 0x32226588378236Fd0c7c4053999F88aC0e5cAc77 \
  "factory()(address)" --rpc-url https://arb1.arbitrum.io/rpc
```

---

#### 2. Compound V3 / Comet (Lending) -- $85M TVL

**Interface:** `compound_v3` (NEW)

| Contract | Address | Base Token | Verified |
|----------|---------|------------|----------|
| cUSDCv3 | `0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf` | USDC | totalSupply ~$23M |
| cUSDC.ev3 | `0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA` | USDC.e | confirmed |
| cWETHv3 | `0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486` | WETH | totalSupply ~1337 ETH |

**Key Functions:**
```solidity
supply(address asset, uint256 amount)              // 0xf2b9fdb8
withdraw(address asset, uint256 amount)             // 0xf3fef3a3
baseToken() -> address                              // 0xc55dae63
totalSupply() -> uint256                            // 0x18160ddd
totalBorrow() -> uint256                            // 0x8285ef40
getUtilization() -> uint256                         // 0x7eb71131
getSupplyRate(uint256 utilization) -> uint64         // 0xd955759d
getBorrowRate(uint256 utilization) -> uint64         // 0x9fa83b5a
getAssetInfo(uint8 i) -> AssetInfo                  // 0xc8c7fe6b
numAssets() -> uint8                                // 0xa46fe83b
balanceOf(address) -> uint256                       // 0x70a08231
borrowBalanceOf(address) -> uint256                 // 0x374c49b4
```

**Live Data (USDC Comet):**
- Supply: ~$23M, Borrow: ~$14.2M, Utilization: 61.8%
- Supply APR: ~2.88%, Borrow APR: ~3.72%
- 9 collateral assets: ARB, GMX, WETH, WBTC, wstETH, ezETH, weETH, tBTC, wUSDM

**Quirks:**
- Rates are per-second: APR = rate * 31536000
- `supply()` serves dual purpose: base token = lending, collateral token = posting collateral
- `type(uint256).max` withdraws full balance

```bash
# Verify USDC Comet
cast call 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf \
  "baseToken()(address)" --rpc-url https://arb1.arbitrum.io/rpc
# Result: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (USDC)

cast call 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf \
  "getUtilization()(uint256)" --rpc-url https://arb1.arbitrum.io/rpc
# Result: ~618000000000000000 (61.8%)
```

---

#### 3. Radiant Capital V2 (Lending) -- Aave V2 Fork

**Interface:** `aave_v2` (NEW -- similar to aave_v3 but different struct)

| Contract | Address | Verified |
|----------|---------|----------|
| LendingPool | `0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F` | getReservesList() confirmed |
| DataProvider | `0xa3e42d11d8CC148160CC3ACED757FB44696a9CcA` | getReserveConfigurationData() confirmed |

**Reserves:** WBTC, USDT, USDC.e, DAI, WETH

**Key Functions (same selectors as Aave V2):**
```solidity
deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)   // 0xe8eda9df
withdraw(address asset, uint256 amount, address to)                                // 0x69328dec
borrow(address asset, uint256 amount, uint256 rateMode, uint16 referral, address)  // 0xa415bcad
repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf)         // 0x573ade81
```

**Live Data:** WETH normalizedIncome = 1.032e27 (active yield accrual)

**Quirks:** Uses USDC.e (`0xFF97...`), NOT native USDC. Aave V2 getReserveData returns different struct than V3.

```bash
cast call 0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F \
  "getReservesList()(address[])" --rpc-url https://arb1.arbitrum.io/rpc
```

---

#### 4. Curve Finance (DEX) -- $22M TVL

**Interface:** `curve_stableswap` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| Router NG | `0x2191718CD32d02B8E60BAdFFeA33E4b5DD9A0A0D` | confirmed |
| Registry | `0x445FE580eF8d70FF569aB36e80c647af338db351` | 5 pools |
| AddressProvider | `0x0000000022D53366457F9d5E68Ec105046FC4383` | canonical |

**Pool-level Functions:**
```solidity
// StableSwap pools (int128 indices!)
exchange(int128 i, int128 j, uint256 dx, uint256 min_dy)     // 0x3df02124
get_dy(int128 i, int128 j, uint256 dx) -> uint256             // 0x5e0d443f
coins(uint256) -> address                                      // 0xc6610657
A() -> uint256                                                 // 0xf446c1d0
fee() -> uint256                                               // 0xddca3f43
get_virtual_price() -> uint256                                 // 0xbb7b8b80
```

**Live Quote:**
```bash
# Pool 0 (USDC.e/USDT): 1 USDC.e -> 0.999908 USDT
cast call 0x7f90122BF0700F9E7e1F688fe926940E8839F353 \
  "get_dy(int128,int128,uint256)(uint256)" 0 1 1000000 \
  --rpc-url https://arb1.arbitrum.io/rpc
# Result: 999908
```

**Quirks:**
- Uses `int128` for coin indices (NOT uint256) -- critical for ABI encoding
- Fee denominator is 1e10 (100000 = 0.001% = 1 bps)
- Native ETH represented as `0xEeee...EEeE` sentinel in some pools

---

#### 5. Trader Joe V2.1 / Liquidity Book (DEX) -- $5M TVL

**Interface:** `liquidity_book` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| LBRouter V2.1 | `0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30` | getFactory() confirmed |
| LBFactory | `0x8e42f2F4101563bF679975178e880FD87d3eFd4e` | 533 pairs |

**Key Functions:**
```solidity
swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin,
    Path memory path, address to, uint256 deadline)             // 0x94283a50
getSwapOut(address pair, uint128 amountIn, bool swapForY)
    -> (uint128 amountOut, uint128 fee)                         // 0xa0d376cf
getSwapIn(address pair, uint128 amountOut, bool swapForY)
    -> (uint128 amountIn, uint128 fee)                          // 0x964f987c
```

**Path struct:** `(uint256[] pairBinSteps, uint8[] versions, address[] tokenPath)`
- versions: 0=V1, 1=V2, 2=V2.1

**Live Quote:**
```bash
# WETH/USDC pair (binStep=15): 0.1 WETH -> 209.8 USDC
cast call 0x69f1216cB2905bf0852f74624D5Fa7b5FC4dA710 \
  "getReserves()(uint128,uint128)" --rpc-url https://arb1.arbitrum.io/rpc
```

**Quirks:**
- Multiple pairs per token pair with different `binStep` values (15, 25, 50, 100)
- Uses ERC-1155 for LP tokens (each bin = separate token ID)
- Price from `getPriceFromId` in 128.128 fixed-point: divide by 2^128

---

#### 6. Pendle (Yield Trading) -- $147M TVL

**Interface:** `pendle_v4` (NEW -- Diamond Proxy)

| Contract | Address | Verified |
|----------|---------|----------|
| Router V4 (Diamond) | `0x0000000001E4ef00d069e71d6bA041b0A16F7eA0` | facets confirmed |
| RouterStatic | `0x1Fd95db7B7C0067De8D45C0cb35D59796adfD187` | code confirmed |
| MarketFactory V3 | `0x2FCb47B58350cD377f94d3821e7373Df60bD9Ced` | confirmed |

**Key Functions (Router):**
```solidity
swapExactTokenForPt(...)      // 0xb61ee538
swapExactPtForToken(...)      // 0xe7d96a20
mintSyFromToken(...)          // 0x2e071dc6
redeemSyToToken(...)          // 0x339a5572
addLiquiditySingleToken(...)  // 0xb3ce6a73
removeLiquiditySingleToken(...)// 0x76674782
```

**Market Interface:**
```solidity
readTokens() -> (SY, PT, YT)
expiry() -> uint256
isExpired() -> bool
```

**Quirks:**
- Markets have expiration dates
- Complex nested structs for `ApproxParams`, `TokenInput`/`TokenOutput`
- Active market discovery via events or Pendle API (no on-chain enumeration)

---

#### 7. Silo Finance V1 (Lending) -- $18M TVL

**Interface:** `silo_v1` (NEW -- isolated lending)

| Contract | Address | Verified |
|----------|---------|----------|
| Repository | `0x8658047e48CC09161f4152c79155Dac1d710Ff0a` | getSilo() confirmed |
| Router | `0x9992f660137979C1ca7f8b119Cd16361594E3681` | confirmed |
| ARB Silo | `0x0696E6808EE11a5750733a3d821F9bB847E584FB` | assetStorage() confirmed |

**Per-Silo Functions:**
```solidity
deposit(address asset, uint256 amount, bool collateralOnly)   // 0x3edd1128
withdraw(address asset, uint256 amount, bool collateralOnly)  // 0xead5d359
borrow(address asset, uint256 amount)                          // 0x4b8a3529
repay(address asset, uint256 amount)                           // 0x22867d78
flashLoan(address receiver, address token, uint256 amount, bytes data) // 0x5cffe9de
```

**Quirks:** Each asset has its own Silo contract. Bridge assets (WETH, USDC.e) shared across silos.

---

#### 8. Other Arbitrum Protocols

| Protocol | TVL | Interface | Notes |
|----------|-----|-----------|-------|
| GMX V2 | $252M | Custom (Synthetics) | Complex multi-step order system |
| Fluid | $168M | Custom (Instadapp) | Vault factories + liquidity proxy |
| Balancer V2/V3 | $11M | Vault-based | Multi-asset weighted pools |
| Dolomite | $32M | dYdX-style margin | Custom interface |
| Stargate V2 | $14M | LayerZero OFT | Cross-chain bridge |

---

## Base (Chain ID: 8453)

RPC: `https://mainnet.base.org`

### Already Supported
uniswap_v3, aerodrome, aave_v3, across, lifi, debridge, cctp

### New Protocols

#### 1. Morpho Blue (Lending) -- $2.19B TVL (LARGEST ON BASE)

**Interface:** `morpho_blue` (NEW -- singleton pattern)

| Contract | Address | Verified |
|----------|---------|----------|
| Morpho Blue Core | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | owner() confirmed |
| Bundler | `0x23055618898e202386e6c13955a58D3C68200BFB` | confirmed |

**MetaMorpho Vaults (ERC-4626):**
| Name | Address | Asset | AUM |
|------|---------|-------|-----|
| Moonwell Flagship USDC | `0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca` | USDC | ~$12.3M |
| Moonwell Flagship ETH | `0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1` | WETH | ~4732 ETH |

**MarketParams struct:**
```solidity
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}
```

**Key Functions (Core):**
```solidity
supply(MarketParams, uint256 assets, uint256 shares, address onBehalf, bytes data)  // 0xa99aad89
borrow(MarketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) // 0x50d8cd4b
withdraw(MarketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) // 0x5c2bea49
repay(MarketParams, uint256 assets, uint256 shares, address onBehalf, bytes data)   // 0x20b76e81
supplyCollateral(MarketParams, uint256 assets, address onBehalf, bytes data)         // 0x238d6579
withdrawCollateral(MarketParams, uint256 assets, address onBehalf, address receiver) // 0x8720316d
flashLoan(address token, uint256 assets, bytes data)                                 // 0xe0232b42
idToMarketParams(bytes32 id) -> MarketParams                                         // 0x2c3c9157
```

**Quirks:**
- Markets identified by `bytes32` ID = keccak256(abi.encode(MarketParams))
- Supply/borrow: specify EITHER assets OR shares (one must be 0)
- MetaMorpho vaults are standard ERC-4626: `deposit()`, `withdraw()`, `redeem()`
- GraphQL API: `https://blue-api.morpho.org/graphql`

```bash
# Verify Morpho Blue
cast call 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb \
  "owner()(address)" --rpc-url https://mainnet.base.org
# Result: 0xcBa28b38103307Ec8dA98377ffF9816C164f9AFa
```

---

#### 2. PancakeSwap V3 (DEX) -- $403M TVL

**Interface:** `uniswap_v3_router` (existing -- reuse)

| Contract | Address | Verified |
|----------|---------|----------|
| SmartRouter | `0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86` | code confirmed (24316 bytes) |

---

#### 3. Moonwell (Lending) -- $117M TVL

**Interface:** `compound_v2` (NEW -- timestamp variant)

| Contract | Address | Verified |
|----------|---------|----------|
| Comptroller | `0xfBb21d0380beE3312B33c4353c8936a0F13EF26C` | getAllMarkets() = 20 markets |
| mUSDC | `0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22` | name = "Moonwell USDC" |
| mWETH | `0x628ff693426583D9a7FB391E54366292F509D457` | name = "Moonwell WETH" |
| mcbETH | `0x3bf93770f2d4a794c3d9EBEfBAeBAE2a8f09A5E5` | name = "Moonwell cbETH" |
| mwstETH | `0x627Fe393Bc6EdDA28e99AE648fD6fF362514304b` | name = "Moonwell wstETH" |
| mAERO | `0x73902f619CEB9B31FD8EFecf435CbDf89E369Ba6` | name = "Moonwell AERO" |
| mDAI | `0x73b06D8d18De422E269645eaCe15400DE7462417` | confirmed |
| WETH Router | `0x70778cfcFC475c7eA0f24cC625Baf6EaE475D0c9` | wraps ETH->mint |

**Key Functions (mToken):**
```solidity
mint(uint256 mintAmount) -> uint256                    // 0xa0712d68
redeem(uint256 redeemTokens) -> uint256                // 0xdb006a75
redeemUnderlying(uint256 redeemAmount) -> uint256      // 0x852a12e3
borrow(uint256 borrowAmount) -> uint256                // 0xc5ebeaec
repayBorrow(uint256 repayAmount) -> uint256            // 0x0e752702
supplyRatePerTimestamp() -> uint256                    // 0xd3bd2c72  *** NOT supplyRatePerBlock!
borrowRatePerTimestamp() -> uint256                    // 0xcd91801c
exchangeRateCurrent() -> uint256                       // 0xbd6d894d
underlying() -> address                                // 0x6f307dc3
```

**Key Functions (Comptroller):**
```solidity
enterMarkets(address[] cTokens) -> uint256[]           // 0xc2998238
exitMarket(address cToken) -> uint256                  // 0xede4edd0
getAllMarkets() -> address[]                            // 0xb0772d0b
getAccountLiquidity(address) -> (uint256, uint256, uint256) // 0x5ec88c79
```

**CRITICAL:** Uses `supplyRatePerTimestamp()` / `borrowRatePerTimestamp()` (NOT `perBlock`).
APY = (1 + rate/1e18)^(365*86400) - 1

```bash
# Get all markets
cast call 0xfBb21d0380beE3312B33c4353c8936a0F13EF26C \
  "getAllMarkets()(address[])" --rpc-url https://mainnet.base.org
```

---

#### 4. Seamless Protocol (Lending) -- $28M TVL

**Interface:** `aave_v3` (EXISTING -- identical interface, address-only change)

| Contract | Address | Verified |
|----------|---------|----------|
| Pool | `0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7` | getReservesList() = 18 tokens |
| PoolAddressesProvider | `0x0E02EB705be325407707662C6f6d3466E939f3a0` | owner confirmed |
| Oracle | `0xFDd4e83890BCcd1fbF9b10d71a5cc0a738753b01` | confirmed |
| DataProvider | `0x2A0979257105834789bC6b9E1B00446DFbA8dFBa` | confirmed |

**18 Reserves:** USDbC, WETH, cbETH, USDC, DAI, wstETH, SEAM, DEGEN, AERO, cbBTC, EURC, weETH, + ILM tokens

```bash
# Exact same interface as Aave V3
cast call 0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7 \
  "getReservesList()(address[])" --rpc-url https://mainnet.base.org
```

---

#### 5. Compound V3 / Comet (Lending) -- $29M TVL

**Interface:** `compound_v3` (NEW -- same as Arbitrum Comet)

| Contract | Address | Base Token | Verified |
|----------|---------|------------|----------|
| cUSDCv3 | `0xb125E6687d4313864e53df431d5425969c15Eb2F` | USDC | ~$10.9M supply |
| cWETHv3 | `0x46e6b214b524310239732D51387075E0e70970bf` | WETH | ~2233 ETH |
| cUSDbCv3 | `0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf` | USDbC | ~$80M |
| cAEROv3 | `0x784efeB622244d2348d4F2522f8860B96fbEcE89` | AERO | ~3.16M AERO |

---

#### 6. SushiSwap V2 (DEX)

**Interface:** `uniswap_v2` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| Router | `0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891` | factory() confirmed |
| Factory | `0x71524B4f93c58fcbF659783284E38825f0622859` | 5955 pairs |

**Key Functions:**
```solidity
swapExactTokensForTokens(uint256, uint256, address[], address, uint256)  // 0x38ed1739
getAmountsOut(uint256, address[]) -> uint256[]                           // 0xd06ca61f
factory() -> address                                                      // 0xc45a0155
WETH() -> address                                                         // 0xad5c4648
```

```bash
# Quote 1 WETH -> USDC
cast call 0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891 \
  "getAmountsOut(uint256,address[])(uint256[])" 1000000000000000000 \
  "[0x4200000000000000000000000000000000000006,0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913]" \
  --rpc-url https://mainnet.base.org
```

---

#### 7. Curve Finance (DEX) -- $28M TVL

**Interface:** `curve_stableswap` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| StableSwap Factory | `0x3093f9B57A428F3EB6285a589cb35bEA6e78c336` | 15 pools |
| CryptoSwap Factory | `0xd2002373543Ce3527023C75e7518C274A51ce712` | 346 pools |
| Router | `0x4f37A9d177470499A2dD084621020b023fcffc1F` | confirmed |

**Largest pool:** USDC/USDbC at `0xf6C5F01C7F3148891ad0e19DF78743D31E390D1f` (~$108M TVL)

**IMPORTANT:** StableSwap uses `int128` indices, CryptoSwap uses `uint256` indices -- different selectors!

---

## BSC (Chain ID: 56)

RPC: `https://bsc-dataseed.binance.org`

> **CRITICAL: BSC USDC/USDT use 18 decimals (not 6!)**

### Already Supported
pancakeswap_v3, aave_v3, across, lifi, debridge

### New Protocols

#### 1. Venus Protocol (Lending) -- $1.46B TVL

**Interface:** `compound_v2` (NEW -- cToken/vToken model)

| Contract | Address | Verified |
|----------|---------|----------|
| Comptroller (Diamond) | `0xfD36E2c2a6789Db23113685031d7F16329158384` | 48 markets |
| Oracle | `0x6592b5DE802159F3E74B2486b091D11a8256ab8A` | prices confirmed |
| vUSDC | `0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8` | supply rate confirmed |
| vUSDT | `0xfD5840Cd36d94D7229439859C0112a4185BC0255` | supply rate confirmed |
| vBNB | `0xA07c5b74C9B40447a954e1466938b865b6BBea36` | native BNB market |
| vBTC | `0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B` | confirmed |
| vETH | `0xf508fCD89b8bd15579dc79A6827cB4686A3592c8` | confirmed |
| vDAI | `0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1` | confirmed |
| vBUSD | `0x95c78222B3D6e262426483D42CfA53685A67Ab9D` | confirmed |

**Key Functions (vToken):**
```solidity
mint(uint256 mintAmount) -> uint256                // 0xa0712d68
mint()                                             // 0x1249c58b  (native BNB, payable)
redeem(uint256 redeemTokens) -> uint256            // 0xdb006a75
redeemUnderlying(uint256 redeemAmount) -> uint256  // 0x852a12e3
borrow(uint256 borrowAmount) -> uint256            // 0xc5ebeaec
repayBorrow(uint256 repayAmount) -> uint256        // 0x0e752702
supplyRatePerBlock() -> uint256                    // 0xae9d70b0
borrowRatePerBlock() -> uint256                    // 0xf8f9da28
exchangeRateStored() -> uint256                    // 0x182df0f5
underlying() -> address                            // 0x6f307dc3
```

**Live Data:**
- vUSDC: Supply APR 0.47%, Borrow APR 0.71%, Collateral Factor 82.5%
- Oracle: BNB=$659.60, BTC=$71,119.56
- BSC blocks ~3s: `blocksPerYear = 10,512,000`, APR = ratePerBlock * 10512000 / 1e18

```bash
# Get all Venus markets
cast call 0xfD36E2c2a6789Db23113685031d7F16329158384 \
  "getAllMarkets()(address[])" --rpc-url https://bsc-dataseed.binance.org

# Get supply rate
cast call 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8 \
  "supplyRatePerBlock()(uint256)" --rpc-url https://bsc-dataseed.binance.org
```

---

#### 2. Lista DAO (CDP) -- $1.31B TVL

**Interface:** `lista_dao` (NEW -- MakerDAO Vat/Interaction pattern)

| Contract | Address | Verified |
|----------|---------|----------|
| Interaction (user-facing) | `0xB68443Ee3e828baD1526b3e0Bdf2Dfc6b1975ec4` | vat() confirmed |
| Vat | `0x33A34eAB3ee892D40420507B820347b1cA2201c4` | confirmed |
| Dog (liquidation) | `0xd57E7b53a1572d27A04d9c1De2c4D423f1926d0B` | confirmed |
| Jug (stability fee) | `0x787BdEaa29A253e40feB35026c3d05C18CbCA7B3` | confirmed |
| lisUSD | `0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5` | 76.3M supply |
| slisBNB | `0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B` | "Staked Lista BNB" |

**Key Functions (Interaction):**
```solidity
deposit(address collateral, uint256 amount)    // 0x47e7ef24
borrow(address collateral, uint256 amount)     // 0x4b8a3529
withdraw(address collateral, uint256 amount)   // 0xf3fef3a3
payback(address collateral, uint256 amount)    // 0x35ed8ab8
```

**Quirks:** Vat debt uses RAD precision (45 decimals). `hay()` returns lisUSD address (legacy naming).

```bash
# Check lisUSD total supply
cast call 0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5 \
  "totalSupply()(uint256)" --rpc-url https://bsc-dataseed.binance.org
```

---

#### 3. Thena (DEX) -- $8.6M TVL

**Dual AMM: Solidly V1 + Algebra V3 (FUSION)**

| Contract | Address | Verified |
|----------|---------|----------|
| V1 Router (Solidly) | `0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109` | factory() confirmed, 736 pairs |
| V1 Factory | `0xAFD89d21BdB66d00817d4153E055830B1c2B3970` | confirmed |
| FUSION Router (Algebra) | `0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0` | factory() confirmed |
| FUSION Factory | `0x306F06C147f064A010530292A1EB6737c3e378e4` | confirmed |
| THE Token | `0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11` | confirmed |

**V1 (Solidly):** Uses existing `solidly_v2` interface (same as Aerodrome)
**FUSION:** Uses existing `algebra_v3` interface (same as KittenSwap/Camelot)

**Live Data:** WBNB/USDT pool price: 1 WBNB = ~660.19 USDT

---

#### 4. PancakeSwap V2 (DEX)

**Interface:** `uniswap_v2` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| Router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` | 2.4M pairs |
| Factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` | confirmed |

```bash
# Quote 1 BNB -> USDT
cast call 0x10ED43C718714eb63d5aA57B78B54704E256024E \
  "getAmountsOut(uint256,address[])(uint256[])" 1000000000000000000 \
  "[0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c,0x55d398326f99059fF775485246999027B3197955]" \
  --rpc-url https://bsc-dataseed.binance.org
# Result: ~659.15 USDT (18 decimals!)
```

---

#### 5. Alpaca Finance (Leveraged Yield)

**Interface:** Custom (ibToken vaults)

| Contract | Address | Verified |
|----------|---------|----------|
| ibBNB Vault | `0xd7D069493685A581d27824Fc46EdA46B7EfC0063` | 18333 BNB total |
| ibUSDT Vault | `0x158Da805682BdC8ee32d52833aD41E74bb951E59` | confirmed |

**Functions:** `deposit(uint256)` / `withdraw(uint256)` / `totalToken()` / `vaultDebtVal()`

---

#### 6. Wombat Exchange (StableSwap) -- Low TVL

| Contract | Address | Verified |
|----------|---------|----------|
| Pool | `0x312Bc7eAAF93f1C60Dc5AfC115FcCDE161055fb0` | 1 USDC -> 0.9998 USDT |

**Functions:** `swap(from, to, amount, minOut, to, deadline)` / `quotePotentialSwap(from, to, int256 amount)`

---

## HyperEVM (Chain ID: 999)

RPC: `https://rpc.hyperliquid.xyz/evm`

### Already Supported
hyperswap, kittenswap, projectx, nest, hyperlend, hypurrfi, felix

### New Protocols

#### 1. Morpho Blue (Lending) -- $520M TVL

**Interface:** `morpho_blue` (NEW -- same as Base deployment)

| Contract | Address | Verified |
|----------|---------|----------|
| Morpho Blue Core | `0x68e37dE8d93d3496ae143F2E900490f6280C57cD` | owner() confirmed |

**MetaMorpho Vaults (ERC-4626):**
| Name | Symbol | Address | Asset | AUM |
|------|--------|---------|-------|-----|
| Steakhouse USDC | bbqUSDC | `0xca2fC88299Ee850A2deeA0C5661061179cdFDb85` | USDC | verified |
| Steakhouse USDT0 | bbqUSDT0 | `0xb000842926737241C903EbD49FbE3AbA37E879b7` | USDT0 | verified |
| Felix feHYPE | feHYPE | `0x2900ABd73631b2f60747e687095537B673c06A76` | WHYPE | $54M |
| Felix feUSDC | feUSDC | `0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27` | USDC | $27.6M |
| Felix feUSDT0 | feUSDT0 | `0xFc5126377F0efc0041C0969Ef9BA903Ce67d151e` | USDT0 | $12M |

**Note:** Felix vaults (feHYPE, feUSDC, etc.) are actually MetaMorpho vaults on top of Morpho Blue!

```bash
# Verify Morpho Blue
cast call 0x68e37dE8d93d3496ae143F2E900490f6280C57cD \
  "owner()(address)" --rpc-url https://rpc.hyperliquid.xyz/evm
```

---

#### 2. Pendle (Yield Trading) -- $85M TVL, 42 Markets

**Interface:** `pendle_v4` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| Router V4 | `0x888888888889758F76e7103c6CbF23ABbF58F946` | proxy confirmed |
| RouterStatic | `0x6813d43782395A1F2AAb42f39aeEDE03ac655e09` | confirmed |
| Market Factory V6 | `0xB5CD902CbEF8461b8d6fa852f93784F090fd7BEb` | treasury() confirmed |
| PENDLE Token | `0xD6Eb81136884713E843936843E286FD2a85A205A` | name = "Pendle" |

**Active Markets:** PT-kHYPE, PT-vkHYPE, PT-beHYPE, PT-stHYPE, PT-LHYPE, PT-xHYPE, PT-hwHYPE, PT-HLPE

---

#### 3. Ramses V3 (DEX) -- $3M TVL

**Interface:** Near `uniswap_v3` but uses `tickSpacing` instead of `fee`

| Contract | Address | Verified |
|----------|---------|----------|
| V3 Factory | `0x07E60782535752be279929e2DFfDd136Db2e6b45` | confirmed |
| SwapRouter | `0x76D91074B46fF76E04FE59a90526a40009943fd2` | WETH9 = WHYPE |
| QuoterV2 | `0x403Bf94fe505cA0F0b1563C350B57dCeC8303ECd` | confirmed |
| V2 Factory | `0xd0a07E160511c40ccD5340e94660E9C9c01b0D27` | confirmed |
| V2 Router | `0xdcC44285fBc236457A5cd91C2f77AD8421B0D8ED` | confirmed |
| RAM Token | `0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555` | name = "Ramses" |

**CRITICAL difference:** `exactInputSingle` uses `int24 tickSpacing` instead of `uint24 fee`
- Selector: `0xa026383e` (NOT the standard Uniswap `0x414bf389`)

**Live Quote:**
```bash
# kHYPE -> WHYPE: 1 kHYPE = 1.013 WHYPE
cast call 0x403Bf94fe505cA0F0b1563C350B57dCeC8303ECd \
  "quoteExactInputSingle((address,address,uint256,int24,uint160))(uint256,uint160,uint32,uint256)" \
  "(0xfD739d4e423301CE9385c1fb8850539D657C296D,0x5555555555555555555555555555555555555555,1000000000000000000,1,0)" \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

---

#### 4. Curve StableSwap NG (DEX) -- 54 Pools

**Interface:** `curve_stableswap` (NEW)

| Contract | Address | Verified |
|----------|---------|----------|
| Factory | `0x5eeE3091f747E60a045a2E715a4c71e600e31F6E` | pool_count() = 54 |

**Pool Functions:**
```solidity
exchange(int128 i, int128 j, uint256 dx, uint256 min_dy)  // 0x3df02124
get_dy(int128 i, int128 j, uint256 dx) -> uint256          // 0x5e0d443f
coins(uint256) -> address                                    // 0xc6610657
```

**Live Quote:**
```bash
# 1 WHYPE -> 0.966 hwHYPE (WHYPE/hwHYPE pool)
cast call 0x0934277DC20E7C0f70fF07a03d0da54bA3817F82 \
  "get_dy(int128,int128,uint256)(uint256)" 0 1 1000000000000000000 \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

---

#### 5. Balancer V3 (DEX) -- $1.5M TVL

| Contract | Address | Verified |
|----------|---------|----------|
| Vault | `0xbA1333333333a1BA1108E8412f11850A5C319bA9` | 49K bytes code |
| Router | `0xA8920455934Da4D853faac1f94Fe7bEf72943eF1` | 44K bytes code |
| WeightedPoolFactory | `0x6eE18fbb1BBcC5CF700cD75ea1aef2bb21e3cB3F` | confirmed |
| StablePoolFactory | `0xb96524227c4B5Ab908FC3d42005FE3B07abA40E9` | confirmed |

---

#### 6. WOOFi (DEX) -- $6M TVL

**Interface:** `woofi` (NEW -- PMM-based)

| Contract | Address | Verified |
|----------|---------|----------|
| WooRouterV2 | `0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7` | wooPool() confirmed |
| WooPool | `0x5520385bFcf07Ec87C4c53A7d8d65595Dff69FA4` | quoteToken = USDT0 |

**Key Functions:**
```solidity
querySwap(address fromToken, address toToken, uint256 fromAmount) -> uint256  // quote
swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address to, address rebateTo) // swap
```

```bash
# 1 WHYPE -> ~$38.07 USDT0
cast call 0x4c4AF8DBc524681930a27b2F1Af5bcC8062E6fB7 \
  "querySwap(address,address,uint256)(uint256)" \
  0x5555555555555555555555555555555555555555 \
  0x4B17C4cf26D4A97B3085d8b0E45e9A5A68dA9FCC \
  1000000000000000000 \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

---

#### New HyperEVM Tokens to Add

| Token | Symbol | Address | Decimals |
|-------|--------|---------|----------|
| Kinetiq Staked HYPE | kHYPE | `0xfD739d4e423301CE9385c1fb8850539D657C296D` | 18 |
| Wrapped staked HYPE | wstHYPE | `0x94e8396e0869c9F2200760aF0621aFd240E1CF38` | 18 |
| Hyperbeat Ultra HYPE | hbHYPE | `0x96C6cBB6251Ee1c257b2162ca0f39AA5Fa44B1FB` | 18 |
| Ramses | RAM | `0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555` | 18 |
| Pendle | PENDLE | `0xD6Eb81136884713E843936843E286FD2a85A205A` | 18 |
| Ethena USDe | USDe | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` | 18 |

---

## Integration Priority Ranking

### Tier 1: Address-Only Changes (Immediate)

| # | Protocol | Chain(s) | Reuse Interface | TVL |
|---|----------|----------|-----------------|-----|
| 1 | Seamless | Base | `aave_v3` | $28M |
| 2 | PancakeSwap V3 | Arbitrum, Base | `uniswap_v3_router` | $496M |
| 3 | Thena V1 (Solidly) | BSC | `solidly_v2` | $8.6M |
| 4 | Thena FUSION | BSC | `algebra_v3` | included |

### Tier 2: New Interface, High TVL

| # | Protocol | Chain(s) | New Interface | Combined TVL |
|---|----------|----------|---------------|-------------|
| 5 | Venus + Moonwell | BSC, Base | `compound_v2` | $1.58B |
| 6 | Morpho Blue | Base, HyperEVM | `morpho_blue` | $2.71B |
| 7 | Compound V3 | Arbitrum, Base | `compound_v3` | $114M |
| 8 | Uniswap V2 / Sushi / PCS V2 | Base, BSC | `uniswap_v2` | massive |

### Tier 3: New Interface, Specialized

| # | Protocol | Chain(s) | New Interface | Combined TVL |
|---|----------|----------|---------------|-------------|
| 9 | Curve | ARB, Base, HyperEVM | `curve_stableswap` | $50M+ |
| 10 | Pendle | ARB, Base, HyperEVM | `pendle_v4` | $250M |
| 11 | Lista DAO | BSC | `lista_dao` | $1.31B |
| 12 | Ramses V3 | HyperEVM | `ramses_v3` | $3M |

### Tier 4: Lower Priority

| # | Protocol | Chain(s) | Notes |
|---|----------|----------|-------|
| 13 | Trader Joe V2.1 | Arbitrum | Unique bin-based AMM |
| 14 | Silo Finance | Arbitrum | Isolated lending markets |
| 15 | Balancer V3 | ARB, HyperEVM | Weighted pools |
| 16 | WOOFi | HyperEVM | PMM-based DEX |
| 17 | Alpaca Finance | BSC | Leveraged yield farming |
| 18 | Radiant V2 | Arbitrum | Aave V2 fork |

### Skip (Dead/Low TVL)

| Protocol | Chain | Reason |
|----------|-------|--------|
| Radiant V2 | BSC | Exploited, all calls revert |
| Ellipsis | BSC | $147K TVL, declining |
| Wombat | BSC | $48K TVL, declining |
| Extra Finance | Base | Not found on Base |
| Euler V2 | HyperEVM | Not deployed |
| TimeSwap | HyperEVM | $320 TVL |
