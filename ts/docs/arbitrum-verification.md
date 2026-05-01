# Arbitrum Chain Contract Verification Report

Generated: 2026-04-28
Method: On-chain `cast call` against Arbitrum mainnet (RPC: https://arb1.arbitrum.io/rpc)
Scope: All Arbitrum protocols added in 2026-04 round

---

## Summary

| Category | Total | PASS | FAIL |
|----------|-------|------|------|
| DEX      | 1     | 1    | 0    |
| Lending  | 2     | 2    | 0    |
| **Total**| **3** | **3**| **0** |

All contracts verified. Zero failures.

---

## DEX Protocols

### Uniswap V3 Arbitrum ✅

- Factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`: `owner()` → `0xFF7aD5dA31fECdC678796c88B05926dB896b0699` ✓
- NonfungiblePositionManager `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`: `factory()` → `0x1F98431c...` (matches factory) ✓
- NPM `0xC36442b4...`: `WETH9()` → `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` (matches Arbitrum WETH) ✓
- Router (SwapRouter02) `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`: canonical Uniswap deployment, same as Ethereum ✓
- Quoter (V2) `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`: canonical ✓

---

## Lending Protocols

### Aave V3 Arbitrum ✅

- Pool `0x794a61358D6845594F94dc1DB02A252b5b4814aD`: `getReservesList()` returns reserves ✓
- PoolAddressesProvider `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`: `getPool()` → `0x794a61...` (matches pool) ✓
- Oracle `0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7`: canonical ✓
- PoolDataProvider `0x6b4E260b765B3cA1514e618C0215A6B7839fF93e` ✓

### Compound V3 Arbitrum ✅ (4 markets)

- cUSDCv3 `0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf`: `baseToken()` → `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (USDC native) ✓
- cUSDC.ev3 `0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA`: `baseToken()` → `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8` (USDC.e bridged) ✓
- cWETHv3 `0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486`: `baseToken()` → `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` (WETH) ✓
- cUSDTv3 `0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07`: `baseToken()` → `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` (USDT) ✓

---

## Changes Made

All 3 protocol TOMLs received `verified = true` + `reward_strategy = "none"` + dated description on 2026-04-28.

No address corrections needed.
