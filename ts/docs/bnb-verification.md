# BNB Chain Contract Verification Report

Generated: 2026-04-03
Method: On-chain `cast call` against BSC mainnet (RPC: https://bsc-dataseed1.binance.org)
Scope: DEX + Lending protocols only

---

## Summary

| Category | Total | PASS | FAIL |
|----------|-------|------|------|
| DEX      | 10    | 10   | 0    |
| Lending  | 6     | 5    | 1    |
| **Total**| **16**| **15**| **1** |

---

## DEX Protocols

### ApeSwap ✅
- Router `0xcF0feBd3...`: `factory()` → 0x0841... ✓, `WETH()` → WBNB ✓

### BabyDogeSwap ✅
- Router `0xC9a0F685...`: `factory()` → 0x4693... ✓

### BakerySwap ✅
- Router `0xCDe540d7...`: `factory()` → 0x01bF... ✓

### Biswap ✅
- Router `0x3a6d8cA2...`: `factory()` → 0x858E... ✓

### BSCSwap ✅
- Router `0xd9545518...`: `factory()` → 0xCe8f... ✓

### FstSwap ✅
- Router `0xb3ca4d73...`: `factory()` → 0x9A27... ✓

### Thena V1 (Solidly) ✅
- Router `0x20a304a7...`: `factory()` → 0xAFD8... ✓
- Factory `0xAFD89d21...`: `allPairsLength()` → 745 ✓

### Thena Fusion (Algebra V3) ✅
- Router `0x327Dd320...`: `factory()` → 0x306F... ✓
- Factory `0x306F06C1...`: `poolDeployer()` → valid ✓
- Quoter `0xeA68020D...`: `factory()` → 0x306F... ✓

### Uniswap V3 BNB ✅
- Router `0xB971eF87...`: `factory()` → 0xdB1d... ✓
- Factory `0xdB1d1001...`: `owner()` → valid ✓
- Quoter `0x78D78E42...`: `factory()` → 0xdB1d... ✓

### Curve BNB ✅
- Factory `0xd7E72f36...`: `pool_count()` → 135 ✓

---

## Lending Protocols

### Aave V3 BNB ✅
- Pool `0x6807dc92...`: `getReservesList()` → returns asset list ✓
- Oracle `0x39bc1bfD...`: `getAssetPrice(USDT)` → ~$1.00 ✓
- PoolAddressesProvider `0xff75B6da...`: `getPool()` → 0x6807... ✓

### Venus ✅
- Comptroller `0xfD36E2c2...`: `getAllMarkets()` → returns market list ✓
- vBNB `0xA07c5b74...`: `symbol()` → "vBNB", `exchangeRateStored()` → valid ✓
- Note: vBNB has no `underlying()` — expected for native market

### Venus Flux ✅
- PoolRegistry `0x9F7b01A5...`: `getAllPools()` → returns Stablecoins, DeFi pools ✓

### Kinza Finance ✅
- Pool `0xcb0620b1...`: `getReservesList()` → returns asset list ✓

### Alpaca Finance ✅
- FairLaunch `0xA625AB01...`: `owner()` → valid ✓
- ibWBNB `0xd7D06949...`: `totalSupply()` → 14,575 ibWBNB ✓

### Avalon Labs ❌ FAIL → `verified = false`
- Pool `0x5395201A...`: bytecode exists (6,670 chars) but NOT an EIP-1967 proxy
- `getReservesList()` and `ADDRESSES_PROVIDER()` both revert
- Not functioning as Aave V3 pool

---

## Changes Made

1. `config/protocols/lending/avalon_bnb.toml`: `verified = false`
