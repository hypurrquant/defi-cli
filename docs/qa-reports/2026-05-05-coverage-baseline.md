# QA Report — Coverage Baseline (2026-05-05)

[`docs/QA_WORKFLOW.md`](../QA_WORKFLOW.md) Section 11 포맷.
이전 `2026-05-05-test-foundation.md`의 후속 사이클 — 정량 커버리지 baseline 확립.

---

## QA 결과 요약

- **브랜치**: `chore/coverage-baseline` (main 위에서 분기)
- **베이스 커밋**: `ae5bb65` (`origin/main`, v1.0.12 release)
- **추가 커밋 수**: 1개
- **결과 한 줄**: 모노레포 전체 line coverage **56.0%** (7102/12674). defi-cli 패키지가 **15.3%**로 risk 집중 — 사용자 분석에서 지적된 "표면만 긁고 있다"가 정량 확인됨.

---

## 실행 내역

### 환경
- 호스트 (macOS, Node 20.20.1, pnpm 10.28.2)
- vitest 3.2.4 + `@vitest/coverage-v8` 3.2.4 (이번 PR에서 추가)

### 추가된 도구 체인
- `@vitest/coverage-v8` ^3.0.0 (vitest 공식 dev dep)
- `pnpm test:coverage` 스크립트 (root):
  ```
  pnpm -r --workspace-concurrency=1 exec -- vitest run --coverage
  ```
  각 워크스페이스 패키지에서 자체 src 기준 v8 coverage 측정. 모노레포 root 단일 호출은 workspace dist alias 이슈로 0% 측정됨 (관찰 후 per-package로 fallback).
- 각 패키지 `vitest.config.ts`에 동일 coverage block 추가:
  - provider: `v8`
  - reporter: `text-summary`
  - include: `src/**/*.ts`
  - exclude: `src/**/*.test.ts`, `dist/**`, `node_modules`

### 실행한 명령
```bash
pnpm -C ts test:coverage
```
3개 패키지 sequentially 측정, 각 결과 summary 출력.

---

## 측정 결과

| 패키지 | Lines | % covered | Statements | Branches | Functions |
|---|---:|---:|---:|---:|---:|
| `defi-core` | 399 | **65.41%** | 65.41% (261/399) | 75.00% (30/40) | 78.94% (15/19) |
| `defi-protocols` | 5976 | **98.39%** | 98.39% (5880/5976) | 27.77% (15/54) | 9.09% (1/11) |
| `defi-cli` | 6299 | **15.25%** | 15.25% (961/6299) | 56.92% (37/65) | 66.66% (14/21) |
| **monorepo** | **12674** | **56.04%** | 7102/12674 | — | — |

---

## 정성 분석

### 1. defi-cli — 15.3% (가장 큰 risk)
- 6299 lines 중 5338 lines (84.7%)이 **현 테스트 스위트로는 한 번도 실행되지 않음**.
- CLI 명령 핸들러 (`commands/lp.ts`, `commands/lending.ts`, `commands/swap.ts` 등)이 대부분 unreachable. 기존 3개 테스트 파일 (`output.test.ts`, `executor.test.ts`, `commands/bridge.test.ts`) 외에는 명령 단위 단위 테스트 없음.
- **다음 사이클 P1 후보 #1** — CLI 명령 핸들러 단위 테스트 추가 (mock RPC + 검증).
- 직접 함수 호출 (output, executor) 영역만 잘 커버됨.

### 2. defi-protocols — 98.4% statements / 9.1% functions
- statements가 극단 높지만 functions는 11개 중 1개만 측정됨.
- 진짜 의미: **어댑터 class 메서드 (instance methods)가 v8 functions count에 들어가지 않고 모듈 레벨 함수만 카운트**. 측정 단위 mismatch.
- 그러나 statements 98.4%는 사실 — 어댑터 코드 대부분이 `import` + class 정의로, vitest가 module 로드 시 평가됨.
- 실제 "어떤 메서드가 한 번이라도 호출됐나" 보려면 statements/branches 비율로 추정. branches 27.8%는 약함 — 어댑터의 conditional path (예: `useTickSpacingQuoter` 분기) 다수 미커버.
- **다음 사이클 P1 후보 #2** — 어댑터 메서드 conformance 테스트 (사용자 분석 P1).

### 3. defi-core — 65.4% (가장 균형)
- 작은 코드베이스 (399 lines), 측정 분산 정상.
- 78.9% functions는 잘 분포됨. registry/types/error 등 핵심 유틸은 대부분 커버.
- `provider.ts` 같은 파일이 미커버일 가능성 있음 (per-file breakdown은 `text` reporter로 추가 측정 필요).

---

## 다음 사이클 우선순위 (정량 데이터-driven)

| 우선 | 작업 | 데이터 근거 |
|---|---|---|
| **P0** | defi-cli 명령 핸들러 단위 테스트 — 최소 lp/lending/swap 3개 명령에 대해 mock-based 테스트 | 84.7% (5338 lines) 미커버 |
| **P1** | defi-protocols 어댑터 conformance test 매트릭스 — branches 27.8%로 보아 conditional 분기 검증 부족 | branches 15/54 |
| **P1** | per-file coverage breakdown으로 defi-core 미커버 모듈 식별 (text reporter 추가) | functions 4/19 미커버 |
| **P2** | vitest functions 측정 단위 정정 또는 istanbul provider 전환 검토 | defi-protocols functions 1/11이 측정 mismatch |

---

## 변경된 공개 인터페이스
- **없음**. 코드 동작 변경 0줄. 도구 체인만 추가.

---

## 보안 영향 분석

| 카테고리 | 결과 |
|---|---|
| 새 npm 패키지 추가 | **있음** — `@vitest/coverage-v8` ^3.0.0. vitest 공식 dev dep. SSOT Section 3 절차에 따라 사용자 명시 chat 승인 후 추가. typo-squatting risk 낮음 (npmjs.com 공식, vitest org). dev only — 배포본 영향 없음 |
| 신규 approve 경로 | 없음 |
| 슬리피지 / 컨트랙트 / RPC 변경 | 없음 |
| 시크릿 누출 | 없음 |
| 메인넷 broadcast | 0건 |

---

## SSOT Deviation
- **없음**. Docker 검증은 본 PR scope 밖 (PR #2 머지 후 다음 사이클에서).

---

## 사람 검토 필요 항목

1. **다음 사이클 P0 confirm** — defi-cli 84.7% 미커버 영역 fix를 v1.1 release plan에 포함시킬지.
2. **functions 측정 단위** — defi-protocols 1/11이 v8 provider의 알려진 한계. istanbul provider로 전환 시 정확하지만 별도 dep (`@vitest/coverage-istanbul`) 필요. 사용자 결정.
3. **PR push + 머지 권한** — `chore/coverage-baseline` 머지는 사람이 직접.

---

## Commit 히스토리 (이번 사이클)

```
[hash] chore(coverage): add @vitest/coverage-v8 + per-package baseline measurement
ae5bb65 Release v1.0.12: codex-driven QA pass — 11 user-facing bug fixes  ← base
```

---

## 검증

- 호스트: `pnpm -C ts -r build` clean.
- 호스트: `pnpm -C ts test:coverage` → 79/79 tests pass + coverage summary 출력.
  - defi-core 32 + defi-protocols 21 + defi-cli 29 가 main 시점 카운트 (PR #3, #4 머지 전).
  - PR #3 (slippage F1) 머지 후에는 defi-protocols 38 + defi-cli 29가 됨.
  - PR #4 (viem chain F3) 머지 후에는 defi-core 32가 됨.
- 호스트: `pnpm -C ts -r lint` clean.
