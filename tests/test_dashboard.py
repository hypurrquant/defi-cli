"""Tests for yield dashboard and portfolio aggregation."""

from unittest.mock import patch


def test_fetch_all_rates_mocked():
    """fetch_all_rates aggregates rates across protocols."""
    from defi_cli.dashboard import fetch_all_rates

    mock_rates = [
        {"protocol": "aave_v3", "chain": "arbitrum", "call": {"to": "0x1", "data": "0x2"}},
    ]
    mock_rpc = {"success": True, "result": "0x" + "00" * 480}
    mock_parsed = {"supply_apy": 5.0, "borrow_apy": 3.0}

    with (
        patch("defi_cli.rates.build_rate_comparison_calls", return_value=mock_rates),
        patch("defi_cli.fetcher.eth_call", return_value=mock_rpc),
        patch("defi_cli.rates.parse_reserve_data", return_value=mock_parsed),
    ):
        results = fetch_all_rates(["USDC"])

    assert len(results) == 1
    assert results[0]["asset"] == "USDC"
    assert results[0]["supply_apy"] == 5.0
    assert results[0]["borrow_apy"] == 3.0


def test_fetch_all_rates_default_assets():
    """Default assets are USDC and WETH."""
    from defi_cli.dashboard import fetch_all_rates

    called_assets = []

    def mock_build(asset):
        called_assets.append(asset)
        return []

    with patch("defi_cli.rates.build_rate_comparison_calls", side_effect=mock_build):
        fetch_all_rates()

    assert "USDC" in called_assets
    assert "WETH" in called_assets


def test_fetch_portfolio_mocked():
    """fetch_portfolio returns native and token balances."""
    from defi_cli.dashboard import fetch_portfolio

    native_result = {"success": True, "balance_wei": 10**18, "balance_eth": 1.0}
    token_result = {"success": True, "balance_raw": 1000 * 10**6, "token": "USDC"}

    with (
        patch("defi_cli.fetcher.fetch_balance", return_value=native_result),
        patch("defi_cli.fetcher.fetch_token_balance", return_value=token_result),
    ):
        result = fetch_portfolio("arbitrum", "0x" + "ab" * 20, ["USDC"])

    assert result["chain"] == "arbitrum"
    assert result["native"]["balance_eth"] == 1.0
    assert len(result["tokens"]) == 1
    assert result["tokens"][0]["token"] == "USDC"


def test_fetch_portfolio_zero_balance():
    """Tokens with zero balance are filtered out."""
    from defi_cli.dashboard import fetch_portfolio

    native_result = {"success": True, "balance_wei": 0, "balance_eth": 0.0}
    token_result = {"success": True, "balance_raw": 0, "token": "USDC"}

    with (
        patch("defi_cli.fetcher.fetch_balance", return_value=native_result),
        patch("defi_cli.fetcher.fetch_token_balance", return_value=token_result),
    ):
        result = fetch_portfolio("arbitrum", "0x" + "ab" * 20, ["USDC"])

    assert result["tokens"] == []


def test_build_yield_summary():
    """build_yield_summary annotates best supply and cheapest borrow."""
    from defi_cli.dashboard import build_yield_summary

    rates = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 5.0, "borrow_apy": 3.0},
        {"protocol": "hyperlend", "chain": "hyperEVM", "asset": "USDC",
         "supply_apy": 8.0, "borrow_apy": 6.0},
        {"protocol": "aave_v3", "chain": "base", "asset": "USDC",
         "supply_apy": 4.0, "borrow_apy": 2.5},
    ]

    summary = build_yield_summary(rates)

    assert len(summary) == 3
    # First should be highest supply APY
    assert summary[0]["supply_apy"] == 8.0
    assert summary[0]["best_supply"] is True
    # Last should have cheapest borrow
    cheapest = [s for s in summary if s["cheapest_borrow"]]
    assert cheapest[0]["borrow_apy"] == 2.5


def test_build_yield_summary_top_n():
    """build_yield_summary respects top_n limit."""
    from defi_cli.dashboard import build_yield_summary

    rates = [
        {"protocol": f"p{i}", "chain": "arb", "asset": "USDC",
         "supply_apy": float(i), "borrow_apy": float(i)}
        for i in range(20)
    ]

    summary = build_yield_summary(rates, top_n=5)
    assert len(summary) == 5


def test_build_yield_summary_multi_asset():
    """build_yield_summary handles multiple assets correctly."""
    from defi_cli.dashboard import build_yield_summary

    rates = [
        {"protocol": "aave_v3", "chain": "arb", "asset": "USDC",
         "supply_apy": 5.0, "borrow_apy": 3.0},
        {"protocol": "aave_v3", "chain": "arb", "asset": "WETH",
         "supply_apy": 2.0, "borrow_apy": 4.0},
    ]

    summary = build_yield_summary(rates)
    assert len(summary) == 2
    assert all(s["best_supply"] for s in summary)
