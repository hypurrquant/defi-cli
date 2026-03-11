"""Tests for real-time rate fetching and parsing."""

from eth_abi import encode


def test_parse_reserve_data():
    """Parse Aave V3 getReserveData into APY values."""
    from defi_cli.rates import parse_reserve_data

    ray = 10**27
    # 5% supply rate, 8% borrow rate
    supply_rate = int(0.05 * ray)
    borrow_rate = int(0.08 * ray)

    raw = encode(
        [
            "uint256", "uint128", "uint128", "uint128", "uint128",
            "uint128", "uint40", "uint16",
            "address", "address", "address", "address",
            "uint128", "uint128", "uint128",
        ],
        [
            0,                   # configuration
            10**27,              # liquidityIndex (1 RAY)
            supply_rate,         # currentLiquidityRate
            10**27,              # variableBorrowIndex
            borrow_rate,         # currentVariableBorrowRate
            0,                   # currentStableBorrowRate
            0,                   # lastUpdateTimestamp
            0,                   # id
            "0x" + "00" * 20,    # aTokenAddress
            "0x" + "00" * 20,    # stableDebtTokenAddress
            "0x" + "00" * 20,    # variableDebtTokenAddress
            "0x" + "00" * 20,    # interestRateStrategyAddress
            0, 0, 0,             # accruedToTreasury, unbacked, isolation
        ],
    )

    parsed = parse_reserve_data("0x" + raw.hex())

    assert abs(parsed["supply_apy"] - 5.0) < 0.01
    assert abs(parsed["borrow_apy"] - 8.0) < 0.01


def test_parse_reserve_data_zero_rates():
    """Zero rates parse correctly."""
    from defi_cli.rates import parse_reserve_data

    raw = encode(
        [
            "uint256", "uint128", "uint128", "uint128", "uint128",
            "uint128", "uint40", "uint16",
            "address", "address", "address", "address",
            "uint128", "uint128", "uint128",
        ],
        [
            0, 10**27, 0, 10**27, 0, 0, 0, 0,
            "0x" + "00" * 20, "0x" + "00" * 20,
            "0x" + "00" * 20, "0x" + "00" * 20,
            0, 0, 0,
        ],
    )

    parsed = parse_reserve_data("0x" + raw.hex())
    assert parsed["supply_apy"] == 0.0
    assert parsed["borrow_apy"] == 0.0


def test_build_rate_comparison_calls():
    """Build rate comparison calls for USDC across protocols."""
    from defi_cli.rates import build_rate_comparison_calls

    calls = build_rate_comparison_calls("USDC")

    # Should find USDC on: aave_v3 arb, aave_v3 base, hyperlend, hypurrfi
    assert len(calls) >= 3
    protocols = {c["protocol"] for c in calls}
    assert "aave_v3" in protocols


def test_build_rate_comparison_filtered():
    """Build rate comparison with specific protocols."""
    from defi_cli.rates import build_rate_comparison_calls

    calls = build_rate_comparison_calls(
        "USDC",
        protocols_chains=[("aave_v3", "arbitrum")],
    )

    assert len(calls) == 1
    assert calls[0]["protocol"] == "aave_v3"
    assert calls[0]["chain"] == "arbitrum"
