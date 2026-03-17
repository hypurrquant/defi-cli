# Deep Interview Spec: Parallel Chain Scanning

## Metadata
- Rounds: 3
- Final Ambiguity Score: 18.25%
- Type: brownfield
- Generated: 2026-03-17
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 35% | 0.315 |
| Constraint Clarity | 0.70 | 25% | 0.175 |
| Success Criteria | 0.80 | 25% | 0.200 |
| Context Clarity | 0.85 | 15% | 0.1275 |
| **Total Clarity** | | | **0.8175** |
| **Ambiguity** | | | **18.25%** |

## Goal
`positions`와 `scan` 커맨드를 병렬화하여 11개 체인 동시 조회. positions 12초→1.5초, scan에 `--all-chains` 플래그 추가.

## Scope

### 1. positions 병렬화
- **파일**: `crates/defi-cli/src/commands/positions.rs`
- **변경**: 순차 for loop → `tokio::JoinSet` 병렬 실행
- **동작**: 11개 체인 동시 multicall, 실패한 체인은 skip (에러 무시)
- **목표**: 12초 → ~1.5초

### 2. scan --all-chains
- **파일**: `crates/defi-cli/src/commands/scan.rs`
- **변경**: `--all-chains` 플래그 추가. 모든 체인 동시 스캔.
- **동작**: 각 체인별 scan 결과를 병렬 수집 → 통합 JSON 출력
- **출력**: `{ chains: [{ chain, alerts, data }...], total_alerts, scan_duration_ms }`

## Constraints
- `tokio::JoinSet` 사용 (tokio 1.x에 포함)
- RPC 에러 시 해당 체인 skip (전체 실패 X)
- 기존 단일 체인 동작 유지 (--all-chains 없으면 기존과 동일)
- mantle-cli의 positions/scan은 단일 체인이라 변경 불필요

## Non-Goals
- 테이블 출력 포맷 (이번에 안 함)
- yield scan 크로스체인 (다음에)
- 새 프로토콜/체인 추가 (이미 108개)

## Acceptance Criteria
- [ ] `defi positions --address 0x... --json` 이 3초 이내 완료 (11체인)
- [ ] `defi positions --address 0x... --chains ethereum,mantle --json` 필터 동작
- [ ] RPC 실패 체인은 skip, 나머지 정상 반환
- [ ] `defi scan --all-chains --once --json` 이 11체인 동시 스캔
- [ ] scan 결과에 chains 배열 + total_alerts 포함
- [ ] 기존 `defi scan --chain bnb --once --json` 동작 유지
- [ ] CI 통과 (clippy, fmt, test, build)
