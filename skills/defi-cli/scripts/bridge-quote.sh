#!/usr/bin/env bash
# bridge-quote.sh — dry-run a cross-chain bridge across LI.FI / deBridge / CCTP
# Source must be one of: hyperevm, mantle, base, bnb, monad
# Usage: FROM_CHAIN=base TO_CHAIN=arbitrum TOKEN=USDC AMOUNT=100000000 bash bridge-quote.sh
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
FROM_CHAIN="${FROM_CHAIN:-base}"
TO_CHAIN="${TO_CHAIN:-arbitrum}"
TOKEN="${TOKEN:-USDC}"
AMOUNT="${AMOUNT:-100000000}"

# CCTP V2 only routes USDC and only between these chains
CCTP_CHAINS="ethereum avalanche optimism arbitrum base polygon"
PROVIDERS=(lifi debridge)
if [[ "$TOKEN" == "USDC" ]] && [[ " $CCTP_CHAINS " == *" $TO_CHAIN "* ]] && [[ " $CCTP_CHAINS " == *" $FROM_CHAIN "* ]]; then
  PROVIDERS+=(cctp)
fi

echo "[bridge-quote] $AMOUNT $TOKEN: $FROM_CHAIN -> $TO_CHAIN" >&2
echo "[bridge-quote] providers: ${PROVIDERS[*]}" >&2

OUT="["
SEP=""
for P in "${PROVIDERS[@]}"; do
  echo "[bridge-quote] probing $P..." >&2
  RES=$("$DEFI" --json --chain "$FROM_CHAIN" bridge \
        --token "$TOKEN" --amount "$AMOUNT" --to-chain "$TO_CHAIN" --provider "$P" 2>/dev/null \
        || echo "{\"provider\":\"$P\",\"error\":\"probe_failed\"}")
  OUT="${OUT}${SEP}{\"provider\":\"$P\",\"result\":${RES}}"
  SEP=","
done
OUT="${OUT}]"
echo "$OUT"
