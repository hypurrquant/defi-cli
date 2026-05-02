#!/usr/bin/env bash
# wallet-status.sh — print configured wallet + native balance on every supported chain
# Usage: bash wallet-status.sh
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
CHAINS=(hyperevm mantle base bnb monad)

echo "[wallet-status] resolving configured wallet..." >&2
ADDR_JSON=$("$DEFI" --json wallet address)
echo "$ADDR_JSON"

# Extract null check without jq dependency: address field is "null" when unset.
if echo "$ADDR_JSON" | grep -q '"address":null'; then
  echo "[wallet-status] no wallet configured — skipping per-chain balances" >&2
  echo "[wallet-status] To configure: export DEFI_WALLET_ADDRESS=0x... or run 'defi setup'" >&2
  exit 0
fi

OUT="["
SEP=""
for C in "${CHAINS[@]}"; do
  echo "[wallet-status] probing native balance on $C..." >&2
  RES=$("$DEFI" --json --chain "$C" wallet balance 2>/dev/null \
        || echo "{\"chain\":\"$C\",\"error\":\"rpc_unreachable\"}")
  OUT="${OUT}${SEP}${RES}"
  SEP=","
done
OUT="${OUT}]"
echo "$OUT"
