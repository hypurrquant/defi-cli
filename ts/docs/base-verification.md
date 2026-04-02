# Base Chain Contract Verification Report

Generated: 2026-04-03
Method: On-chain `cast call` against Base mainnet (RPC: https://mainnet.base.org)
Scope: All protocols in `config/protocols/**/*base*` + `base.yaml` fixture

---

## Summary

| Category | Total | PASS | FAIL | Fixed |
|----------|-------|------|------|-------|
| DEX      | 11    | 9    | 0    | 2     |
| Lending  | 8     | 6    | 2    | 0     |
| Vault    | 5     | 3    | 1    | 0     |
| Bridge   | 3     | 3    | 0    | 0     |
| **Total**| **27**| **21**| **3**| **2** |

- **Fixed**: Wrong address corrected (still functional)
- **FAIL**: Marked `verified = false` in config (fail-closed)

---

## DEX Protocols

### Aerodrome V2 ✅
- Router `0xcF77a3Ba...`: `defaultFactory()` → 0x420D... ✓
- Factory `0x420DD381...`: `allPoolsLength()` → 20,206 pools ✓
- Voter `0x16613524...`: `governor()` → valid ✓

### Aerodrome Slipstream ✅ (FIXED)
- Router `0xBe6D8f0d...`: `factory()` → 0x5e7BB... ✓
- **Factory FIXED**: `0xeC8E5342...` → `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A`
  - Old address: owner() reverts, not the CL factory
  - New address: `allPoolsLength()` → 3,274 pools ✓
- Quoter `0x254cF9E1...`: `factory()` → 0x5e7BB... ✓

### Uniswap V2 ✅
- Router `0x4752ba5d...`: `factory()` + `WETH()` → valid ✓
- Factory `0x8909Dc15...`: `allPairsLength()` → 2,970,607 ✓

### Uniswap V3 ✅
- Router `0x26266646...`: `factory()` → 0x33128... ✓
- Factory `0x33128a8f...`: `owner()` → valid ✓
- Quoter `0x3d4e44Eb...`: `factory()` → 0x33128... ✓

### PancakeSwap V3 ✅ (FIXED)
- Router `0x678Aa4bF...`: `factory()` → 0x0BFb... ✓
- Factory `0x0BFbCF9f...`: `owner()` → valid ✓
- **Quoter FIXED**: `0x3d146FcE...` → `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`
  - Old address: NO BYTECODE
  - New address: `factory()` → 0x0BFb... (matches PCS factory) ✓

### SushiSwap V2 ✅
- Router `0x6BDED42c...`: `factory()` + `WETH()` → valid ✓
- Factory `0x71524B4f...`: `allPairsLength()` → 5,961 ✓

### AlienBase V3 ✅
- Router `0xB20C411F...`: `factory()` → 0x0Fd8... ✓
- Factory `0x0Fd83557...`: `owner()` → valid ✓

### QuickSwap V4 (Algebra) ✅
- Router `0xe6c9bb24...`: `factory()` → 0xC539... ✓
- Factory `0xC5396866...`: `poolDeployer()` → valid ✓
- Quoter `0x23E0583a...`: `factory()` → 0xC539... ✓

### Balancer V3 ✅
- Vault `0xbA133333...`: `getAuthorizer()` → valid ✓
- Router `0x3f170631...`: bytecode exists (44,806 chars), getVault()/vault() revert (V3 uses different pattern) — vault is the primary contract ✓

### Curve ✅
- Factory `0xd2002373...`: `pool_count()` → 349 pools ✓
- Router `0x4f37A9d1...`: bytecode exists ✓

### WOOFi ✅
- Router `0x4c4AF8DB...`: `wooPool()` → 0x5520... ✓
- Pool `0x55203856...`: `quoteToken()` → USDC ✓

---

## Lending Protocols

### Aave V3 ✅
- Pool `0xA238Dd80...`: `getReservesList()` → returns asset list ✓
- Oracle `0x2Cc0Fc26...`: `getAssetPrice(USDC)` → ~$1.00 ✓
- PoolAddressesProvider `0xe20fCBdB...`: `getPool()` → 0xA238... ✓
- PoolDataProvider `0x2d8A3C56...`: `getAllReservesTokens()` → returns token list ✓

### Compound V3 ✅
- Comet USDC `0xb125E668...`: `baseToken()` → USDC, `getUtilization()` → 82.6% ✓
- Comet WETH `0x46e6b214...`: `baseToken()` → WETH, `getUtilization()` → 66.7% ✓

### Sonne Finance ✅
- Comptroller `0x1DB2466d...`: `getAllMarkets()` → returns market list ✓
- vUSDC `0xfd68F92B...`: `underlying()` → USDC ✓

### Euler V2 ✅
- EVC `0x5301c7dD...`: bytecode exists (44,102 chars) ✓
- EVault Factory `0x7F321498...`: bytecode exists (11,264 chars) ✓

### Moonwell ✅
- Comptroller `0xfBb21d03...`: `getAllMarkets()` → returns market list ✓
- mUSDC `0xEdc817A2...`: `underlying()` → USDC ✓

### Morpho Blue ✅
- Morpho `0xBBBBBbbB...`: `owner()` → valid ✓

### Seamless ✅
- Pool `0x8F44Fd75...`: `getReservesList()` → returns asset list ✓

### Spark Base ❌ FAIL → `verified = false`
- Pool `0xC13e21B6...`: **NO BYTECODE** — contract does not exist on Base
- Config description notes SLL-only, no standalone pool on Base

### Extra Finance ❌ FAIL → `verified = false`
- LendingPool `0xd9Edc75a...`: 92-byte minimal proxy, `owner()` reverts
- EIP-1967 impl slot is zero — not a valid upgradeable proxy

---

## Vault Protocols

### Beefy ✅
- Vault `0x01793ef2...`: `totalSupply()` + `balance()` → valid ✓

### Fluid ✅
- fUSDC `0xf42f5795...`: `totalAssets()` → $9.5M ✓
- fWETH `0x9272D615...`: `totalAssets()` → 91.8 WETH ✓

### Pendle ✅
- Router `0x88888888...`: `owner()` → valid ✓
- MarketFactory `0x81E80A50...`: bytecode exists ✓

### Yearn V3 ✅
- Vault `0xc3bd0a21...`: `totalAssets()` → $950K ✓

### Maple Finance ❌ FAIL → `verified = false`
- Vault `0x66097573...`: bytecode exists but `asset()`, `totalAssets()`, `convertToAssets()` all revert
- ERC4626 interface not functional

---

## Bridge Protocols

### Across V3 ✅
- SpokePool `0x09aea4b2...`: `numberOfDeposits()` → 5,546,960, `wrappedNativeToken()` → WETH ✓

### Stargate V2 ✅
- Router `0x45f1A95A...`: `owner()` → valid ✓
- USDC Pool `0x27a16dc7...`: `token()` → USDC ✓
- ETH Pool `0xdc181Bd6...`: `token()` → 0x000... (native) ✓

### Wormhole ✅ (partial)
- Token Bridge `0x8d2de8d2...`: `chainId()` → 30 ✓
- Core `0xbebdb6C8...`: `chainId()` → 30 ✓
- NFT Bridge: **removed** — `0xDA3adC66...` has no bytecode on Base

---

## Changes Made

### Address Fixes
1. `config/protocols/dex/aerodrome_cl.toml`: factory → `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A`
2. `config/protocols/dex/pancakeswap_v3_base.toml`: quoter → `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`

### Fail-Closed (verified = false)
3. `config/protocols/lending/spark_base.toml`: `verified = false` — pool has no bytecode
4. `config/protocols/lending/extra_finance_base.toml`: `verified = false` — proxy with no functional calls
5. `config/protocols/vault/maple_base.toml`: `verified = false` — ERC4626 functions revert

### Contract Removal
6. `config/protocols/bridge/wormhole_base.toml`: `nft_bridge` removed (no bytecode)

### Code Changes
7. `ts/packages/defi-core/src/registry/protocol.ts`: added `verified?: boolean` field
8. `ts/packages/defi-core/src/registry/registry.ts`: `getProtocolsForChain()` filters out `verified === false`

### Fixture Updates
9. `ts/test/fixtures/base.yaml`: Aerodrome CL factory + PCS V3 quoter addresses fixed
