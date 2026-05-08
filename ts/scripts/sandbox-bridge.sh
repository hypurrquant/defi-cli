#!/bin/sh
# Bridge-regression sandbox: validate all 4 providers on multiple chain pairs (dry-run).
set -e
CLI="/work/ts/packages/defi-cli/dist/main.js"
RECIPIENT="0x147F9D7d85E8CBb4871ba83C6491BDACC2431F0e"
NATIVE="0x0000000000000000000000000000000000000000"
PASS=0; FAIL=0

run_test() {
  desc="$1"; cmd="$2"; expect="$3"
  out=$(eval "$cmd" 2>&1 || true)
  if echo "$out" | grep -q "$expect"; then
    PASS=$((PASS+1)); printf '✅ %s\n' "$desc"
  else
    FAIL=$((FAIL+1)); printf '❌ %s\n   expected: %s\n   got: %s\n' "$desc" "$expect" "$(echo "$out" | head -c 300)"
  fi
}

echo "=== Bridge providers (dry-run) ==="

# LiFi: Base ETH → BNB native
run_test "lifi base→bnb native" \
  "node $CLI --chain base --json bridge --provider lifi --to-chain bnb --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "LI.FI'

# Relay: Base ETH → BNB native
run_test "relay base→bnb native" \
  "node $CLI --chain base --json bridge --provider relay --to-chain bnb --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "Relay bridge'

# deBridge: Base ETH → BNB native
run_test "debridge base→bnb native" \
  "node $CLI --chain base --json bridge --provider debridge --to-chain bnb --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "deBridge DLN'

# CCTP: Base USDC → Arbitrum USDC (with --auto-receive flag)
run_test "cctp base→arb USDC --auto-receive" \
  "node $CLI --chain base --json bridge --provider cctp --to-chain arbitrum --token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 1000000 --recipient $RECIPIENT --auto-receive" \
  '"description": "CCTP burn'

# Counter-direction
run_test "lifi bnb→base native" \
  "node $CLI --chain bnb --json bridge --provider lifi --to-chain base --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "LI.FI'

run_test "relay bnb→base native" \
  "node $CLI --chain bnb --json bridge --provider relay --to-chain base --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "Relay bridge'

run_test "debridge bnb→base native" \
  "node $CLI --chain bnb --json bridge --provider debridge --to-chain base --token $NATIVE --amount 100000000000000 --recipient $RECIPIENT" \
  '"description": "deBridge DLN'

# HyperEVM source via Relay
run_test "relay hyperevm→base HYPE" \
  "node $CLI --chain hyperevm --json bridge --provider relay --to-chain base --token $NATIVE --amount 100000000000000000 --recipient $RECIPIENT" \
  '"description": "Relay bridge'

echo
echo "=== Summary: $PASS pass / $FAIL fail ==="
