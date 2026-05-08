# defi-cli Protocol Reference

## HyperEVM (chain: `hyperevm`, Chain ID: 999) — 🟢 production

### Lending
| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `hyperlend` | HyperLend | aave_v3 | Aave V3 fork |
| `hypurrfi` | HypurrFi | aave_v3 | HypurrQuant native |
| `felix-morpho` | Felix Morpho | morpho_blue | MetaMorpho ERC-4626 vault routing |

### DEX
| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `project-x` | Project X | uniswap_v3 | V3 fee-only |
| `hyperswap-v3` | HyperSwap V3 | uniswap_v3 | V3 fee-only |
| `curve-hyperevm` | Curve | curve_stableswap | StableswapNG factory |
| `ramses-cl` | Ramses CL | uniswap_v3 + cl_style="ramses" | x(3,3) auto-stake, NPM.getPeriodReward |
| `ramses-hl` | Ramses HL | solidly_v2 | ve(3,3) gauge, RAM emission |
| `kittenswap` | KittenSwap | algebra_v3 + farming_center | KITTEN/WHYPE eternal farming |
| `hybra` | Hybra V4 | hybra | CL gauge + GaugeManager + 2-year veHYBR lock (default) |
| `nest-v1` | NEST V1 | algebra_v3 | Claim path verified live 2026-05-07 (off-chain ticket via `blaze.nest.aegas.it` / `usenest.xyz/api/blaze`). LP/farm read-paths still return zero (`gauge.rewardRate = 0`); only `lp claim` is functional. |

---

## Mantle (chain: `mantle`, Chain ID: 5000) — 🟢 production

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `aave-v3-mantle` | Aave V3 | aave_v3 | Official Aave V3 |
| `uniswap-v3-mantle` | Uniswap V3 | uniswap_v3 | Concentrated liquidity |
| `merchantmoe-mantle` | Merchant Moe | uniswap_v2 + lb_factory + masterchef | LB hooks + MasterChef MOE emission via veMOE-weighted pid |

---

## Base (chain: `base`, Chain ID: 8453) — 🟢 production

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `aave-v3-base` | Aave V3 | aave_v3 | Official |
| `compound-v3-base` | Compound V3 | compound_v3 | Comet (USDC market) |
| `uniswap-v3-base` | Uniswap V3 | uniswap_v3 | V3 fee-only |
| `aerodrome-base` | Aerodrome | solidly_v2 | ve(3,3) gauge, AERO emission |
| `aerodrome-cl` | Aerodrome Slipstream | uniswap_v3 + cl_style="slipstream" | NFT-gated CL gauge, AERO emission |

---

## BNB Chain (chain: `bnb`, Chain ID: 56) — 🟡 staged

### Lending
| Slug | Name | Interface |
|------|------|-----------|
| `aave-v3-bnb` | Aave V3 BNB | aave_v3 |
| `kinza-bnb` | Kinza | aave_v3 |
| `venus-bnb` | Venus | compound_v2 |
| `venus-flux-bnb` | Venus Flux | compound_v2 |

### DEX
| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `pancakeswap-v3-bnb` | PancakeSwap V3 | uniswap_v3 + masterchef | CAKE emission via MasterChef |
| `pancakeswap-v2-bnb` | PancakeSwap V2 | uniswap_v2 | |
| `uniswap-v3-bnb` | Uniswap V3 | uniswap_v3 | |
| `thena-v1` | Thena V1 | solidly_v2 | ve(3,3) THE emission |
| `thena-fusion` | Thena Fusion | algebra_v3 + farming_center | Algebra eternal farming |
| `biswap-bnb` | Biswap | uniswap_v2 | |
| `apeswap-bnb` | ApeSwap | uniswap_v2 | |
| `bakeryswap-bnb` | BakerySwap | uniswap_v2 | |
| `bscswap-bnb` | BSCSwap | uniswap_v2 | |
| `babydogeswap-bnb` | BabyDogeSwap | uniswap_v2 | |
| `fstswap-bnb` | FSTSwap | uniswap_v2 | |

### Vault
| `beefy-bnb` | Beefy | erc4626 | Auto-compounding |

---

## Monad (chain: `monad`, Chain ID: 143) — 🟡 staged

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `uniswap-v2-monad` | Uniswap V2 | uniswap_v2 | |
| `uniswap-v3-monad` | Uniswap V3 | uniswap_v3 | |
| `traderjoe-monad` | TraderJoe LB | uniswap_v2 + lb_factory | Active LB pools (AUSD/USDC, WMNT/USDC) |
| `morpho-blue-monad` | Morpho Blue | morpho_blue | Limited markets |

---

## DEX Aggregator Providers (`defi swap --provider`)

| Provider | Supported chains | Notes |
|----------|------------------|-------|
| `kyber` (KyberSwap) | hyperevm, base, bnb | NOT mantle, NOT monad |
| `openocean` | hyperevm, mantle, base, bnb | Universal fallback |
| `liquid` (LiquidSwap) | hyperevm | HyperEVM-native |
| `lifi` (LI.FI) | all source chains (via chain_id) | Cross-chain capable |
| `relay` (Relay) | all source chains (via chain_id) | Multi-step routes (auto-skips approve step) |

Slug mapping per chain lives in `chains.toml [chain.X.aggregators]`. LI.FI/Relay route by numeric chain_id (slug `"auto"`).

---

## Bridge Providers (`defi bridge --provider`)

| Provider | Flag | Best For |
|----------|------|----------|
| LI.FI (default) | `--provider lifi` | Any token, any chain |
| deBridge DLN | `--provider debridge` | Cross-chain arbitrary tokens |
| Circle CCTP V2 | `--provider cctp` | Native USDC transfers |

CCTP supported chains: `ethereum`, `avalanche`, `optimism`, `arbitrum`, `base`, `polygon`

---

## Common Token Symbols by Chain

### HyperEVM
- `HYPE` (native), `WHYPE` (`0x5555555555555555555555555555555555555555`), `USDC`, `USDT0`, `WBTC`, `WETH`, `RAM`, `KITTEN`, `NEST`

### Mantle
- `MNT` (native), `WMNT` (`0x78c1b0...`), `USDC` (`0x09Bc4E...`), `USDT` (`0x201E...`), `USDT0`, `WETH` (`0xdEAd...1111`), `mETH` (`0xcDA8...`), `MOE` (`0x4515...`)

### Base
- `ETH` (native), `WETH` (`0x4200000000000000000000000000000000000006`), `USDC` (`0x83358...`), `AERO` (`0x9401...`)

### BNB
- `BNB` (native), `WBNB` (`0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`), `USDT` (`0x55d398...`), `USDC`, `BUSD`, `CAKE`

### Monad
- `MON` (native), `WMON` (`0x3bd359...`), `USDC` (`0x754704...`), `USDT0`, `WETH`, `WBTC`, `wstETH`, `AUSD`

---

## Decimal Reference

| Token | Decimals | 1 token in wei |
|-------|----------|----------------|
| Native + WETH/WBNB/WMNT/WMON/WHYPE/mETH/AERO/MOE | 18 | `1000000000000000000` |
| USDC, USDT, USDT0 | 6 | `1000000` |
| WBTC | 8 | `100000000` |

---

## Verification Status

- 🟢 **production**: full lifecycle mainnet broadcast verified (mint/supply → claim emission → withdraw/remove)
- 🟡 **staged**: chain config + read-only paths verified, awaiting funded broadcast verification
