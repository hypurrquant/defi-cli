# defi-cli Protocol Reference

## HyperEVM (chain: `hyperevm`, Chain ID: 999)

### Lending Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `hyperlend` | HyperLend | aave_v3 | Main Aave V3 fork |
| `hypurrfi` | HypurrFi | aave_v3 | HypurrQuant native lending |
| `felix-morpho` | Felix Morpho | morpho_blue | Morpho Blue vaults |

### DEX Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `kittenswap` | KittenSwap | algebra_v3 | Algebra V3 (concentrated); 16 gauge pools |
| `nest-v1` | NEST V1 | algebra_v3 | Algebra V3 fork; 13 gauge pools |
| `ramses-cl` | Ramses CL | uniswap_v3 | Concentrated liquidity; 25 gauge pools |
| `ramses-hl` | Ramses HL | solidly_v2 | Solidly V2 ve(3,3) |
| `hybra` | Hybra | solidly_v2 | Solidly V2; 45 gauge pools |
| `project-x` | Project X | uniswap_v2 | Uniswap V2 fork |

### Vault Protocols (ERC-4626)

| Slug | Name | Notes |
|------|------|-------|
| `felix-vaults` | Felix Vaults | CDP-backed vaults |
| `hyperbeat` | Hyperbeat | Auto-compounding vault |
| `looping` | Looping | Leverage looping |
| `upshift` | Upshift | Yield optimization |
| `lazy-summer` | Lazy Summer | Yield aggregator |

### CDP Protocols

| Slug | Name | Interface | Stablecoin |
|------|------|-----------|------------|
| `felix` | Felix CDP | liquity_v2 | feUSD |

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
| `lendle-mantle` | Lendle | aave_v3 | Mantle native lending |

### DEX Protocols

| Slug | Name | Interface | Notes |
|------|------|-----------|-------|
| `uniswap-v3-mantle` | Uniswap V3 | uniswap_v3 | Concentrated liquidity |
| `merchantmoe-mantle` | Merchant Moe | uniswap_v2 + lb | V2 AMM + Liquidity Book; 35 LB pools |

---

## DEX Aggregator Providers (swap command)

| Provider | Chains | Notes |
|----------|--------|-------|
| KyberSwap | HyperEVM, Mantle | Default for HyperEVM |
| OpenOcean | HyperEVM, Mantle | Fallback aggregator |
| LiquidSwap | HyperEVM | HyperEVM-native |

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
