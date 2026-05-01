# Ethereum Chain Contract Verification Report

Generated: 2026-04-28
Method: On-chain `cast call` against Ethereum mainnet (RPC: https://eth.drpc.org)
Scope: All Ethereum protocols added in 2026-04 round

---

## Summary

| Category | Total | PASS | FAIL | Fixed |
|----------|-------|------|------|-------|
| DEX      | 2     | 2    | 0    | 1     |
| Lending  | 4     | 4    | 0    | 0     |
| **Total**| **6** | **6**| **0**| **1** |

- **Fixed**: Wrong address corrected (still functional)
- All other contracts verified directly. Zero failures.

---

## DEX Protocols

### Uniswap V3 Ethereum ✅

- Factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`: `owner()` → `0xf2371551Fe3937Db7c750f4DfABe5c2fFFdcBf5A` (Uniswap governance) ✓
- NPM `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`: `factory()` → `0x1F98431c...` (matches) ✓
- NPM: `WETH9()` → `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` (matches Ethereum WETH) ✓
- Router (SwapRouter02) `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` ✓
- Quoter (V2) `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` ✓

### Uniswap V2 Ethereum ✅ (FIXED)

- **Factory FIXED**: `0x5C69bE47C7765D9d710aD8E14Ae3D2D38e75B0F1` → `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f`
  - Original (V1) address has no bytecode on mainnet
  - V2 deployment confirmed via `router.factory()` call: `allPairsLength()` → 498,572 pairs ✓
- Router (V2) `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` ✓

---

## Lending Protocols

### Aave V3 Ethereum ✅

- Pool `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`: `getReservesList()` → 66 reserves ✓
- PoolAddressesProvider `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e`: `getPool()` → `0x87870Bca...` (matches pool) ✓
- Oracle `0x54586bE62E3c3580375aE3723C145253060Ca0C2` ✓
- PoolDataProvider `0x41393e5e337606dc3821075Af65AeE84D7688CBD` ✓

### Aave V2 Ethereum ✅ (legacy)

- Pool `0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9`: `getReservesList()` → 37 reserves ✓
- PoolAddressesProvider `0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5` ✓
- Oracle `0xA50ba011c48153De246E5192C8f9258A2ba79Ca9` ✓
- ProtocolDataProvider `0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d` ✓

### Compound V3 Ethereum ✅ (4 markets)

- cUSDCv3 `0xc3d688B66703497DAA19211EEdff47f25384cdc3`: `baseToken()` → `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) ✓
- cWETHv3 `0xA17581A9E3356d9A858b789D68B4d866e593aE94`: `baseToken()` → `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` (WETH) ✓
- cUSDTv3 `0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840`: `baseToken()` → `0xdAC17F958D2ee523a2206206994597C13D831ec7` (USDT) ✓
- cwstETHv3 `0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3`: `baseToken()` → `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` (wstETH) ✓

### Morpho Blue Ethereum ✅

- Morpho `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`: `owner()` → `0xcBa28b38103307Ec8dA98377ffF9816C164f9AFa` (Morpho DAO) ✓

---

## Changes Made

### Address Fix
1. `config/protocols/dex/uniswap_v2_ethereum.toml`: factory `0x5C69bE47...` → `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` (V1 → V2 deployment)

### Metadata
All 6 protocol TOMLs received `verified = true` + `reward_strategy = "none"` + dated description on 2026-04-28.
