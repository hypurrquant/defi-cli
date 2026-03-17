# Deep Interview Spec: Mantle CLI

## Metadata
- Rounds: 4
- Final Ambiguity Score: 19.5%
- Type: brownfield
- Generated: 2026-03-17
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 35% | 0.315 |
| Constraint Clarity | 0.70 | 25% | 0.175 |
| Success Criteria | 0.75 | 25% | 0.1875 |
| Context Clarity | 0.85 | 15% | 0.1275 |
| **Total Clarity** | | | **0.805** |
| **Ambiguity** | | | **19.5%** |

## Goal
Mantle 체인 전용 CLI 바이너리(`mantle`)를 기존 defi-cli workspace에 새 crate로 추가하여, Mantle Squad Bounty(~3/31)에 제출한다. `--chain` 플래그 없이 Mantle 하드코딩된 8개 핵심 커맨드를 제공하고, GitHub repo + X 스레드 + 데모 영상으로 제출한다.

## Constraints
- **마감**: 2026-03-31
- **코드 구조**: defi-cli workspace에 `crates/mantle-cli/` 추가. defi-core + defi-protocols 공유.
- **바이너리명**: `mantle`
- **체인**: Mantle만 (chain_id: 5000). `--chain` 플래그 제거.
- **의존성**: defi-core, defi-protocols, reqwest, clap, serde_json, tokio, alloy

## Non-Goals
- 다른 체인 지원 (Mantle 전용)
- 신규 프로토콜 어댑터 개발
- 웹 UI / TUI 대시보드
- 실제 트랜잭션 브로드캐스트 (dry-run/시뮬레이션 중심)

## Acceptance Criteria
- [ ] `cargo build --bin mantle` 로 별도 바이너리 빌드
- [ ] 8개 커맨드 동작: status, scan, swap, bridge, whales, positions, lending (rates), yield (compare)
- [ ] 모든 커맨드에 `--json` 출력 지원
- [ ] `--chain` 플래그 없이 Mantle 하드코딩
- [ ] README.md: 설치법, 사용법, 스크린샷, Mantle 생태계 소개
- [ ] CI 통과 (clippy, fmt, test, build)
- [ ] 데모 실행 성공: scan→alert, whales→position, swap quote, bridge quote

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 별도 repo 필요 | 유지보수 2배 문제 | 같은 workspace, crate만 분리 |
| 전체 22개 커맨드 | bounty에 불필요한 것 많음 | 핵심 8개만 |
| 코드 복사 필요 | defi-core 공유 가능 | workspace dependency로 해결 |

## Technical Context
- 기존 defi-cli workspace: 4 crates (defi-core, defi-protocols, defi-cli, defi-mcp)
- Mantle 설정: 8 protocols, 12 tokens, chain config 이미 존재
- 핵심 재사용: Registry, multicall_read(), Executor, OutputMode
- 신규 작성: main.rs, commands/mod.rs (8개 커맨드 래퍼), README.md

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| MantleCLI | product | binary_name, commands[], version | uses defi-core, targets Bounty |
| defi-cli | source | 22 commands, 11 chains | shares core with MantleCLI |
| Bounty | external | deadline(3/31), prize($10K MNT), criteria[] | receives MantleCLI + XThread + DemoVideo |
| Commands | feature set | scan, swap, bridge, whales, positions, lending, yield, status | belongs to MantleCLI |
| MantleEcosystem | domain | 8 protocols, 12 tokens, chain_id=5000 | queried by Commands |
| XThread | deliverable | text, screenshots, @Mantle_Official tag | part of Bounty submission |
| DemoVideo | deliverable | 1-2min, scan/whales/swap/bridge demo | part of Bounty submission |
| Workspace | architecture | Cargo workspace, shared crates | contains MantleCLI + defi-cli |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 3 | 3 | - | - | N/A |
| 2 | 5 | 2 | 0 | 3 | 60% |
| 3 | 7 | 2 | 0 | 5 | 71% |
| 4 | 8 | 1 | 0 | 7 | 87.5% |

## Implementation Plan

### Phase 1: Crate 생성 (~30min)
1. `crates/mantle-cli/Cargo.toml` 생성
2. `crates/mantle-cli/src/main.rs` — Mantle 하드코딩 entry point
3. `crates/mantle-cli/src/commands/mod.rs` — 8개 커맨드 등록
4. 각 커맨드: defi-cli 로직 재사용, chain을 "mantle"로 고정

### Phase 2: 커맨드 구현 (~1hr)
- `status` → Mantle 프로토콜 현황
- `scan` → Oracle 괴리 + 디페그 + exchange rate
- `swap` → ODOS aggregator (Mantle)
- `bridge` → LI.FI (from/to Mantle)
- `whales` → routescan API (Mantle 무료)
- `positions` → 토큰 잔고 + lending 포지션
- `lending rates` → Aave V3/Lendle 이율
- `yield compare` → 전체 프로토콜 이율 비교

### Phase 3: README + 문서 (~30min)
- README.md: 설치법, 사용법, 스크린샷
- Mantle 생태계 소개 ($748M TVL, 8 protocols)

### Phase 4: CI + 테스트 (~15min)
- cargo build, clippy, fmt, test
- 라이브 테스트 (scan, swap, bridge, whales)
