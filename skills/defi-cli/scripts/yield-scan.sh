#!/usr/bin/env bash
# yield-scan.sh — scan all chains for best yield on an asset
# Usage: ASSET=USDC bash yield-scan.sh
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
ASSET="${ASSET:-USDC}"

echo "[yield-scan] Scanning all chains for $ASSET yield opportunities..." >&2
"$DEFI" --json yield scan --asset "$ASSET"
