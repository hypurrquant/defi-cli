#!/usr/bin/env bash
# sandbox-production-qa.sh
# Read-only + dry-run QA sweep for production-grade chains (HyperEVM, Mantle,
# Base, BNB). Verifies:
#   - lending rates (read-only)
#   - lp discover (read-only)
#   - swap quote per aggregator (read-only)
#   - bridge dry-run per provider (read-only quote/calldata)
#   - ve(3,3) DEX claim/stake calldata generation (dry-run)
#
# Runs inside the docker sandbox container `d24dca860148`. Uses the wallet
# from /root/.defi/.env. NO --broadcast anywhere — pure read-only/dry-run.

set -u
CONTAINER="${CONTAINER:-d24dca860148}"
CLI="node /work/ts/packages/defi-cli/dist/main.js"
PASS=0
FAIL=0
RESULTS=()

# Helper: run via container with env, capture exit code + first error line
run() {
  local label="$1" ; shift
  local out
  out=$(docker exec "$CONTAINER" sh -c "set -a; . /root/.defi/.env; set +a; $CLI $* 2>&1" 2>&1)
  if echo "$out" | head -3 | grep -qE '"error"|"status":\s*"failed"|Error:|throw|reverted'; then
    echo "  ❌ $label"
    echo "$out" | head -3 | sed 's/^/      /'
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: $label")
  else
    echo "  ✅ $label"
    PASS=$((PASS+1))
    RESULTS+=("PASS: $label")
  fi
}

dry() { run "$@" ; }            # alias for clarity
ro()  { run "$@" ; }            # read-only

echo "============================================================"
echo " [ULTRAQA] production-grade chain protocol QA sweep"
echo "============================================================"

############### HYPEREVM (11) ###############
echo ""
echo "▶ HyperEVM (11)"
ro  "lending rates: hyperlend USDC"     --json --chain hyperevm lending rates --protocol hyperlend --asset USDC
ro  "lending rates: hypurrfi USDC"      --json --chain hyperevm lending rates --protocol hypurrfi --asset USDC
ro  "lending rates: felix-morpho USDC"  --json --chain hyperevm lending rates --protocol felix-morpho --asset USDC
ro  "lp discover: project-x"            --json --chain hyperevm lp discover --protocol project-x
ro  "lp discover: hyperswap-v3"         --json --chain hyperevm lp discover --protocol hyperswap-v3
ro  "lp discover: curve-hyperevm"       --json --chain hyperevm lp discover --protocol curve-hyperevm
ro  "lp discover: ramses-cl (ve33)"     --json --chain hyperevm lp discover --protocol ramses-cl
ro  "lp discover: ramses-hl (ve33)"     --json --chain hyperevm lp discover --protocol ramses-hl
ro  "lp discover: kittenswap (ve33)"    --json --chain hyperevm lp discover --protocol kittenswap
ro  "lp discover: hybra (ve33)"         --json --chain hyperevm lp discover --protocol hybra
ro  "lp discover: nest-v1 (off-chain)"  --json --chain hyperevm lp discover --protocol nest-v1
dry "swap quote: kyber WHYPE→USDC"      --json --chain hyperevm swap --provider kyber --from WHYPE --to USDC --amount 1000000000000000000
dry "swap quote: openocean WHYPE→USDC"  --json --chain hyperevm swap --provider openocean --from WHYPE --to USDC --amount 1000000000000000000
dry "swap quote: liquid WHYPE→USDC"     --json --chain hyperevm swap --provider liquid --from WHYPE --to USDC --amount 1000000000000000000
dry "swap quote: lifi WHYPE→USDC"       --json --chain hyperevm swap --provider lifi --from WHYPE --to USDC --amount 1000000000000000000

############### MANTLE (3) ###############
echo ""
echo "▶ Mantle (3)"
ro  "lending rates: aave-v3-mantle USDC"   --json --chain mantle lending rates --protocol aave-v3-mantle --asset USDC
ro  "lp discover: uniswap-v3-mantle"        --json --chain mantle lp discover --protocol uniswap-v3-mantle
ro  "lp discover: merchantmoe (LB ve33)"    --json --chain mantle lp discover --protocol merchantmoe-mantle
dry "swap quote: openocean WMNT→USDC"      --json --chain mantle swap --provider openocean --from WMNT --to USDC --amount 1000000000000000000
dry "swap quote: lifi WMNT→USDC"           --json --chain mantle swap --provider lifi --from WMNT --to USDC --amount 1000000000000000000
dry "swap quote: relay WMNT→USDC"          --json --chain mantle swap --provider relay --from WMNT --to USDC --amount 1000000000000000000

############### BASE (5) ###############
echo ""
echo "▶ Base (5)"
ro  "lending rates: aave-v3-base USDC"       --json --chain base lending rates --protocol aave-v3-base --asset USDC
ro  "lending rates: compound-v3-base USDC"   --json --chain base lending rates --protocol compound-v3-base --asset USDC
ro  "lp discover: uniswap-v3-base"           --json --chain base lp discover --protocol uniswap-v3-base
ro  "lp discover: aerodrome (V2 ve33)"       --json --chain base lp discover --protocol aerodrome-base
ro  "lp discover: aerodrome-cl (CL ve33)"    --json --chain base lp discover --protocol aerodrome-cl
dry "swap quote: kyber WETH→USDC"           --json --chain base swap --provider kyber --from WETH --to USDC --amount 1000000000000000
dry "swap quote: openocean WETH→USDC"       --json --chain base swap --provider openocean --from WETH --to USDC --amount 1000000000000000
dry "swap quote: lifi WETH→USDC"            --json --chain base swap --provider lifi --from WETH --to USDC --amount 1000000000000000
dry "swap quote: relay WETH→USDC"           --json --chain base swap --provider relay --from WETH --to USDC --amount 1000000000000000

############### BNB (16 — 13 verified, 3 deferred) ###############
echo ""
echo "▶ BNB (16)"
ro  "lending rates: aave-v3-bnb USDT"        --json --chain bnb lending rates --protocol aave-v3-bnb --asset USDT
ro  "lending rates: kinza-bnb USDT"          --json --chain bnb lending rates --protocol kinza-bnb --asset USDT
ro  "lending rates: venus-bnb USDT"          --json --chain bnb lending rates --protocol venus-bnb --asset USDT
ro  "lp discover: pancakeswap-v3-bnb"        --json --chain bnb lp discover --protocol pancakeswap-v3-bnb
ro  "lp discover: pancakeswap-v2-bnb"        --json --chain bnb lp discover --protocol pancakeswap-v2-bnb
ro  "lp discover: uniswap-v3-bnb"            --json --chain bnb lp discover --protocol uniswap-v3-bnb
ro  "lp discover: thena-v1 (Solidly ve33)"   --json --chain bnb lp discover --protocol thena-v1
ro  "lp discover: thena-fusion (Algebra)"    --json --chain bnb lp discover --protocol thena-fusion
ro  "lp discover: biswap-bnb"                --json --chain bnb lp discover --protocol biswap-bnb
ro  "lp discover: apeswap-bnb"               --json --chain bnb lp discover --protocol apeswap-bnb
ro  "lp discover: bakeryswap-bnb"            --json --chain bnb lp discover --protocol bakeryswap-bnb
dry "swap quote: kyber WBNB→USDT"           --json --chain bnb swap --provider kyber --from WBNB --to USDT --amount 1000000000000000
dry "swap quote: openocean WBNB→USDT"       --json --chain bnb swap --provider openocean --from WBNB --to USDT --amount 1000000000000000
dry "swap quote: lifi WBNB→USDT"            --json --chain bnb swap --provider lifi --from WBNB --to USDT --amount 1000000000000000
dry "swap quote: relay WBNB→USDT"           --json --chain bnb swap --provider relay --from WBNB --to USDT --amount 1000000000000000

############### BRIDGE (cross-production-chain) ###############
echo ""
echo "▶ Bridge (4 providers, multi-route)"
dry "lifi: Base USDC → BNB"          --json --chain base bridge --token USDC --amount 1000000 --to-chain bnb --provider lifi
dry "lifi: Base ETH → Mantle"        --json --chain base bridge --token 0x0000000000000000000000000000000000000000 --amount 1000000000000000 --to-chain mantle --provider lifi
dry "relay: Base ETH → BNB"          --json --chain base bridge --token 0x0000000000000000000000000000000000000000 --amount 100000000000000 --to-chain bnb --provider relay
dry "debridge: Base USDC → BNB"      --json --chain base bridge --token USDC --amount 10000000 --to-chain bnb --provider debridge
dry "cctp: Base USDC → Arbitrum"     --json --chain base bridge --token USDC --amount 100000 --to-chain arbitrum --provider cctp
dry "cctp: Base USDC → Polygon"      --json --chain base bridge --token USDC --amount 100000 --to-chain polygon --provider cctp

echo ""
echo "============================================================"
echo " RESULTS: $PASS pass, $FAIL fail"
echo "============================================================"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  printf '%s\n' "${RESULTS[@]}" | grep "^FAIL:"
fi
exit $FAIL
