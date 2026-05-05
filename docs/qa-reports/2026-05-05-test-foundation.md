# QA Report — Test Foundation Pass (2026-05-05)

이 보고서는 [`docs/QA_WORKFLOW.md`](../QA_WORKFLOW.md) Section 11 포맷을 따릅니다.
[`2026-05-05-v1-0-12-baseline.md`](2026-05-05-v1-0-12-baseline.md)의 후속 사이클로, 동일 브랜치에서 **테스트 커버리지 기반 다지기**가 목적입니다.

---

## QA 결과 요약

- **브랜치**: `qa/2026-05-05-v1-0-12-baseline` (이어서 작업)
- **베이스 커밋**: `cd483bf` (직전 baseline 보고서 commit)
- **추가 커밋 수**: 7개 (본 갱신 보고서 commit 제외 시 6개)
  - `6351465 chore: add Dockerfile + .dockerignore for SSOT 2.1 compliance`
  - `12f54ab test(slug-parity): block doc/CLI slug drift across mirrors`
  - `67f8c35 test(approve-safety): infinite-approval + spender whitelist guards`
  - `4dfb0a5 test(slippage): snapshot SSOT 7.3 violations + freeze the boundary`
  - `d11762e test(chain-id): chains.toml × protocols.toml × tokens/<chain>.toml integrity`
  - `46a33c8 fix(qa): null-safe wrapped_native check in chain-id test` — 호스트 통과/Docker 컨테이너 strict tsc fail이라 별도 fix
  - `1afecb5 docs: add QA report for the test-foundation cycle (2026-05-05)` — 본 보고서 (이번 갱신 commit 미포함)
- **결과 한 줄**: 모노레포 전체 **78 → 107 tests** (+29, +37%). cli 패키지만 보면 29 → 58 (+100%). 도중에 **2건의 active finding (실 코드/설정 결함)** 발견 — 슬리피지 무한 노출 15 site, 미등록 token table 2개. 둘 다 fix가 breaking change 동반이라 **본 PR에서는 봉인(snapshot)으로 회귀 가드만 깔고**, fix는 follow-up PR로 분리.

---

## 실행 내역

### 환경
| 환경 | 결과 |
|---|---|
| 호스트 (macOS, Node 20.20.1, pnpm 10.28.2) | defi-cli 58/58 PASS, 3 packages lint clean |
| Docker (`docker build -t defi-cli-qa . && docker run --rm defi-cli-qa`, node:20-alpine + pnpm 9.15.0) | **107/107 PASS** (defi-core 28 + defi-protocols 21 + defi-cli 58), 3 packages lint clean |

**중요**: 호스트에서는 시간 절약을 위해 `pnpm -C ts --filter @hypurrquant/defi-cli test`로 cli 패키지만 호출했음. 모노레포 전체 검증은 Docker 컨테이너 안에서 `pnpm test` (= `pnpm -r test`) 한 번에 모두 실행 — defi-core 28건, defi-protocols 21건, defi-cli 58건 모두 PASS, 합계 107건. 또한 `fix(qa)` 한 commit이 발생한 이유 자체가 호스트 lint는 통과/Docker strict lint fail이라 발견되었음. **즉 SSOT Section 2.1 (Docker 검증)이 실제로 회귀 한 건을 잡음** — Dockerfile 추가가 정책일 뿐 아니라 실효가 있다는 증거.

`Dockerfile` + `.dockerignore`가 추가되어 SSOT Section 2.1 ("Docker 컨테이너 안에서 로컬 빌드") 위반이 영구 해소됨. `docker run --rm defi-cli-qa` 한 명령으로 SSOT QA gate (`pnpm test && pnpm -r lint`) 자동 실행.

### 추가된 테스트 (모두 `ts/packages/defi-cli/src/qa/`)
| 파일 | tests | 검증 영역 |
|---|---|---|
| `slug-parity.test.ts` | 10 | README/SKILL 미러 byte-equality, 카운트 정합성, slug 활성/비활성 매트릭스, commands.md inactive 슬러그 예시 차단 |
| `approve-safety.test.ts` | 5 | `buildApprove` arity/encoding, 어댑터 source의 infinite-approval/wrong-spender 패턴 차단, `defi token approve` `max` sentinel 게이트 고정 |
| `slippage.test.ts` | 4 | 무한 슬리피지(0n min) 호출 site snapshot — 새 site 차단, stale 자동 검출 |
| `chain-id.test.ts` | 10 | chain_id 유일성, canonical 값 anchor, protocol/token table chain 키 정합성, cross-chain leak 차단, RPC URL/wrapped_native 형식 |

### 전체 테스트 결과
**Docker (모노레포 전체)**:
```
defi-core      Test Files  4 passed (4)   Tests  28 passed (28)
defi-protocols Test Files  3 passed (3)   Tests  21 passed (21)
defi-cli       Test Files  7 passed (7)   Tests  58 passed (58)
                                         ───────────────────────
                                          Total 107 passed (107)
```
defi-cli 패키지 내 분포: 기존 3 파일 (`output.test.ts` 7, `executor.test.ts` 14, `commands/bridge.test.ts` 8 = 29) + 신규 4 파일 (`qa/slug-parity` 10, `qa/approve-safety` 5, `qa/slippage` 4, `qa/chain-id` 10 = 29).

### 추가/수정한 코드
- 프로덕션 코드 동작 변경 **0줄**.
- 신규 테스트 파일 4개 (총 ~630 lines), Dockerfile 1개 (41 lines), .dockerignore 1개 (53 lines).
- 자체 fix: `chain-id.test.ts` null-safe 처리 4 lines (Docker strict lint 회귀 대응).
- 기존 프로덕션 코드/설정/문서 수정: 없음.

---

## 발견 결함 (실 코드/설정)

### F1 — DEX 어댑터 무한 슬리피지 노출 (SSOT 7.3 위반, **활성**)
| 항목 | 내용 |
|---|---|
| 영향 | swap / LP add / LP remove broadcast 시 MEV·sandwich 무방비. 사용자가 `--broadcast`로 호출하면 0n minimum이 그대로 calldata에 박혀 모든 가격 결과 수용 |
| 영향 어댑터 | `algebra_v3.ts`, `balancer_v3.ts`, `thena_cl.ts`, `uniswap_v3.ts` (4 어댑터, 15 occurrences) |
| 위치 (snapshot) | `KNOWN_INFINITE_SLIPPAGE` set in `src/qa/slippage.test.ts` |
| 본 사이클 처리 | **테스트로 봉인**. 새로운 `0n min` site 추가 시 즉시 fail. 기존 15 site는 follow-up PR에서 `slippageBps` (or 명시 `amount{Out,0,1}Min`) 인자를 IDex/lp-builder trait에 추가하면서 정정 — breaking change 동반이라 본 PR 분리 |
| 권고 fix | `IDex.buildSwap`, `IDex.buildAddLiquidity`, `IDex.buildRemoveLiquidity`에 `slippageBps?: number` (default 50) 또는 explicit `amountOutMin` 추가 → 모든 어댑터 정정 → CLI `swap`/`lp` 명령에 `--slippage <bps>` 플래그 노출 |
| 추정 라인 변동 | trait 변경 + 4 어댑터 정정 + CLI 플래그 + 테스트 = ~600~900 라인 (별도 PR) |

### F2 — Token 테이블 chain 미등록 (SSOT 7.4 doc/config drift)
| 항목 | 내용 |
|---|---|
| 영향 | `tokens/arbitrum.toml` + `tokens/ethereum.toml` 존재. README 표는 두 chain을 "🟡 staged"로 표기. 그러나 `chains.toml`에는 라우팅 entry 없음. 사용자가 `--chain arbitrum`로 호출하면 `Chain not found: arbitrum` 에러. AI 에이전트 역시 README 보고 시도 → 실패 |
| 본 사이클 처리 | **`KNOWN_ORPHAN_TOKEN_TABLES`로 snapshot**. 새 orphan 추가 시 fail. 기존 2개는 SSOT Section 3 "지원 체인 목록 변경 절대 금지(승인 필요)"에 해당하므로 사용자 결정 |
| 권고 결정 | 둘 중 하나 선택: <br/> (a) `chains.toml`에 arbitrum (chain_id=42161) + ethereum (chain_id=1) 추가 → KNOWN_ORPHAN 셋 비움 → README "🟡 staged" 표기 유지 가능 <br/> (b) README에서 두 행 제거 + token TOML 삭제 또는 `_unwired/` 디렉토리 이동 → 진정 5체인 운영으로 통일 |

### F3 — Executor의 viem client에 `chain` 명시 누락 (SSOT 7.4 hardening)
| 항목 | 내용 |
|---|---|
| 위치 | `ts/packages/defi-cli/src/executor.ts` L185, L219, L246, L376-377; `ts/packages/defi-core/src/provider.ts` L9 — `createWalletClient({ account, transport: http(rpcUrl) })`처럼 `chain` 인자 없음 |
| 영향 | 현재는 안전 — viem이 RPC `eth_chainId`로 동적 fetch. 단 RPC가 변조되었거나 offline-sign 시나리오에서 잘못된 chainId로 서명 가능. 즉 explicit anchor 부재 |
| 본 사이클 처리 | **테스트는 추가 안 함**. fix는 viem `viem/chains`에서 chain 객체 import + `chain: defineChain({ id, ... })` 패턴으로 walletClient 생성. ~30~60 라인 변경, 별도 PR |
| 권고 우선순위 | 낮음 (현 사용 패턴에서 위험 노출 적음), 단 `--broadcast` 동작 안전성 강화에 도움 |

---

## 발견 + 수정한 결함 (테스트 자체)

### Fixed-1 — Docker strict tsc lint 통과를 위한 null-safe (`46a33c8`)
| 항목 | 내용 |
|---|---|
| 위치 | `ts/packages/defi-cli/src/qa/chain-id.test.ts` `wrapped_native` 검증 블록 |
| 원인 | `ChainConfig.wrapped_native`가 `?: string` (optional)이라 strict-mode tsc는 `cfg.wrapped_native`를 `string \| undefined`로 본다. 호스트의 vitest는 transform 단계에서 strict 미강제이므로 통과 — Docker 컨테이너 안 `tsc --noEmit` lint는 fail |
| 수정 | `cfg.wrapped_native ?? ""` coercion + missing 케이스 명시 분기 (4 lines) |
| 의미 | SSOT Section 2.1 Docker 검증이 호스트 검증만으로는 못 잡는 회귀를 실제로 검출. Dockerfile 추가의 첫 번째 ROI 발생 |

본 사이클은 테스트 추가가 메인. 프로덕션 코드 결함의 fix는 follow-up — F1/F2는 봉인, F3는 보고만.

---

## 변경된 공개 인터페이스
- **없음**. CLI 슬러그/플래그/명령 시그니처/JSON envelope 모두 v1.0.12 그대로.

---

## 보안 영향 분석

| 카테고리 | 결과 |
|---|---|
| 신규 approve 경로 | **없음** |
| 슬리피지 기본값 변경 | **없음** (단, F1으로 보고된 무한 슬리피지 노출은 본 사이클에서 fix 안 함) |
| 신규 컨트랙트 주소 | **없음** |
| Signer abstraction 우회 | **없음** |
| 신규 RPC endpoint | **없음** |
| Referral / 수수료 변경 | **없음** |
| 시크릿 누출 | **없음** (`git diff --cached` 스캔 — 모든 변경이 docs/test 파일) |
| 메인넷 broadcast | **0건** |

---

## SSOT Deviation
- **Section 2.1 (Docker)**: 본 사이클 시점에는 `Dockerfile`이 없어 ad-hoc `docker run`을 썼으나, 이번 PR의 `chore:` commit으로 영구 `Dockerfile` 추가 → **다음 사이클부터 deviation 없음**.

---

## 사람 검토 필요 항목

1. **F1 (슬리피지) follow-up PR 발행 여부 + 우선순위**
   - 4 어댑터의 `min*: 0n` 정정. trait 변경 동반.
   - 결정: (a) 즉시 별도 PR로 진행 (b) v1.1 release plan에 포함 (c) 사용자 직접 처리.

2. **F2 (token orphan) 정책 결정** — `chains.toml`에 arbitrum/ethereum 추가 vs. doc/token 정리 중 선택.

3. **F3 (viem chain anchor) hardening 우선순위** — 낮음으로 표기했지만 사용자 판단 필요.

4. **본 PR push + PR 생성 승인** — `git push -u origin qa/2026-05-05-v1-0-12-baseline` 명시 승인 필요. 이번 PR이 commit 9개로 커지면서 단일 PR review 부담은 늘었지만, 모든 변경은 docs/test/Dockerfile만이라 코드 동작 변경은 0줄.

---

## 다음 권장 액션

- [ ] 사용자 승인 후 `git push -u origin qa/2026-05-05-v1-0-12-baseline`
- [ ] PR 생성 (사람 머지)
- [ ] (별도 PR) F1 슬리피지 trait/어댑터 정정 — KNOWN_INFINITE_SLIPPAGE 비울 때까지 점진
- [ ] (별도 결정) F2 chains.toml 확장 또는 doc/token 정리
- [ ] (별도 PR, 우선순위 낮음) F3 viem client chain anchor

---

## Commit 히스토리 (이번 사이클)

```
1afecb5 docs: add QA report for the test-foundation cycle (2026-05-05)
46a33c8 fix(qa): null-safe wrapped_native check in chain-id test
d11762e test(chain-id): chains.toml × protocols.toml × tokens/<chain>.toml integrity
4dfb0a5 test(slippage): snapshot SSOT 7.3 violations + freeze the boundary
67f8c35 test(approve-safety): infinite-approval + spender whitelist guards
12f54ab test(slug-parity): block doc/CLI slug drift across mirrors
6351465 chore: add Dockerfile + .dockerignore for SSOT 2.1 compliance
cd483bf docs: add QA report for v1.0.12 baseline (2026-05-05)   ← 이전 사이클
134bf17 docs: align README/SKILL slug catalog with actual CLI behavior
6376e4c docs: add QA workflow SSOT and CLAUDE.md entrypoint
ae5bb65 Release v1.0.12: codex-driven QA pass — 11 user-facing bug fixes  ← base
```

이번 갱신 commit은 추가 예정 (`docs: refine test-foundation report ...`).

---

## 검증 로그
- 호스트: `pnpm -C ts --filter @hypurrquant/defi-cli test` → 58/58 PASS (cli 한정). 호스트는 cli 패키지에 한정해 빠르게 회귀 확인.
- Docker (모노레포 전체): `docker build -t defi-cli-qa .` → 556 MB image, `docker run --rm defi-cli-qa` →
  - defi-core: 28/28
  - defi-protocols: 21/21
  - defi-cli: 58/58
  - **합계 107/107 PASS, lint 3/3 clean.**
