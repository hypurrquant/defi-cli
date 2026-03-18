# Supported Chains Reference

| Chain | ID | RPC | Protocols | Tokens |
|-------|-----|-----|-----------|--------|
| hyperevm | 999 | rpc.hyperliquid.xyz/evm | 22 | 15 |
| arbitrum | 42161 | arb1.arbitrum.io/rpc | 10 | 9 |
| base | 8453 | mainnet.base.org | 11 | 8 |
| bnb | 56 | bsc-dataseed1.binance.org | 16 | 8 |
| ethereum | 1 | eth.llamarpc.com | 8 | 10 |
| polygon | 137 | polygon-bor-rpc.publicnode.com | 8 | 8 |
| avalanche | 43114 | api.avax.network/ext/bc/C/rpc | 6 | 9 |
| optimism | 10 | mainnet.optimism.io | 6 | 10 |
| scroll | 534352 | rpc.scroll.io | 5 | 7 |
| linea | 59144 | rpc.linea.build | 8 | 7 |
| mantle | 5000 | rpc.mantle.xyz | 8 | 12 |

## RPC Override

Set environment variable `{CHAIN}_RPC_URL` to override default RPC:
```
MANTLE_RPC_URL=https://custom-rpc.example.com
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/KEY
```

## Explorer APIs (for whale tracking)

Free (no key): Ethereum, Avalanche, Optimism, Mantle (via routescan)
With key: Set `ETHERSCAN_API_KEY` for BNB, Arbitrum, Base, Polygon, Scroll, Linea
