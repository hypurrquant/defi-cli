# Lesson Learned: Full Protocol Function-Level Testing

Generated: 2026-03-22
Chain: HyperEVM (chainId=999) via Anvil Fork

## Test Results Summary

### Contract-Level Tests (cast direct calls): 12/12 ✅
| Function | Protocol | Result | Detail |
|----------|----------|--------|--------|
| ERC20.approve | WHYPE | ✅ | Max approval for router |
| UniV3.exactInputSingle | HyperSwap V3 | ✅ | 1 WHYPE → 37.95 USDC |
| Pool.getReserveData | HyperLend | ✅ | Reserve data returned |
| Pool.getUserAccountData | HyperLend | ✅ | Account data returned |
| ERC20.approve | USDC→Pool | ✅ | Max approval for lending |
| Pool.supply | HyperLend | ✅ | 20 USDC supplied |
| Pool.getUserAccountData | HyperLend | ✅ | Position verified after supply |
| Pool.withdraw | HyperLend | ✅ | uint256.max → withdraw all |
| Vault.totalAssets | Upshift | ✅ | Non-zero total assets |
| Vault.asset | Upshift | ✅ | Returns WHYPE address |
| Vault.convertToShares | Upshift | ✅ | 1 WHYPE → shares ratio |
| Seaport.code | OpenSea | ✅ | Contract exists on HyperEVM |

### CLI Tests (via Anvil fork): 9/10 ✅
| Command | Result | Detail |
|---------|--------|--------|
| status --json | ✅ | 23 protocols loaded |
| lending rates | ✅ | supply=4.39%, borrow=7.51% |
| staking info | ✅ | exchange_rate=1 (see notes) |
| vault info | ✅ | total_assets returned |
| scan --once | ✅ | 14.5s, 0 findings |
| monitor --once | ✅ | hf=None (empty account) |
| price | ✅ | 4 price sources |
| token balance | ✅ | 0 (pre-swap) |
| wallet balance | ✅ | 10000 HYPE (Anvil default) |
| nft info | ⚠️ | Seaport is not ERC-721 (see Issue #1) |

---

## Issues Found

### Issue #1: Seaport ≠ ERC-721 Collection (CRITICAL)
**Problem:** OpenSea Seaport (0x0000000000000068F116a894984e2DB1123eB395) was configured as `interface = "erc721"` in NFT protocol configs. But Seaport is a marketplace/exchange contract, NOT an ERC-721 token contract. It doesn't implement `name()`, `symbol()`, `totalSupply()`, `balanceOf()`.

**Impact:** `nft info` command fails for all 40 chains because the only NFT protocol configured is Seaport.

**Fix:**
- Remove Seaport configs from `nft` category, OR
- Add actual NFT collection addresses per chain (e.g., BAYC on Ethereum, HypurrHerd on HyperEVM)
- Consider adding Seaport as a separate `marketplace` interface with `getOrderHash()`, `fulfillOrder()` etc.

**Lesson:** Marketplace contracts and token contracts are fundamentally different. A marketplace facilitates trading of NFTs but is NOT an NFT itself. Always verify the contract implements the expected interface before adding to config.

### Issue #2: health_factor = None for Empty Accounts
**Problem:** `monitor --once` returns `health_factor: null` for accounts with no lending position. Aave V3's `getUserAccountData()` returns `healthFactor = type(uint256).max` for zero-debt accounts, but the adapter converts this to `null` instead of `Infinity`.

**Impact:** Monitoring empty accounts shows `hf=None` instead of `hf=∞`.

**Fix:** In the Aave V3 adapter, check if healthFactor equals MAX_UINT256 and convert to `Infinity` or a very large number.

**Lesson:** Aave V3 uses `type(uint256).max` (not 0 or -1) to represent "infinite" health factor. This is a common Aave pattern — always handle the max uint case.

### Issue #3: Staking Exchange Rate Precision
**Problem:** Kinetiq `staking info` returns `exchange_rate = 1` instead of a more precise value like `1.05234`.

**Impact:** Users can't see actual staking yield from exchange rate.

**Root Cause:** The adapter may be dividing two large numbers and losing precision, or returning raw integer ratio without proper decimal scaling.

**Fix:** Ensure exchange rate calculation uses floating point: `Number(kHYPE_per_HYPE) / 1e18` or similar.

**Lesson:** Exchange rates between staking derivatives and underlying tokens need careful decimal handling. Always return as float with sufficient precision.

### Issue #4: Scan Performance (14.5s per chain)
**Problem:** `scan --once` takes 14.5 seconds on HyperEVM. For 40 chains, this would be ~10 minutes.

**Impact:** Full test suite runtime too long for CI.

**Mitigation:** Run scan tests in parallel batches (5 chains at a time) or skip scan in fast test mode.

**Lesson:** Multicall-heavy operations (scan reads dozens of contracts) are inherently slow via Anvil fork because each batch triggers fork RPC calls.

---

## Protocol ABI Findings

### DEX (Uniswap V3)
- `exactInputSingle` with fee=3000 works for WHYPE/USDC pair
- `sqrtPriceLimitX96 = 0` is safe for testing (no price limit)
- Deadline must be future timestamp — `Math.floor(Date.now()/1000) + 3600`
- HyperSwap V3 has no `quoter` contract — quote fails but direct swap works
- **Key Learning:** Not all UniV3 forks deploy a Quoter. Test swap directly if quote unavailable.

### Lending (Aave V3)
- `supply(asset, amount, onBehalfOf, referralCode=0)` — works perfectly
- `withdraw(asset, type(uint256).max, to)` — withdraws everything including accrued interest
- `getReserveData(asset)` returns large hex blob — needs ABI decoding for individual fields
- `getUserAccountData(user)` returns 6 values: totalCollateral, totalDebt, availableBorrow, threshold, ltv, healthFactor
- **Key Learning:** Supply amount must account for token decimals. USDC=6 decimals, so 20 USDC = 20_000_000 (not 20e18).
- **Key Learning:** `referralCode` is always 0 for non-partnered integrations.
- **Key Learning:** `interestRateMode` 1=stable (deprecated on most markets), 2=variable.

### Vault (ERC-4626)
- `totalAssets()` returns underlying token amount (not shares)
- `asset()` returns the underlying token address
- `convertToShares(1e18)` shows the current share price ratio
- **Key Learning:** Some vaults have minimum deposit amounts. Check before testing with tiny amounts.

### Token Funding (Anvil Cheatcode)
- `anvil_setBalance` sets native token balance in hex wei
- `WETH.deposit{value: 10 ether}()` is the cleanest way to get wrapped native
- `anvil_setStorageAt` can set any ERC20 balance but requires knowing the storage slot
- **Key Learning:** Whale impersonation (`anvil_impersonateAccount`) is fragile — whale balances change. Use `deal`/`setBalance` for reproducible tests.
- **Key Learning:** `--auto-impersonate` flag eliminates the need for `anvil_impersonateAccount` — any address can send tx.

### NFT / Marketplace
- Seaport is deployed at same CREATE2 address on most chains
- Seaport implements `getOrderHash()`, `fulfillOrder()` — NOT ERC-721
- **Key Learning:** NFT protocol configs should point to actual collections (ERC-721 contracts), not marketplaces.

---

## Anvil Fork Reliability

| Chain | Fork Speed | Stability | Notes |
|-------|-----------|-----------|-------|
| HyperEVM | ~6s | ✅ Excellent | Private RPC, no rate limits |
| Ethereum (llamarpc) | Failed | ❌ | Rate limited, 502 errors |
| Ethereum (drpc) | Failed | ❌ | "Unknown block" error |
| Ethereum (cloudflare) | Failed | ❌ | Error -32046 |
| Arbitrum | ~8s | ✅ Good | Public RPC works |
| Base | ~8s | ✅ Good | Public RPC works |
| Most L2s | ~5-10s | ✅ Good | OP Stack RPCs reliable |

**Key Learning:** Free Ethereum RPCs are unreliable for Anvil fork. Use paid RPCs (Alchemy, Infura) for Ethereum E2E testing. L2 RPCs are generally more reliable.

---

## Recommendations

1. **Fix NFT configs** — Replace Seaport with actual ERC-721 collections per chain
2. **Fix health_factor handling** — Map uint256.max to Infinity in Aave adapter
3. **Fix exchange_rate precision** — Return float with proper decimal scaling
4. **Add HyperSwap quoter** — Find/deploy quoter contract address for better quote support
5. **Paid RPC for Ethereum** — Set `ETHEREUM_RPC_URL` env var for CI
6. **Parallel scan** — Run scan tests in batches to reduce total time
7. **Storage slot registry** — Document balance slots for all major tokens per chain in YAML fixtures
