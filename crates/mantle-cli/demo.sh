#!/bin/bash
# Mantle CLI Demo — 1분 녹화용
# 실행: bash demo.sh
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MANTLE="${SCRIPT_DIR}/target/release/mantle"
if [ ! -f "$MANTLE" ]; then
  echo "Building mantle..."
  cargo build --release --bin mantle --manifest-path "${SCRIPT_DIR}/Cargo.toml"
fi

clear
echo "🔷 Mantle DeFi CLI — Live Demo"
echo ""
sleep 1

# 1. Status (5초)
echo "━━━ mantle status ━━━"
$MANTLE status --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'  Chain: {d[\"chain\"]} (ID: {d[\"chain_id\"]})')
print(f'  {d[\"summary\"][\"total_protocols\"]} protocols | {d[\"summary\"][\"total_tokens\"]} tokens')
names = [p['name'] if isinstance(p,dict) else p for p in d['protocols'][:4]]
print(f'  Protocols: {\", \".join(names)}...')
"
echo ""
sleep 2

# 2. Scan (10초)
echo "━━━ mantle scan --once ━━━"
$MANTLE scan --once --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'  Scanned in {d[\"scan_duration_ms\"]}ms')
o=d['data'].get('oracle_prices',{})
print(f'  Oracle: WETH \${o.get(\"Aave V3 Mantle/WETH\",0):,.2f} | FBTC \${o.get(\"Aave V3 Mantle/FBTC\",0):,.2f}')
s=d['data'].get('stablecoin_pegs',{})
print(f'  Stablecoins: USDC/USDT \${s.get(\"USDC/USDT\",0)}')
print(f'  Alerts: {d[\"alert_count\"]}')
"
echo ""
sleep 2

# 3. Swap (8초)
echo "━━━ mantle swap --from USDC --to WMNT --amount 1000 ━━━"
$MANTLE swap --from USDC --to WMNT --amount 1000 --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'  1000 USDC → {d[\"amount_out\"]:,.2f} WMNT')
print(f'  Price impact: {d.get(\"price_impact_pct\",0):.4f}% | via {d[\"aggregator\"]}')
"
echo ""
sleep 2

# 4. Bridge (8초)
echo "━━━ mantle bridge --to ethereum --token USDC --amount 1000 ━━━"
$MANTLE bridge --to ethereum --token USDC --amount 1000 --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'  Mantle → Ethereum: {d[\"amount_out\"]:,.2f} USDC')
print(f'  Fee: \${d[\"total_cost_usd\"]} | Time: {d[\"estimated_time_sec\"]}s | via {d[\"bridge\"]}')
"
echo ""
sleep 2

# 5. Whales (8초)
echo "━━━ mantle whales --token WETH --top 3 ━━━"
$MANTLE whales --token WETH --top 3 --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
for h in d['holders']:
    usd = h['balance'] * 2350
    print(f'  #{h[\"rank\"]} {h[\"address\"][:18]}... {h[\"balance\"]:>12,.2f} WETH (\${usd:>13,.0f})')
"
echo ""
sleep 2

# 6. Whale Position (8초)
echo "━━━ mantle positions --address 0xd374... (Whale #1) ━━━"
$MANTLE positions --address 0xd374a62aa68d01cdb420e17b9840706e86bc840b --json 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'  Total: \${d[\"total_value_usd\"]:,.0f}')
for t in d['token_balances']:
    print(f'  {t[\"symbol\"]:6s} \${t[\"value_usd\"]:>15,.2f}')
"
echo ""
sleep 2

echo "🔷 Built with Claude Code for Mantle Squad Bounty"
echo "   github.com/hypurrquant/defi-cli"
