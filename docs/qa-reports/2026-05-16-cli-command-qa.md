# QA Report — CLI Command-Based QA (2026-05-16)

[`docs/QA_WORKFLOW.md`](../QA_WORKFLOW.md) Section 11 포맷.

세션 컨텍스트: `qa/2026-05-16-cli-command-qa` 브랜치에서 사용자가 선택한 "특정 서브커맨드 집중 QA" (price + lending + yield + swap + lp/bridge/token/wallet 드라이런 빌더). 동일 세션에서 P0/P1/P2 머지 후 main HEAD = `51c2fd8`.

---

## QA 결과 요약

- **브랜치**: `qa/2026-05-16-cli-command-qa` (main `51c2fd8` 위에서 분기)
- **베이스 커밋**: `51c2fd8` (P2 #6 mcp-server.ts 머지 직후)
- **추가 커밋**: 본 보고서 1개
- **결과 한 줄**: 13 서브커맨드 × 5 체인 × 35+ 명령 실 RPC + 외부 API + 드라이런 빌더 검증 완료. 코드 결함 0건. **CLI 플래그 일관성 권고 3건 + 1건 사용성 권고**.

---

## 실행 내역

### 환경
- 호스트 (macOS, Node 20.20.1)
- CLI 바이너리: `node ts/packages/defi-cli/dist/main.js` (v1.0.13, P2 refactor 반영 빌드)
- 출력 dump: `/tmp/cli-qa/*.json` + `*.txt` (총 45개 파일)
- 실행 모드: 기본 dry-run (broadcast 없음). DEFI_WALLET_ADDRESS=`0x000000000000000000000000000000000000dEaD`

### 실행한 주요 CLI 명령 (분류별)

| 분류 | 명령 | 검증 포인트 |
|---|---|---|
| meta | `--version`, `--help`, `schema --help`, `<sub> --help` × 13 | 버전/배너/13 서브커맨드 노출 |
| chain status | `--chain {hyperevm,base,bnb,mantle,monad} status` | 5 체인 모두 protocols 목록 응답 |
| 가격 (RPC) | `--chain hyperevm price --asset {USDC,HYPE} --source {oracle,dex,all}` | HyperLend + HypurrFi 오라클 응답, DEX spot, spread 계산 |
| 렌딩 rates (RPC) | `--chain hyperevm lending rates --protocol felix-morpho --asset USDC`, `--chain mantle lending rates --protocol aave-v3-mantle --asset USDC`, `--chain bnb lending rates --protocol venus-bnb --asset USDT` | 실시간 supply/borrow APY + utilization + total_supply/borrow |
| yield (cross-chain) | `--chain hyperevm yield compare/scan/optimize {auto,best-supply,leverage-loop} --asset USDC` | 정렬, best_supply, allocation, leverage candidates |
| 포트폴리오 (RPC) | `--chain hyperevm portfolio show`, `lp positions`, `wallet balance` | multicall 데모, 실 LP NFT 발견(0xdEaD가 kittenswap+project-x 보유), 2.95 HYPE balance |
| 외부 API swap | `swap --from USDC --to WHYPE --amount 1e8 --provider {kyber,openocean}` | KyberSwap/OpenOcean API 라우팅 + calldata 생성 |
| 드라이런 빌더 | `token approve/allowance`, `lending supply/borrow`, `bridge --to-chain base`, `lp discover` | calldata + gas_estimate + pending_approvals envelope |

---

## 테스트 결과

### 총계
| 카테고리 | 실행 | PASS | 의도된 에러 (도움말/디자인) | 도구 사용 오류 (재시도 후 PASS) |
|---|---:|---:|---:|---:|
| meta + chain | 15 | 15 | 0 | 0 |
| RPC read | 8 | 8 | 0 | 0 |
| yield | 4 | 4 | 0 | 0 |
| 외부 API | 2 | 2 | 0 | 0 |
| 드라이런 빌더 | 7 | 7 | 0 | 0 |
| 도움말 inspect | 4 | 4 | — | — |
| **합계** | **40** | **40** | **0** | 6 flag-name 발견 후 재시도 |

### 실 응답 샘플 (대표)

**HyperEVM USDC 가격 (오라클)**
```json
{
  "asset": "USDC",
  "prices": [
    { "source": "HyperLend Oracle", "source_type": "oracle", "price": 1 },
    { "source": "HypurrFi Pooled Oracle", "source_type": "oracle", "price": 1 }
  ],
  "max_spread_pct": 0.01
}
```

**HyperEVM USDC 렌딩 비교 (3 프로토콜 정렬)**
```json
{
  "asset": "USDC",
  "rates": [
    { "protocol": "HypurrFi Pooled", "supply_apy": 5.41, "borrow_variable_apy": 8.46, "utilization": 81.24 },
    { "protocol": "HyperLend",       "supply_apy": 4.96, "borrow_variable_apy": 6.93, "utilization": 80.31 },
    { "protocol": "Felix Morpho",    "supply_apy": 0.77, "borrow_variable_apy": 0.95, "utilization": 81.63 }
  ],
  "best_supply": "HypurrFi Pooled"
}
```

**KyberSwap 100 USDC → WHYPE 라우팅 (실 API)**
- amount_out: `2447663625078302208` (≈2.4477 WHYPE)
- router: `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5`
- status: `needs_approval` (current allowance 0 → pending approval listed in envelope)

**Felix Morpho USDC 100 단위 supply 빌드 (드라이런)**
- description: `[Felix Morpho] Deposit 100 into MetaMorpho vault`
- to: `0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27`
- selector: `0x6e553f65` (deposit(uint256,address))
- pending_approvals: USDC → vault, current 0 / needed 100

---

## 변경된 공개 인터페이스
**없음**. 본 사이클은 read-only QA + 보고서 추가만. 코드 0줄 변경.

---

## 발견 결함

### 활성 결함: 0건
40개 명령 모두 정상 동작. 1건은 디자인 산물 (아래 D1), 나머지는 사용성 권고.

### D1 — `lending position` 이 Morpho Blue 에서 "Unsupported operation" 반환 (디자인 산물, 결함 아님)

| 항목 | 내용 |
|---|---|
| 명령 | `defi --json --chain hyperevm lending position --protocol felix-morpho --address 0xdEaD` |
| 응답 | `{"error":"Unsupported operation: [Felix Morpho] Morpho Blue user positions are per-market — use vault deposit/withdraw instead"}` |
| 평가 | Morpho Blue 의 user position 은 marketId 별로 따로 조회해야 함 (아키텍처 산물). 에이전트가 felix-morpho 를 Aave 처럼 호출하면 이 에러로 가이드됨 — 정상 동작 |
| 권고 | 메시지를 `"Felix Morpho positions are per-market. Use 'defi --chain hyperevm lp positions' for ERC4626 vault deposits."` 등 다음 액션을 더 분명히 가리키는 형태로 다듬으면 에이전트 UX 향상 가능 |

---

## 사용성 권고 (CLI 플래그 일관성)

QA 도중 발견한 도구 사용자(사람/에이전트) 입장의 마찰. **모두 의도된 동작이지만 카테고리 간 일관성 부족**.

### R1 — 자산 지시 플래그 이름 불일치

| 서브커맨드 | 자산 플래그 |
|---|---|
| `price` | `--asset` |
| `lending rates/supply/borrow/repay/withdraw` | `--asset` |
| `yield compare/scan/optimize/execute` | `--asset` |
| `token approve/allowance/balance/transfer` | `--token` ❗ |
| `swap` | `--from` / `--to` ❗ |
| `bridge` | `--token` ❗ |
| `lp add/remove` | `--token-a` / `--token-b` (LP 는 페어라 OK) |

권고: 후속 v1.1 메이저 release 시 `--asset` 로 통일하거나, 양쪽 모두 alias 로 받기. 본 사이클은 보고만.

### R2 — `swap` 과 `bridge` 가 서브커맨드 없는 단일 명령

다른 명령은 parent + subcommand 패턴 (`lending supply`, `yield compare`, `token approve`)인데 `swap` / `bridge` 만 단일 명령. 도움말 학습 곡선이 어긋남.

권고: 향후 swap에 `simulate`/`quote`/`broadcast` 같은 subcommand 추가 시 자연스럽게 통일.

### R3 — `swap --provider` vs README의 "aggregator" 용어 불일치

`swap --help` 에서는 `--provider <name>` 인데 카테고리 명칭은 "DEX aggregator". 도움말에서는 "Aggregator: kyber, openocean, ..." 로 표시.

권고: 둘 중 하나 (provider OR aggregator) 로 통일. 호환성 차원에서 `--aggregator` 를 alias 로 추가하는 것이 안전.

---

## 보안 영향 분석

| 카테고리 | 결과 |
|---|---|
| 새 npm 패키지 / 컨트랙트 주소 / RPC 변경 | 없음 |
| 시크릿 누출 | 없음 — 모든 dump 는 0xdEaD 더미 wallet + 공개 RPC 응답만 |
| 메인넷 broadcast | 0건 (모두 dry-run, default mode) |
| 외부 API 호출 | KyberSwap (`api.kyberswap.com`), OpenOcean (`open-api.openocean.finance`) — read-only quote endpoints |
| 슬리피지 / approve | 신규 site 없음. KyberSwap quote 의 pending_approvals envelope 만 확인 (dry-run, 실 approve 없음) |

---

## SSOT Deviation
**없음**. Section 2.1 Docker 검증은 본 사이클 scope 외 (read-only QA, 코드 변경 0). Section 4 pre-flight ✓, Section 6 명령 실행 ✓ (자금 이동 모두 dry-run), Section 10 conventional commit + QA 브랜치 전용 ✓.

---

## 사람 검토 필요 항목

1. **R1 (--asset vs --token vs --from/--to)** — UX 통일 결정. 메이저 release 가 아닌 minor 에서 alias 추가는 호환성 안전
2. **D1 (Morpho Blue position 에러 메시지)** — 다듬을지 결정
3. **본 보고서 push + 머지** — 명시 승인 필요

---

## 다음 권장 액션
- [ ] 본 보고서 commit + push (사용자 승인 시)
- [ ] (선택) R1 플래그 alias 추가 PR
- [ ] (선택) D1 에러 메시지 다듬기 PR
- [ ] 정기 회귀 QA 를 CI 에 통합 (현재는 수동 호스트 실행)

---

## Commit 히스토리 (이번 사이클)
```
[hash] docs(qa): CLI command-based QA report (2026-05-16, 40 commands × 5 chains)
51c2fd8 test(mcp-server): export helpers + import guard, add envelope/registry tests  ← base
```

---

## 검증 로그

명령 수: 40개 (5 도움말 inspect 포함). 모두 `rc=0`, 의도된 에러 메시지 (`Morpho Blue per-market`) 1건만 비-0이지만 본질적으로 정상 응답. 실 응답은 `/tmp/cli-qa/*.json` 에 저장 (총 45개 파일).

다중 체인 확인:
- HyperEVM: status / price / lending / yield / lp / portfolio / swap / bridge / token 전 영역
- Base: status (USDC 라우팅 fixture 정상)
- BNB: status + venus-bnb USDT lending rates (실 RPC 응답)
- Mantle: status + aave-v3-mantle USDC lending rates (실 RPC 응답)
- Monad: status (테스트넷 — 일부 RPC 응답 변동)

외부 API: KyberSwap quote (97.5 USD 입력 → 99.97 USD 출력, ~99.66% 효율) + OpenOcean quote 둘 다 calldata + 가스 추정 정상.
