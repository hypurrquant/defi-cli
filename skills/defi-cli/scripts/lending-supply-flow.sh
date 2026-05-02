#!/usr/bin/env bash
# lending-supply-flow.sh — full lending-supply preview without broadcasting
# Walks: yield scan -> rates on chosen protocol -> existing position -> dry-run supply tx
# Usage: CHAIN=hyperevm PROTOCOL=hyperlend ASSET=USDC AMOUNT=1000000 bash lending-supply-flow.sh
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
CHAIN="${CHAIN:-hyperevm}"
PROTOCOL="${PROTOCOL:-hyperlend}"
ASSET="${ASSET:-USDC}"
AMOUNT="${AMOUNT:-1000000}"

echo "[1/4 lending-supply-flow] best $ASSET supply rates across all chains" >&2
"$DEFI" --json yield scan --asset "$ASSET" --fields chain,protocol,supply_apy 2>/dev/null || true

echo "[2/4 lending-supply-flow] rates for $PROTOCOL/$ASSET on $CHAIN" >&2
"$DEFI" --json --chain "$CHAIN" lending rates --protocol "$PROTOCOL" --asset "$ASSET"

echo "[3/4 lending-supply-flow] existing position on $PROTOCOL" >&2
"$DEFI" --json --chain "$CHAIN" lending position --protocol "$PROTOCOL" 2>/dev/null \
  || echo '{"position":null,"note":"no wallet configured or no position yet"}'

echo "[4/4 lending-supply-flow] DRY-RUN supply tx ($AMOUNT $ASSET) — review before --broadcast" >&2
"$DEFI" --json --chain "$CHAIN" lending supply \
  --protocol "$PROTOCOL" --asset "$ASSET" --amount "$AMOUNT"

echo "" >&2
echo "[lending-supply-flow] To execute: re-run step 4 with --broadcast" >&2
