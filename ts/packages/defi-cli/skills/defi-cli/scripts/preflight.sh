#!/usr/bin/env bash
# preflight.sh — verify defi-cli is installed and wallet is configured
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"

# Check install
if ! command -v "$DEFI" &>/dev/null; then
  echo '{"ok":false,"error":"defi-cli not found. Install: npm install -g @hypurrquant/defi-cli@latest"}' >&2
  exit 1
fi

VERSION=$("$DEFI" --version 2>/dev/null || echo "unknown")
echo "{\"ok\":true,\"version\":\"$VERSION\",\"wallet\":\"${DEFI_WALLET_ADDRESS:-not_set}\"}"
