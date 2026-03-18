# Deep Interview Spec: MCP Server — DeFi CLI Growth

## Metadata
- Rounds: 4
- Final Ambiguity Score: 17%
- Type: brownfield
- Generated: 2026-03-18
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 35% | 0.315 |
| Constraint Clarity | 0.70 | 25% | 0.175 |
| Success Criteria | 0.85 | 25% | 0.2125 |
| Context Clarity | 0.85 | 15% | 0.1275 |
| **Total Clarity** | | | **0.83** |
| **Ambiguity** | | | **17%** |

## Goal
defi-cli의 22개 커맨드를 전부 MCP(Model Context Protocol) 서버로 노출하여 Claude Code, Cursor 등 AI 에이전트에서 직접 DeFi 데이터 조회 + 트랜잭션 실행이 가능하게 한다. `cargo install defi-mcp`로 배포하고 mcp-config.json 예제를 제공한다.

## Constraints
- 기존 `crates/defi-mcp/` crate 활용 (이미 존재)
- `rmcp` crate 사용 (workspace에 이미 의존성 있음)
- defi-core + defi-protocols 공유
- 22개 커맨드를 MCP tool로 매핑
- JSON 입출력 (MCP 프로토콜 표준)

## Non-Goals
- 웹 대시보드 (이번에 안 함)
- Telegram/Discord 봇 (다음)
- perp-cli 통합 (다음)
- npm 배포 (Rust이므로 cargo만)

## Acceptance Criteria
- [ ] `cargo build --bin defi-mcp` 빌드 성공
- [ ] 22개 MCP tool 등록 (scan, swap, bridge, whales, positions, yield, lending, status 등)
- [ ] 각 tool이 JSON 입력 받아서 JSON 결과 반환
- [ ] `cargo install defi-mcp` 설치 가능
- [ ] mcp-config.json 예제 파일 제공
- [ ] Claude Code에서 MCP 연결 후 tool 호출 테스트
- [ ] CI 통과

## Technical Context
- `crates/defi-mcp/` 이미 존재 — rmcp server 기반
- defi-cli의 commands/ 모듈 로직을 MCP tool handler로 재사용
- Registry, multicall_read, Executor 등 defi-core 공유
- MCP tool = name + description + JSON schema input + JSON output

## MCP Tool Mapping (22 tools)

| MCP Tool | defi-cli 커맨드 | Input | Output |
|----------|----------------|-------|--------|
| defi_status | status | chain | protocols, tokens |
| defi_scan | scan | chain, patterns, thresholds | alerts, data |
| defi_scan_all | scan --all-chains | patterns | chains[], total_alerts |
| defi_swap_quote | swap | chain, from, to, amount | amount_out, price, router |
| defi_bridge_quote | bridge | from_chain, to_chain, token, amount | amount_out, fee, time |
| defi_whales | whales | chain, token, top | holders[] |
| defi_positions | positions | address, chains? | chains[], summary |
| defi_lending_rates | lending rates | chain, protocol, asset | supply_apy, borrow_apy |
| defi_yield_compare | yield compare | chain, asset | rates[], best_supply |
| defi_price | price | chain, asset | sources[] |
| defi_portfolio | portfolio | chain, address | balances, positions |
| defi_monitor | monitor | chain, address, threshold | positions, alert |
| defi_alert | alert | chain, asset, dex, lending | deviation, alert |
| defi_dex_swap | dex swap | chain, protocol, params | tx simulation |
| defi_lending_supply | lending supply | chain, protocol, asset, amount | tx simulation |
| defi_lending_borrow | lending borrow | chain, protocol, asset, amount | tx simulation |
| defi_lending_position | lending position | chain, protocol, address | supplies, borrows |
| defi_token_approve | token approve | chain, token, spender, amount | tx simulation |
| defi_staking_info | staking info | chain, protocol | exchange_rate, apy |
| defi_vault_info | vault info | chain, protocol | total_assets, apy |
| defi_cdp_info | cdp info | chain, protocol | collateral, debt |
| defi_arb | arb (stdin) | alerts JSON | opportunities[] |
