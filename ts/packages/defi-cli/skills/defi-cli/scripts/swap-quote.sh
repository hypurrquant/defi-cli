#!/usr/bin/env bash
# swap-quote.sh — dry-run a swap across every aggregator that supports the chain
# Picks the best amount_out and prints a side-by-side comparison.
# Usage: CHAIN=base FROM=WETH TO=USDC AMOUNT=1000000000000000000 bash swap-quote.sh
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
CHAIN="${CHAIN:-hyperevm}"
FROM="${FROM:-WHYPE}"
TO="${TO:-USDC}"
AMOUNT="${AMOUNT:-1000000000000000000}"
SLIPPAGE="${SLIPPAGE:-50}"

case "$CHAIN" in
  hyperevm) PROVIDERS=(kyber openocean liquid lifi relay) ;;
  mantle)   PROVIDERS=(openocean lifi relay) ;;
  base)     PROVIDERS=(kyber openocean lifi relay) ;;
  bnb)      PROVIDERS=(kyber openocean lifi relay) ;;
  monad)    PROVIDERS=(lifi relay) ;;
  *) echo "{\"error\":\"unknown chain: $CHAIN (expected hyperevm|mantle|base|bnb|monad)\"}" >&2; exit 1 ;;
esac

echo "[swap-quote] $CHAIN: $AMOUNT $FROM -> $TO @ ${SLIPPAGE}bps slippage" >&2
echo "[swap-quote] providers: ${PROVIDERS[*]}" >&2

OUT="["
SEP=""
for P in "${PROVIDERS[@]}"; do
  echo "[swap-quote] probing $P..." >&2
  RES=$("$DEFI" --json --chain "$CHAIN" swap --provider "$P" \
        --from "$FROM" --to "$TO" --amount "$AMOUNT" --slippage "$SLIPPAGE" 2>/dev/null \
        || echo "{\"provider\":\"$P\",\"error\":\"probe_failed\"}")
  OUT="${OUT}${SEP}{\"provider\":\"$P\",\"result\":${RES}}"
  SEP=","
done
OUT="${OUT}]"
echo "$OUT"
