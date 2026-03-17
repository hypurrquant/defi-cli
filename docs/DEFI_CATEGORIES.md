# DeFi Protocol Categories — Complete Taxonomy

> Last updated: 2026-03-17
> Total DeFi TVL: ~$160B across all chains

## Coverage Summary

| # | Category | TVL | CLI Support | Interface |
|---|----------|-----|-------------|-----------|
| 1 | [DEX (AMM)](#1-dex-amm) | $15B+ | ✅ Full | uniswap_v2, uniswap_v3, solidly_v2, algebra_v3, curve, balancer, woofi |
| 2 | [DEX Aggregator](#2-dex-aggregator) | $2B+/day vol | ✅ Full | ODOS API (`defi swap`) |
| 3 | [Lending](#3-lendingborrowing) | $45B+ | ✅ Full | aave_v3, aave_v2, compound_v2, compound_v3, morpho_blue, euler_v2 |
| 4 | [CDP / Stablecoins](#4-cdp--stablecoins) | $10B+ | ⚠️ Partial | liquity_v2 only |
| 5 | [Liquid Staking](#5-liquid-staking-lst) | $35B+ | ⚠️ Partial | HyperEVM only (Kinetiq, stHYPE) |
| 6 | [Restaking / LRT](#6-restaking--lrt) | $20B+ | ❌ None | — |
| 7 | [Yield Vault](#7-yield-vaults--aggregators) | $3B+ | ✅ Full | erc4626 |
| 8 | [Yield Tokenization](#8-yield-tokenization) | $2.3B | ✅ Full | pendle_v2 |
| 9 | [Derivatives / Perps](#9-derivatives--perpetuals) | $1.5B+/day | ⚠️ Minimal | Generic only |
| 10 | [Bridge](#10-bridge) | cross-chain | ✅ Full | LI.FI API (`defi bridge`) |
| 11 | [Liquidity Management](#11-liquidity-management--alm) | $500M+ | ⚠️ Minimal | — |
| 12 | [Leverage Vault](#12-leverage-vault) | $1B+ | ❌ None | — |
| 13 | [Options](#13-options) | <$100M | 💤 Skip | Market too small |
| 14 | [Insurance](#14-insurance) | <$111M | 💤 Skip | Market too small |
| 15 | [Prediction Markets](#15-prediction-markets) | $447M | 💤 Skip | Not CLI-friendly |
| 16 | [RWA](#16-rwa-real-world-assets) | $13B+ | 💤 Skip | Just ERC-20 tokens |
| 17 | [NFT-Fi](#17-nft-fi) | $200M+ | 💤 Skip | Niche |
| 18 | [Payment / Streaming](#18-payment--streaming) | Small | 💤 Skip | Niche |

---

## Detailed Categories

### 1. DEX (AMM)

**What**: Decentralized token swaps via automated market makers.

**TVL**: $15B+

**Interfaces supported**:
- `uniswap_v2` — Uniswap V2, PancakeSwap, SushiSwap, QuickSwap, Pangolin, FusionX, Merchant Moe
- `uniswap_v3` — Uniswap V3, PancakeSwap V3, Agni Finance
- `solidly_v2` — Velodrome, Aerodrome, Ramses, Ring Few, Thena, Lynex, Nile
- `algebra_v3` — Camelot, KittenSwap, NEST, QuickSwap V3
- `curve_stableswap` — Curve
- `balancer_v3` — Balancer
- `woofi` — WOOFi

**Top protocols on our chains**:

| Protocol | TVL | Chains |
|----------|-----|--------|
| Uniswap V3 | $1.78B | ETH, ARB, POLY, OP, BASE, BNB, AVAX, SCROLL, LINEA |
| Curve | $1.89B | ETH, ARB, POLY, OP, BASE, BNB, AVAX |
| PancakeSwap | $1.69B | BNB, ETH, ARB, BASE |
| Aerodrome | $357M | BASE |
| Velodrome | $49M | OP |

**Not supported**: Trader Joe Liquidity Book (unique bin-based AMM), DODO PMM, Maverick V2

---

### 2. DEX Aggregator

**What**: Routes trades across all DEXes for best execution price.

**Volume**: $2B+/day combined

**CLI**: `defi swap --chain mantle --from USDC --to WMNT --amount 100 --json`

**Backend**: ODOS API (no key required, 9/11 chains)

| Aggregator | Volume/day | Our chains |
|------------|-----------|------------|
| 1inch | $211M | 8/11 (needs key) |
| KyberSwap | $238M | 8/11 |
| **ODOS** | — | **9/11 ✅** |
| 0x/Matcha | $116M | 11/11 (needs key) |
| CoW Swap | $152M | 6/11 |

---

### 3. Lending/Borrowing

**What**: Supply assets to earn interest, borrow against collateral.

**TVL**: $45B+

**Interfaces supported**:
- `aave_v3` — Aave V3, Spark, HyperLend, HypurrFi, Kinza
- `aave_v2` — Aave V2 (legacy), Lendle
- `compound_v2` — Compound V2, Venus, Benqi, Sonne, Mendi, LayerBank
- `compound_v3` — Compound V3 (Comet) on ETH, ARB, BASE, OP, POLY, MANTLE, SCROLL
- `morpho_blue` — Morpho Blue
- `euler_v2` — Euler V2

**Top protocols**:

| Protocol | TVL | Interface |
|----------|-----|-----------|
| Aave V3 | $26.1B | aave_v3 |
| Morpho Blue | $7.0B | morpho_blue |
| Spark | $4.9B | aave_v3 (fork) |
| Compound V3 | $1.4B | compound_v3 |
| Venus | $1.48B | compound_v2 |
| Euler V2 | $523M | euler_v2 |

**Not supported**: Fluid/Instadapp ($1.1B, unique interface), Silo V2 ($48M)

---

### 4. CDP / Stablecoins

**What**: Mint stablecoins by locking collateral in debt positions.

**TVL**: $10B+

**Supported**: `liquity_v2` (Felix on HyperEVM)

| Protocol | TVL | Chain | Supported |
|----------|-----|-------|-----------|
| MakerDAO/Sky | $7.46B | ETH | ❌ (complex DSProxy) |
| Ethena USDe | $6.69B | ETH | ❌ (off-chain basis trade) |
| Liquity V2 | $102M | ETH | ✅ |
| crvUSD | varies | ETH | ❌ (unique LLAMMA) |
| GHO (Aave) | varies | ETH | ❌ |

---

### 5. Liquid Staking (LST)

**What**: Stake native tokens, receive liquid receipt (stETH, rETH, etc.)

**TVL**: $35B+

**Supported**: HyperEVM only (Kinetiq kHYPE, stHYPE)

| Protocol | TVL | Chain | Supported |
|----------|-----|-------|-----------|
| Lido (stETH) | $21.4B | ETH | ❌ |
| Rocket Pool (rETH) | $1.35B | ETH | ❌ |
| cbETH | varies | ETH, BASE | ❌ |
| Frax (sfrxETH) | varies | ETH | ❌ (ERC-4626, could use vault) |
| Mantle LSP (mETH) | varies | MANTLE | ❌ |

**Note**: LST tokens (wstETH, rETH, mETH) are already usable as collateral via our lending commands.

---

### 6. Restaking / LRT

**What**: Re-stake LSTs to secure additional services, receive liquid restaking tokens.

**TVL**: $20B+

**Supported**: ❌ None

| Protocol | TVL | Chains |
|----------|-----|--------|
| EigenLayer | $10.2B | ETH |
| ether.fi (weETH) | $6.15B | ETH, ARB, BASE |
| Kelp (rsETH) | $1.36B | ETH, ARB, BASE, SCROLL, OP, LINEA |
| Renzo (ezETH) | varies | ETH, ARB, BASE, LINEA |

**Note**: LRT tokens (weETH, rsETH, ezETH) are widely used as lending collateral on Aave/Morpho. Our lending commands cover this indirectly.

---

### 7. Yield Vaults / Aggregators

**What**: Auto-compound yields, optimize strategies across protocols.

**TVL**: $3B+

**Supported**: `erc4626` (covers Yearn V3, Beefy, Veda, sDAI, sfrxETH, Morpho vault curators)

| Protocol | TVL | Interface |
|----------|-----|-----------|
| Convex | $715M | ❌ (unique booster) |
| Yearn V3 | $260M | ✅ ERC-4626 |
| Beefy | $152M | ✅ ERC-4626 |
| Morpho curators | $3B+ | ✅ ERC-4626 |
| Spark Savings (sDAI) | $1.48B | ✅ ERC-4626 |

---

### 8. Yield Tokenization

**What**: Split yield-bearing tokens into principal (PT) and yield (YT) for trading.

**TVL**: $2.3B

**Supported**: `pendle_v2`

| Protocol | TVL | Chains |
|----------|-----|--------|
| Pendle | $2.26B | ETH, ARB, BASE, MANTLE, OP, AVAX, BNB |
| Spectra | $33M | ETH, ARB, BASE |

---

### 9. Derivatives / Perpetuals

**What**: On-chain leveraged trading, perpetual futures.

**Volume**: $1.5B+/day

**Supported**: Generic only (`hlp_vault`)

| Protocol | Volume/day | Chains | Interface |
|----------|-----------|--------|-----------|
| GMX V2 | $236M | ARB, AVAX | ❌ (complex Router) |
| MYX Finance | $314M | BNB, LINEA, ARB | ❌ |
| Gains Network | $36M | ARB, POLY, BASE | ❌ |
| Vertex | varies | ARB, MANTLE | ❌ |
| Synthetix V3 | $45M TVL | ETH, OP, ARB, BASE | ❌ |

---

### 10. Bridge

**What**: Move assets between chains.

**CLI**: `defi bridge --from-chain mantle --to-chain ethereum --token USDC --amount 100 --json`

**Backend**: LI.FI API (no key required, 10/11 chains)

| Bridge | Chains | Via LI.FI |
|--------|--------|-----------|
| Relay | most | ✅ |
| Across | 7/11 | ✅ |
| Stargate V2 | 10/11 | ✅ |
| CCTP (Circle) | 6/11 | ✅ |
| deBridge | most | ✅ |

---

### 11. Liquidity Management / ALM

**What**: Automated rebalancing of concentrated LP positions (Uniswap V3 style).

**TVL**: $500M+

| Protocol | TVL | Chains |
|----------|-----|--------|
| Arrakis V2 | $77M | ETH, ARB, BASE, POLY |
| Steer | $30M | ARB, POLY, AVAX, BASE, LINEA |
| Gamma | $5M | Multiple |

**Note**: Most ALM vaults use ERC-4626 or ERC-20, could potentially use existing vault adapter.

---

### 12. Leverage Vault

**What**: One-click leveraged yield farming positions.

**TVL**: $1B+

| Protocol | TVL | Chains |
|----------|-----|--------|
| Gearbox V3 | $250M+ | ETH, ARB |
| Contango V2 | $100M+ | ETH, ARB, BASE |
| Juice Finance | varies | BLAST |

**Note**: Unique interfaces per protocol. Not standardized.

---

### 13. Options

**TVL**: <$100M. Market has not achieved product-market fit. Skip.

---

### 14. Insurance

**TVL**: ~$111M (Nexus Mutual only). Niche. Skip.

---

### 15. Prediction Markets

**TVL**: $447M (Polymarket). Web-app experience, not CLI-friendly. Skip.

---

### 16. RWA (Real World Assets)

**TVL**: $13B+ (tokenized treasuries, gold). Just ERC-20 tokens tradeable on DEXes. No special interface needed.

---

### 17. NFT-Fi

**TVL**: $200M+ (Blur Blend, BendDAO). NFT collateral lending. Niche, skip.

---

### 18. Payment / Streaming

Small market (Sablier, Superfluid). Streaming payment protocols. Skip.

---

## CLI Coverage Map

```
Total DeFi TVL: ~$160B

✅ Covered by our CLI:
   Lending     $45B   (Aave, Compound, Morpho, Euler, Spark, Venus, Benqi...)
   DEX         $15B   (Uniswap, Curve, PancakeSwap, Velodrome, Balancer...)
   DEX Agg     $2B+/d (ODOS — best price across ALL DEXes)
   CDP         $10B*  (Liquity V2 only, MakerDAO gap)
   Vault       $3B    (ERC-4626 — Yearn, Beefy, Morpho curators, sDAI...)
   Pendle      $2.3B  (Yield tokenization)
   Bridge      x-chain (LI.FI — all major bridges)
   LST         partial (HyperEVM: Kinetiq, stHYPE)
                ─────
   Total:      ~$77B+ directly addressable

❌ Main gaps:
   LST (ETH)   $35B   (Lido, Rocket Pool — simple interface)
   Restaking   $20B   (EigenLayer, ether.fi — deposit/withdraw)
   Perps       $1.5B/d (GMX V2 — complex)
   Fluid       $1.1B  (unique interface)
                ─────
   Total gap:  ~$57B

💤 Not worth adding:
   RWA         $13B   (just ERC-20 tokens)
   Options     <$100M
   Insurance   <$111M
   Prediction  $447M
   NFT-Fi      $200M
```

## Supported Chains (11)

| Chain | ID | Protocols | Tokens |
|-------|-----|-----------|--------|
| HyperEVM | 999 | 22 | 15 |
| BNB | 56 | 16 | 8 |
| Base | 8453 | 11 | 8 |
| Arbitrum | 42161 | 10 | 9 |
| Mantle | 5000 | 8 | 12 |
| Ethereum | 1 | 8 | 10 |
| Polygon | 137 | 8 | 8 |
| Linea | 59144 | 8 | 7 |
| Avalanche | 43114 | 6 | 9 |
| Optimism | 10 | 6 | 10 |
| Scroll | 534352 | 5 | 7 |
| **Total** | | **108** | **103** |
