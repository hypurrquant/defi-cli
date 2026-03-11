"""Live dry-run tests against real RPCs.

These tests make actual network calls. Run with:
    uv run pytest tests/test_live_dryrun.py -m live --timeout=30

Skip by default in CI/normal test runs.
"""

import pytest

from prepare import PROTOCOLS, TOKENS

SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# Mark all tests in this file as "live"
pytestmark = pytest.mark.live


@pytest.fixture(autouse=True)
def skip_if_no_live(request):
    """Skip live tests unless -m live is passed."""
    if "live" not in request.config.option.markexpr:
        pytest.skip("Live tests skipped (use -m live to run)")


def test_live_balance_query():
    """Query native balance on Arbitrum via real RPC."""
    from defi_cli.fetcher import fetch_balance

    result = fetch_balance("arbitrum", SENDER)
    # Should succeed (even if balance is 0)
    assert result["success"] is True
    assert result["balance_wei"] >= 0


def test_live_token_balance():
    """Query USDC balance on Arbitrum."""
    from defi_cli.fetcher import fetch_token_balance

    result = fetch_token_balance("arbitrum", "USDC", SENDER)
    assert result["success"] is True
    assert result["balance_raw"] >= 0


def test_live_gas_price():
    """Query gas price on Arbitrum."""
    from defi_cli.gas import get_gas_price

    result = get_gas_price("arbitrum")
    assert result["success"] is True
    assert result["gas_price_wei"] > 0
    assert result["gas_price_gwei"] > 0


def test_live_asset_price():
    """Query WETH price from Aave oracle on Arbitrum."""
    from defi_cli.fetcher import fetch_asset_price

    result = fetch_asset_price("aave_v3", "arbitrum", "WETH")
    if result["success"]:
        # ETH price should be > $100
        assert result["price_usd"] > 100


def test_live_lending_rates():
    """Query USDC lending rates on Aave V3 Arbitrum."""
    from defi_cli.fetcher import eth_call
    from defi_cli.rates import build_rate_comparison_calls, parse_reserve_data

    calls = build_rate_comparison_calls(
        "USDC",
        protocols_chains=[("aave_v3", "arbitrum")],
    )
    assert len(calls) == 1

    result = eth_call("arbitrum", calls[0]["call"])
    if result["success"]:
        parsed = parse_reserve_data(result["result"])
        # Rates should be non-negative
        assert parsed["supply_apy"] >= 0
        assert parsed["borrow_apy"] >= 0


def test_live_dry_run_balance_of():
    """Dry-run a balanceOf call on Arbitrum."""
    from defi_cli.fetcher import eth_call
    from defi_cli.decimals import build_balanceof_call

    call = build_balanceof_call("arbitrum", "USDC", SENDER)
    result = eth_call("arbitrum", call)
    assert result["success"] is True
    assert result["result"].startswith("0x")


def test_live_multicall():
    """Execute a multicall on Arbitrum."""
    from defi_cli.fetcher import eth_call
    from defi_cli.multicall import build_balance_multicall

    tx = build_balance_multicall(
        chain="arbitrum",
        tokens=["USDC", "WETH"],
        address=SENDER,
    )

    result = eth_call("arbitrum", tx)
    # Multicall3 should always succeed
    assert result["success"] is True
