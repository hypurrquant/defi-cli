# Lesson Learned: Live Chain Test (40 Chains, Real RPCs)

Generated: 2026-03-22
Test Mode: Live RPC (no Anvil fork), read-only operations
Duration: 4.0 minutes (8 chains parallel, 1s delay between calls)

## Results Summary

```
Chains: 1/40 clean (HyperEVM only)
Tests:  119/207 pass (57%), 88 fail (43%)
```

### Pass/Fail by Category
| Test | Pass | Fail | Rate |
|------|------|------|------|
| **status** | 40/40 | 0 | 100% ✅ |
| **scan** | 40/40 | 0 | 100% ✅ |
| **price** | 21/40 | 19 | 53% |
| **lending.rates** | 15/40 | 25 | 38% |
| **vault.info** | 1/40 | 39 | 3% ❌ |
| **nft.info** | 2/6 | 4 | 33% |
| **staking.info** | 1/1 | 0 | 100% ✅ |

## Critical Findings

### Finding 1: Beefy Vaults Are NOT ERC-4626 (39/40 vault.info failures)

**Problem:** 모든 Beefy vault config가 `interface = "erc4626"`로 설정되어 있지만, Beefy vault 컨트랙트는 ERC-4626을 구현하지 않습니다. `totalAssets()`, `convertToShares()`, `deposit(uint256,address)` 같은 ERC-4626 표준 함수가 없습니다.

**Beefy의 실제 인터페이스:**
```
// Beefy Vault ABI (NOT ERC-4626)
function getPricePerFullShare() view returns (uint256)
function balance() view returns (uint256)  // total deposited
function deposit(uint256 amount)            // no receiver param
function withdraw(uint256 shares)           // no receiver/owner params
function strategy() view returns (address)
function want() view returns (address)      // underlying token (= asset())
```

**Fix Required:**
1. 새 인터페이스 `beefy_vault` 어댑터를 실제로 구현 (현재는 erc4626로 라우팅되어 실패)
2. 또는 Beefy vault를 제거하고 실제 ERC-4626 vault만 등록 (Yearn V3, Euler Earn 등)

**Lesson:** `beefy_vault` interface가 factory.ts에 erc4626로 매핑되어 있지만 실제 ABI가 다름. Interface 이름과 실제 ABI 호환성을 반드시 검증해야 함.

### Finding 2: Protocol Slug Matching Fails (25 lending.rates failures)

**Problem:** 테스트 스크립트가 `protocol.name.toLowerCase().replace(/ /g, "-")`로 slug를 생성하지만, 실제 TOML config의 slug는 이 패턴과 다른 경우가 많음.

**Examples:**
```
Protocol Name: "Aave V3 Arbitrum" → generated slug: "aave-v3-arbitrum"
Actual TOML slug: "aave-v3-arb"

Protocol Name: "Compound V2" → generated slug: "compound-v2"
Actual TOML slug: "compound-v2-eth"
```

**Fix:** Registry에 `getProtocolByName()` 메서드 추가, 또는 status JSON에 slug 필드를 포함시켜야 함.

**Lesson:** Protocol name ≠ slug. 항상 TOML의 실제 slug 값을 사용해야 함. status --json 출력에 slug 필드가 누락됨.

### Finding 3: Price Command Depends on Lending Oracle (19 failures)

**Problem:** `price` 커맨드가 Aave V3 oracle을 통해 가격을 조회하는데, 새로 추가한 체인 대부분은 Aave V3가 없거나 oracle 주소가 없음.

**Affected chains:** abstract, aurora, berachain, blast, boba, core, cronos, fraxtal, ink, kava, manta, mode, monad, moonriver, soneium, taiko, unichain, worldchain, zircuit

**Fix:** DEX spot price를 fallback으로 사용 (이미 dex_price.ts에 구현되어 있지만 price 커맨드에서 제대로 연동 안 됨).

**Lesson:** Oracle price는 Aave V3가 배포된 체인에서만 동작. 범용 price 커맨드는 DEX spot price를 primary로, oracle을 secondary로 사용해야 함.

### Finding 4: NFT Collection Addresses Invalid (3/6 failures)

**Problem:** Base "Base Introduced", Arbitrum "Smol Brains", Optimism "Optimism Quests" 주소에서 `name()` 호출 실패. 주소가 잘못되었거나 컨트랙트가 다른 인터페이스를 사용.

**Fix:** 각 체인의 실제 인기 NFT 컬렉션 주소를 block explorer에서 재검증.

**Lesson:** NFT 컬렉션 주소는 시간이 지나면 변경될 수 있음 (proxy upgrade, migration). 매 테스트 전 `eth_getCode` 로 컨트랙트 존재 확인 필요.

## What Works Perfectly (100% pass)

1. **status --json**: 40/40 체인 전부 정상 — Registry 로딩, 프로토콜 카운트 정확
2. **scan --once**: 40/40 체인 전부 정상 — Exploit detection 동작
3. **HyperEVM 전체**: 유일한 완벽 통과 체인 — 모든 프로토콜이 실제 검증됨

## Priority Fix List

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | Beefy vault → 실제 beefy_vault 어댑터 구현 또는 ERC-4626 vault로 교체 | High | 39 chains |
| **P1** | status JSON에 protocol slug 포함 | Low | 25 chains |
| **P2** | price 커맨드에 DEX spot price fallback 연동 | Medium | 19 chains |
| **P3** | NFT 컬렉션 주소 재검증 (3 chains) | Low | 3 chains |

## Key Metrics

- **가장 안정적인 체인**: HyperEVM (100%), BNB (5/6 pass)
- **가장 불안정한 체인**: canto (timeout 이슈)
- **가장 많이 실패한 테스트**: vault.info (97.5% 실패)
- **가장 안정적인 테스트**: status, scan (100%)
- **총 테스트 시간**: 4분 (8 parallel × 5 batches)
