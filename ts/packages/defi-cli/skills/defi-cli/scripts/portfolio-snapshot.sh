#!/usr/bin/env bash
# portfolio-snapshot.sh — take a portfolio snapshot and print PnL since last snapshot
# Usage: WALLET=0xABC... bash portfolio-snapshot.sh [chain]
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
WALLET="${DEFI_WALLET_ADDRESS:-${WALLET:-}}"
CHAIN="${1:-hyperevm}"

if [[ -z "$WALLET" ]]; then
  echo '{"error":"Set DEFI_WALLET_ADDRESS or WALLET env var"}' >&2
  exit 1
fi

echo "[portfolio] Taking snapshot for $WALLET on $CHAIN..." >&2
"$DEFI" --json --chain "$CHAIN" portfolio snapshot --address "$WALLET"

echo "[portfolio] Calculating PnL..." >&2
"$DEFI" --json --chain "$CHAIN" portfolio pnl --address "$WALLET" || true
