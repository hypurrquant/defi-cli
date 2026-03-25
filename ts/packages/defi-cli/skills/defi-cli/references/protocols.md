# defi-cli Protocol Reference

## HyperEVM (chain: `hyperevm`, Chain ID: 999)

### Lending Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `hyperlend` | HyperLend | aave_v3 | Main Aave V3 fork |
| `hyperyield-hyperevm` | HyperYield | aave_v3 | Yield-focused Aave V3 fork |
| `hypurrfi` | HypurrFi | aave_v3 | HypurrQuant native lending |
| `purrlend-hyperevm` | PurrLend | aave_v3 | Isolated market Aave V3 |
| `primefi-hyperevm` | PrimeFi | aave_v2 | Aave V2 fork |
| `felix-morpho` | Felix Morpho | morpho_blue | Morpho Blue vaults |
| `euler-v2` | Euler V2 | euler_v2 | Euler V2 lending |

### DEX Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `hyperswap-v3` | HyperSwap V3 | uniswap_v3 | Main V3 DEX |
| `hyperswap-v2` | HyperSwap V2 | uniswap_v2 | V2 AMM |
| `kittenswap` | KittenSwap | algebra_v3 | Algebra V3 (concentrated) |
| `nest-v1` | NestSwap V1 | algebra_v3 | Algebra V3 fork |
| `ramses-cl` | Ramses CL | uniswap_v3 | Concentrated liquidity |
| `ramses-hl` | Ramses HL | solidly_v2 | Solidly V2 (ve(3,3)) |
| `balancer-v3` | Balancer V3 | balancer_v3 | Multi-token pools |
| `curve` | Curve | curve_stableswap | Stablecoin AMM |
| `ring-few` | Ring/FEW | uniswap_v2 | Uniswap V2 fork |
| `woofi` | WooFi | woofi | WooFi PMM |
| `project-x` | Project X | uniswap_v4 | Uniswap V4 |

### Vault Protocols (ERC-4626)

| Slug | Name | Notes |
|------|------|-------|
| `felix-vaults` | Felix Vaults | CDP-backed vaults |
| `hyperbeat` | Hyperbeat | Auto-compounding vault |
| `upshift` | Upshift | Yield optimization |
| `looping-collective` | Looping Collective | Leverage looping |
| `lazy-summer` | Lazy Summer | Yield aggregator |

### CDP Protocols

| Slug | Name | Interface | Stablecoin |
|------|------|-----------|------------|
| `felix` | Felix | liquity_v2 | feUSD |

### Staking Protocols

| Slug | Name | Interface | Token |
|------|------|-----------|-------|
| `kinetiq` | Kinetiq | kinetiq_staking | kHYPE |
| `sthype` | stHYPE | sthype_staking | stHYPE |

### Other

| Slug | Name | Category |
|------|------|----------|
| `hypersurface` | Hypersurface | options |
| `seaport-hyperevm` | Seaport | nft marketplace |

---

## Mantle (chain: `mantle`, Chain ID: 5000)

### Lending Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `aave-v3-mantle` | Aave V3 Mantle | aave_v3 | Official Aave V3 |
| `lendle-mantle` | Lendle | aave_v2 | Mantle native lending |

### DEX Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `uniswap-v3-mantle` | Uniswap V3 | uniswap_v3 | Concentrated liquidity |
| `merchantmoe-mantle` | MerchantMoe | uniswap_v2 | Mantle native DEX |

---

## Common Token Symbols

### HyperEVM
- `HYPE` — native token (use WHYPE for ERC-20 swaps)
- `WHYPE` — wrapped HYPE (0x5555555555555555555555555555555555555555)
- `USDC` — USD Coin
- `USDT` — Tether
- `WBTC` — Wrapped Bitcoin
- `WETH` — Wrapped Ether

### Mantle
- `MNT` — native token
- `WMNT` — wrapped MNT
- `USDC` — USD Coin
- `USDT` — Tether
- `WETH` — Wrapped Ether

---

## Decimal Reference

| Token | Decimals | 1 token in wei |
|-------|----------|----------------|
| HYPE/WHYPE/WETH/WBTC | 18 | `1000000000000000000` |
| USDC | 6 | `1000000` |
| USDT | 6 | `1000000` |
| MNT/WMNT | 18 | `1000000000000000000` |

---

## Bridge Provider Support

| Provider | Flag | Best For |
|----------|------|----------|
| LI.FI (default) | `--provider lifi` | Any token, any chain |
| deBridge DLN | `--provider debridge` | Cross-chain arbitrary tokens |
| Circle CCTP V2 | `--provider cctp` | Native USDC transfers |

CCTP supported chains: `ethereum`, `avalanche`, `optimism`, `arbitrum`, `base`, `polygon`
