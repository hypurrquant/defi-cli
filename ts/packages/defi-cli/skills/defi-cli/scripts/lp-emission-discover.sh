#!/usr/bin/env bash
# lp-emission-discover.sh — list active-emission LP pools on a chain, sorted by APR
# Usage: bash lp-emission-discover.sh <chain> [protocol]
# Examples:
#   bash lp-emission-discover.sh mantle merchantmoe-mantle
#   bash lp-emission-discover.sh base   aerodrome-cl
#   bash lp-emission-discover.sh hyperevm kittenswap
set -euo pipefail

DEFI="${DEFI_CMD:-defi}"
CHAIN="${1:-mantle}"
PROTOCOL="${2:-}"

if [[ -n "$PROTOCOL" ]]; then
  echo "[lp-emission-discover] $CHAIN/$PROTOCOL — emission-only, APR-sorted desc" >&2
  "$DEFI" --json --chain "$CHAIN" lp discover --protocol "$PROTOCOL" --emission-only
else
  echo "[lp-emission-discover] $CHAIN (all protocols) — emission-only, APR-sorted desc" >&2
  "$DEFI" --json --chain "$CHAIN" lp discover --emission-only
fi
