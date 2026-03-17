# Remotion Demo Video Prompt — Mantle DeFi CLI

## Overview

Create a 60-90 second demo video showcasing **Mantle DeFi CLI** — a terminal-based DeFi toolkit for Mantle Chain, built with AI (Claude Code) for the Mantle Squad Bounty.

**Style**: Dark terminal aesthetic, Mantle brand colors (blue #0052FF / dark #0A0B0D), clean monospace font, smooth typing animations.

## Brand Assets
- Mantle logo color: `#0052FF` (blue)
- Background: `#0A0B0D` (near black)
- Terminal green: `#4ADE80`
- Alert yellow: `#FBBF24`
- Text white: `#E2E8F0`
- Accent: `#60A5FA`

## Scene Breakdown

### Scene 1: Intro (0:00 - 0:05)
**Full screen title card:**
```
🔷 Mantle DeFi CLI

Scan. Swap. Bridge. Track Whales.
All from your terminal.

Built with Claude Code
```
Fade in, hold 3s, fade out.

### Scene 2: Status (0:05 - 0:12)
**Terminal typing animation:**
```bash
$ mantle status --json
```
**Output appears line by line:**
```
  Chain: Mantle (ID: 5000)
  8 protocols | 12 tokens
  Protocols: Aave V3, Merchant Moe, Agni Finance, Lendle...
```
**Highlight**: "8 protocols | 12 tokens" glows blue briefly.

### Scene 3: Exploit Scanner (0:12 - 0:22)
**Terminal typing:**
```bash
$ mantle scan --once --json
```
**Output:**
```
  Scanned in 234ms
  Oracle: WETH $2,317.28 | FBTC $74,099.77
  Stablecoins: USDC/USDT $0.9857
  Alerts: 0 ✅
```
**Side annotation**: "Single multicall — oracle + DEX + stablecoin prices in 234ms"

### Scene 4: Swap (0:22 - 0:32)
**Terminal typing:**
```bash
$ mantle swap --from USDC --to WMNT --amount 1000
```
**Output:**
```
  1000 USDC → 1,188.82 WMNT
  Price impact: 0.05% | via ODOS
```
**Side annotation**: "Best price across all Mantle DEXes — Merchant Moe, Agni, FusionX"

### Scene 5: Bridge (0:32 - 0:42)
**Terminal typing:**
```bash
$ mantle bridge --to ethereum --token USDC --amount 1000
```
**Output:**
```
  Mantle → Ethereum: 987.37 USDC
  Fee: $12.60 | Time: 7s | via Relay
```
**Side annotation**: "Cross-chain in seconds — LI.FI finds the cheapest bridge"

### Scene 6: Whale Tracking (0:42 - 0:55)
**Terminal typing:**
```bash
$ mantle whales --token WETH --top 3
```
**Output:**
```
  #1 0xd374...840b    50,000.01 WETH ($117,500,024)
  #2 0x5980...ac1d    32,000.02 WETH ($75,200,047)
  #3 0xeac3...6d2c    10,573.23 WETH ($24,847,100)
```
Then immediately:
```bash
$ mantle positions --address 0xd374...840b
```
**Output:**
```
  Total: $152,750,024
  WETH   $117,500,023.50
  mETH   $ 35,250,000.00
```
**Highlight**: "$152M" number glows. **Side annotation**: "Track any wallet's positions across all Mantle protocols"

### Scene 7: Outro (0:55 - 1:05)
**Full screen card:**
```
🔷 Mantle DeFi CLI

8 commands | 8 protocols | 12 tokens
No API keys needed

github.com/hypurrquant/defi-cli

Built with Claude Code for @Mantle_Official
```

## Technical Notes

- **Typing speed**: ~40ms per character for commands, instant for output
- **Transitions**: Quick fade (200ms) between scenes
- **Font**: JetBrains Mono or Fira Code
- **Terminal frame**: Rounded corners, macOS-style traffic lights (optional)
- **Resolution**: 1920x1080 or 1080x1080 (for X)
- **FPS**: 30
- **Output format**: MP4

## Key Data (real, verified)

These numbers are from actual live runs against Mantle mainnet:

| Command | Key Output |
|---------|-----------|
| status | 8 protocols, 12 tokens |
| scan | 234ms, WETH $2,317, FBTC $74,099 |
| swap | 1000 USDC → 1,188.82 WMNT, 0.05% impact |
| bridge | $12.60 fee, 7 seconds, via Relay |
| whales #1 | 50,000 WETH ($117.5M) |
| positions | $152.75M total (WETH + mETH) |

## Tone

Professional but punchy. No fluff. Each scene proves the tool works with real on-chain data. The viewer should think: "This actually works on Mantle right now."
