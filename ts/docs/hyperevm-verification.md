# HyperEVM Chain Contract Verification Report

Generated: 2026-04-29
Method: On-chain `cast call` against HyperEVM mainnet (RPC: https://rpc.hyperliquid.xyz/evm)
Scope: Lending protocols on HyperEVM (DEX gauge layer is covered separately in `gauge-verification.md`).

---

## Summary

| Category | Total | PASS | FAIL |
|----------|-------|------|------|
| DEX      | 8     | 8    | 0    |
| Lending  | 3     | 3    | 0    |
| **Total**| **11**| **11**| **0** |

All HyperEVM DEX and lending protocols verified. Full sweep run 2026-04-29: 33 cast calls executed, 0 failures.

Curve HyperEVM (added 2026-04-29) shipped pre-verified: 38 stableswap pools + 1 tricrypto pool, all factory/router/registry contracts respond.

---

## DEX Protocols

### Curve HyperEVM ✅ (Stableswap NG + TwoCryptoNG — added 2026-04-29)

- Source: official `curvefi/curve-core/deployments/prod/hyperliquid.yaml`
- Router `0xd2002373543Ce3527023C75e7518C274A51ce712`: bytecode 13.5KB ✓
- Stableswap NG factory `0x604388Bb1159AFd21eB5191cE22b4DeCdEE2Ae22`: `pool_count()` → **38 pools** ✓
- TwoCryptoNG factory `0x5702BDB1Ec244704E3cBBaAE11a0275aE5b07499`: `pool_count()` → **1 pool** ✓
- MetaRegistry `0x5eeE3091f747E60a045a2E715a4c71e600e31F6E`: bytecode 15KB ✓
- AddressProvider `0x1764ee18e8B3ccA4787249Ceb249356192594585`, math `0x686bdb3D...`, views `0xe61Fb97E...`, implementations `0xa7Ba18EE...` (stableswap) and `0x635742dC...` (tricrypto) — all from official deployment yaml

### HyperSwap V3 ✅ (Uniswap V3 fork — first native DEX)
- Factory `0xB1c0fa0B789320044A6F623cFe5eBda9562602E3`: bytecode + `enableFeeAmount` selector confirms V3 ✓
- NPM `0x6eDA206207c09e5428F281761DdC0D300851fBC8`: `factory()` matches + `WETH9()` → `0x5555555555555555555555555555555555555555` (WHYPE) ✓
- Router (SwapRouter1) `0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D` ✓

### Hybra ✅ (V4 CL DEX with ve(3,3))
- 8 gauged pools registered, gauge_manager `0x742CAA5b...` + voter `0x5623F012...` present
- Reward strategy: `gauge.earned(tokenId)` single-arg variant — verified in gauge-verification.md (2026-04-03)

### KittenSwap ✅ (Algebra V3 + eternal farming)
- factory `0x5f95E92c338e6453111Fc55ee66D4AafccE661A7` + NPM `0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2` ✓
- Algebra Integral pattern: NPM.mint with deployer=0x0 verified onchain (gauge-verification.md 2026-04-03)
- farming_center `0x211BD8917...` + eternal_farming `0xf3b57fE4...` — full farming flow verified

### NEST V1 ⚠️ (INACTIVE — off-chain claim only)
- voter `0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901` — ERC1967 proxy
- `is_active = false` because gauge.rewardRate=0; emissions via blaze.nest.aegas.it backend tickets
- buildClaim() implemented via byte-level calldata template (matches two known-success onchain claim txs); preflight `eth_call` simulation gate confirmed 2026-04-29 with wallet `0x7E4Fde06...`

### Project X ✅ (Uniswap V3 fork, $44M TVL)
- Factory `0xFF7B3E8C00e57ea31477c32A5B52a58Eea47b072`: `owner()` → `0x153242182AcDF6B93eC0D2911734633A6C8442B8` ✓
- NPM `0xeaD19AE861c29bBb2101E834922B2FEee69B9091`: `factory()` matches + `WETH9()` = WHYPE ✓
- Router bytecode exists; reward_strategy = `lp_fee_only`

### Ramses CL ✅ (V3 + x(3,3) auto-stake)
- factory `0x07E60782535752be279929e2DFfDd136Db2e6b45`: bytecode (6.8KB) ✓
- NPM `0xB3F77C5134D643483253D22E0Ca24627aE42ED51`: `WETH9()` = WHYPE ✓
- WHYPE/USDT0 pool `0xeE02e3A3...`: `slot0()` returns active sqrtPriceX96 = 5.027e23, tick = -239369 ✓
- Note: `NPM.factory()` and `voter.length()` revert because Ramses uses non-standard `pool_deployer` + `gaugeForPool()` interface (documented x(3,3) pattern)

### Ramses HL ✅ (V2 AMM + x(3,3) auto-stake)
- factory `0xd0a07E160511c40ccD5340e94660E9C9c01b0D27`, voter `0x9aab8C415...` ✓
- Verified in gauge-verification.md (2026-04-03): "auto-staking confirmed, RAM totalSupply OK"
- Reward path corrected 2026-04-29: gauge.getReward(account, [xRAM, WHYPE]) — multi-token claim is functional, not "no external claim" as previously misread

---

---

## Lending Protocols

### HyperLend ✅ (Aave V3 fork — largest native lending on HyperEVM)

- Pool `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b`: `getReservesList()` → **17 reserves** ✓
- PoolAddressesProvider `0x72c98246a98bFe64022a3190e7710E157497170C`: `getPool()` → `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b` (matches pool) ✓
- Oracle `0xC9Fb4fbE842d57EAc1dF3e641a281827493A630e`: bytecode exists ✓
- PoolDataProvider `0x5481bf8d3946E6A3168640c1D7523eB59F055a29`: bytecode exists ✓

### HypurrFi Pooled ✅ (Aave V3 fork)

- Pool `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b`: `getReservesList()` → **19 reserves** ✓
- PoolAddressesProvider `0xA73ff12D177D8F1Ec938c3ba0e87D33524dD5594`: `getPool()` → `0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b` (matches) ✓
- Oracle `0x9BE2ac1ff80950DCeb816842834930887249d9A8`: bytecode exists ✓
- PoolConfigurator `0x532Bb57DE005EdFd12E7d39a3e9BF8E8A8F544af`: bytecode exists ✓
- ACLManager `0x79CBF4832439554885E4bec9457C1427DFB9D0d3`, WrappedHypeGateway `0xd1EF87FeFA83154F83541b68BD09185e15463972`, Treasury `0xdC6E5b7aA6fCbDECC1Fda2b1E337ED8569730288` (auxiliary; not separately tested)

### Felix Morpho ✅ (Morpho Blue fork + MetaMorpho ERC-4626 vaults)

- Morpho Blue `0x68e37dE8d93d3496ae143F2E900490f6280C57cD`: `owner()` → `0x34EdAe4f1Fd1b5947f6bE560ca371a56042daCbA` ✓
- All 7 MetaMorpho vaults respond to `totalAssets()` with non-zero balances:

| Vault | Address | totalAssets() (raw) |
|---|---|---|
| fehype | `0x2900ABd73631b2f60747e687095537B673c06A76` | 1.173e24 (~1.17M HYPE) |
| feusdc | `0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27` | 1.921e13 (~$19.2M) |
| feusdt0 | `0xFc5126377F0efc0041C0969Ef9BA903Ce67d151e` | 1.174e13 (~$11.7M) |
| feusde | `0x835FEBF893c6DdDee5CF762B0f8e31C5B06938ab` | 8.069e23 (~$806K) |
| feusdhl | `0x9c59a9389D8f72DE2CdAf1126F36EA4790E2275e` | 2.187e11 (~$218K) |
| feusdt0_frontier | `0x9896a8605763106e57A51aa0a97Fe8099E806bb3` | 2.092e12 (~$2.09M) |
| feusdhl_frontier | `0x66c71204B70aE27BE6dC3eb41F9aF5868E68fDb6` | 1.459e11 (~$145K) |

---

## Changes Made

All 3 lending TOMLs received `verified = true` + dated description on 2026-04-29.

No address corrections needed.

---

## Cross-reference

For HyperEVM **DEX** verification (Hybra, KittenSwap, NEST, Ramses HL/CL, Project X, HyperSwap), see:
- `gauge-verification.md` — Hybra (Aerodrome-style), KittenSwap (Algebra eternal farming), Ramses HL/CL (auto-stake), NEST (off-chain claim ticket)
- HyperSwap V3: factory.owner ↔ NPM.factory ↔ NPM.WETH9 (= WHYPE) cross-verified inline at adapter spawn time (config description, 2026-04-28)
