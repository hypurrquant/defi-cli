# Mantle CLI — X Content Plan

> 마감: 2026-03-31. 2주간 5-7회 포스팅, 매번 다른 각도.
> 매 포스트에 @Mantle_Official 태그 필수.

---

## Round 1: 첫 공개 (Day 1)
**각도: "AI로 만든 Mantle 전용 DeFi CLI"**
**형식: 스레드 (7트윗) + 데모 영상**

핵심 메시지: 전체 기능 소개. 영상 첨부.
→ X_THREAD.md 그대로 사용

---

## Round 2: 고래 추적 (Day 3-4)
**각도: "Mantle 고래 $152M 포트폴리오를 CLI로 추적"**
**형식: 단일 트윗 + 스크린샷 2장**

```
Just tracked the biggest whale on @Mantle_Official with 2 commands:

$ mantle whales --token WETH --top 5
→ #1 holds 50,000 WETH ($117M)

$ mantle positions --address 0xd374...
→ $152M total: WETH + mETH. No lending positions. Pure hold.

Who is this wallet? 👀

[screenshot: whales output + positions output]

github.com/hypurrquant/defi-cli
```

---

## Round 3: 브릿지 비용 비교 (Day 5-6)
**각도: "Mantle 브릿지, 어디가 가장 싼가?"**
**형식: 단일 트윗 + 비교표 이미지**

```
Bridging 1000 USDC from @Mantle_Official — which route is cheapest?

$ mantle bridge --to ethereum --token USDC --amount 1000
→ $12.60, 7s via Relay

$ mantle bridge --to arbitrum --token USDC --amount 1000
→ $12.48, 1s via Relay

$ mantle bridge --to base --token USDC --amount 1000
→ $12.47, 4s via Relay

Incoming is cheaper:
$ mantle bridge --from ethereum --token USDC --amount 1000
→ $2.64, 5s

Lesson: bridge TO Mantle, not from it. 📉

[screenshot: bridge comparison table]
```

---

## Round 4: 익스플로잇 감지 (Day 7-8)
**각도: "Venus THE $3.7M 해킹을 2분 전에 감지할 수 있었을까?"**
**형식: 스레드 (3트윗)**

```
Tweet 1:
The Venus THE exploit ($3.7M, March 2026) was a classic oracle divergence:
Oracle: $0.27 | DEX: $5.13 | Gap: 1800%

Could we have detected it in real-time?

Yes. One command:
$ mantle scan --once --json

Our scanner checks oracle vs DEX prices across ALL lending protocols in a single multicall (~200ms).

Tweet 2:
How it works:
1. Batch query all Aave V3 + Lendle oracle prices
2. Batch query DEX spot prices (Merchant Moe)
3. Compare. If gap > 5% → ALERT

Also detects:
• Stablecoin depeg (USDC/USDT cross-price)
• vToken exchange rate anomaly (donation attacks)

All in one RPC call. No indexer needed.

Tweet 3:
Live on @Mantle_Official right now:

WETH: Oracle $2,317 vs DEX $93 (filtered — DEX liquidity too thin)
FBTC: Oracle $74,099 vs DEX $1.08 (filtered — same reason)
USDC/USDT: $0.9857 ✅

The scanner is smart enough to filter false positives from low-liquidity DEX quotes.

github.com/hypurrquant/defi-cli
```

---

## Round 5: 이율 비교 (Day 10-11)
**각도: "Mantle에서 USDC 이율 가장 높은 곳은?"**
**형식: 단일 트윗 + 스크린샷**

```
Where to earn the best yield on USDC on @Mantle_Official?

$ mantle yield compare --asset USDC
→ Aave V3: supply 0.93% | borrow 2.14%

$ mantle yield compare --asset WETH
→ Aave V3: supply 1.57% | borrow 2.26%

Not exciting rates yet, but the tool is ready for when Mantle DeFi grows.

For comparison, HyperEVM USDC is at 4.53%.

The CLI covers 11 chains — cross-chain yield hunting built in.

github.com/hypurrquant/defi-cli
```

---

## Round 6: 빌드 과정 (Day 12-13)
**각도: "Claude Code로 Rust DeFi CLI를 하루 만에 만든 과정"**
**형식: 스레드 (4트윗)**

```
Tweet 1:
How I built a full DeFi CLI for @Mantle_Official in one Claude Code session:

Tools: Claude Opus + Rust + alloy (EVM library)
Result: 8 commands, 8 protocols, live on mainnet

Here's the exact AI workflow 🧵

Tweet 2:
Step 1: Deep Interview
AI asked me 4 targeted questions:
- "바이너리 형태?" → 별도 mantle binary
- "몇 개 커맨드?" → 핵심 8개만
- "제출물?" → repo + X + 영상
- "코드 구조?" → workspace 공유

Ambiguity score: 100% → 19.5% in 4 rounds.

Tweet 3:
Step 2: Autopilot Execution
AI autonomously:
- Created crates/mantle-cli/ (10 Rust files)
- Implemented 8 commands (scan, swap, bridge, whales, positions, lending, yield, status)
- Connected ODOS API (swap) + LI.FI API (bridge) + routescan API (whales)
- Fixed all clippy warnings
- Pushed to CI (all 6 jobs passed)

Tweet 4:
Step 3: Live Verification
Every command tested against Mantle mainnet:
✅ scan: 234ms, 8 oracle prices
✅ swap: 1000 USDC → 1188 WMNT
✅ bridge: $12.60, 7 seconds
✅ whales: found $152M wallet
✅ positions: full portfolio breakdown

AI wrote the code. I verified the results.

github.com/hypurrquant/defi-cli
```

---

## Round 7: 마감 전 최종 (Day 14)
**각도: "Mantle DeFi의 모든 것을 CLI 하나로"**
**형식: 단일 트윗 (요약) + 영상 재첨부**

```
One CLI for everything on @Mantle_Official:

🔍 Scan exploits (oracle + depeg + exchange rate)
💱 Swap at best price (ODOS, all DEXes)
🌉 Bridge to 10+ chains (LI.FI)
🐋 Track whales ($152M+ wallets)
📊 Compare yields (Aave V3, Lendle)
👛 Scan any wallet's positions

8 protocols | 12 tokens | 0 API keys

Built with Claude Code for #MantleSquadBounty

[ATTACH: demo video]

github.com/hypurrquant/defi-cli
```

---

## Engagement Tips

- 매 포스트 후 Mantle 커뮤니티 리트윗/리플 확인
- 질문 오면 `mantle` 커맨드 실행 결과로 바로 답변
- 새 기능 추가하면 "v2 업데이트" 포스트로 활용
- Mantle 생태계 뉴스 (새 프로토콜, TVL 변화) 연동 가능
