#!/usr/bin/env bash
# lp-claim-all.sh — list every LP position on a chain that has pending rewards,
# then print the claim CLI command for each (DRY-RUN guidance only — does not broadcast).
# Usage: WALLET=0xABC... bash lp-claim-all.sh <chain>
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
CHAIN="${1:-mantle}"
WALLET="${DEFI_WALLET_ADDRESS:-${WALLET:-}}"

if [[ -z "$WALLET" ]]; then
  echo '{"error":"Set DEFI_WALLET_ADDRESS or WALLET env var to scan positions"}' >&2
  exit 1
fi

echo "[lp-claim-all] $CHAIN: scanning all LP positions for $WALLET" >&2
"$DEFI" --json --chain "$CHAIN" lp positions --address "$WALLET"

echo "" >&2
echo "[lp-claim-all] To claim a specific position, use one of:" >&2
echo "  V3 fees:        defi --json --chain $CHAIN lp claim --protocol <slug> --token-id <id> --broadcast" >&2
echo "  Solidly gauge:  defi --json --chain $CHAIN lp claim --protocol <slug> --gauge <addr> --broadcast" >&2
echo "  Slipstream NFT: defi --json --chain $CHAIN lp claim --protocol <slug> --gauge <addr> --token-id <id> --broadcast" >&2
echo "  Merchant Moe:   defi --json --chain $CHAIN lp claim --protocol merchantmoe-mantle --pool <addr> --broadcast" >&2
echo "  KittenSwap:     defi --json --chain $CHAIN lp claim --protocol kittenswap --pool <addr> --token-id <id> --broadcast" >&2
