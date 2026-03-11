"""Tests for liquidation monitoring."""

from prepare import PROTOCOLS


def test_assess_health_safe():
    """No debt = safe position."""
    from defi_cli.liquidation import assess_health

    result = assess_health({
        "total_collateral_base": 10000 * 10**8,
        "total_debt_base": 0,
        "available_borrows_base": 8000 * 10**8,
        "current_liquidation_threshold": 8500,
        "ltv": 8000,
        "health_factor": 0,
    })

    assert result["health_status"] == "safe"
    assert result["risk_level"] == "none"


def test_assess_health_healthy():
    """Health factor > 2 = healthy."""
    from defi_cli.liquidation import assess_health

    result = assess_health({
        "total_collateral_base": 10000 * 10**8,
        "total_debt_base": 3000 * 10**8,
        "available_borrows_base": 5000 * 10**8,
        "current_liquidation_threshold": 8500,
        "ltv": 8000,
        "health_factor": 25 * 10**17,  # 2.5
    })

    assert result["health_status"] == "healthy"
    assert result["health_factor"] == 2.5


def test_assess_health_at_risk():
    """Health factor < 1.5 but > 1.1 = at_risk."""
    from defi_cli.liquidation import assess_health

    result = assess_health({
        "total_collateral_base": 10000 * 10**8,
        "total_debt_base": 8000 * 10**8,
        "available_borrows_base": 0,
        "current_liquidation_threshold": 8500,
        "ltv": 8000,
        "health_factor": 12 * 10**17,  # 1.2
    })

    assert result["health_status"] == "at_risk"
    assert result["risk_level"] == "high"
    assert len(result["recommendations"]) > 0


def test_assess_health_critical():
    """Health factor < 1.1 = critical."""
    from defi_cli.liquidation import assess_health

    result = assess_health({
        "total_collateral_base": 10000 * 10**8,
        "total_debt_base": 9500 * 10**8,
        "available_borrows_base": 0,
        "current_liquidation_threshold": 8500,
        "ltv": 8000,
        "health_factor": 105 * 10**16,  # 1.05
    })

    assert result["health_status"] == "critical"
    assert result["risk_level"] == "critical"
    assert "IMMEDIATE" in result["recommendations"][0]


def test_assess_health_usd_values():
    """USD values are correctly converted from 8-decimal base."""
    from defi_cli.liquidation import assess_health

    result = assess_health({
        "total_collateral_base": 10000 * 10**8,
        "total_debt_base": 5000 * 10**8,
        "available_borrows_base": 3000 * 10**8,
        "current_liquidation_threshold": 8500,
        "ltv": 8000,
        "health_factor": 17 * 10**17,
    })

    assert result["total_collateral_usd"] == 10000.0
    assert result["total_debt_usd"] == 5000.0
    assert result["available_borrows_usd"] == 3000.0


def test_liquidation_call_structure():
    """liquidationCall targets pool with correct selector."""
    from defi_cli.liquidation import build_liquidation_call

    tx = build_liquidation_call(
        protocol="aave_v3",
        chain="arbitrum",
        collateral_asset="WETH",
        debt_asset="USDC",
        user="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        debt_to_cover=1_000_000,
    )

    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == pool.lower()
    assert tx["data"][:10] == "0x00a718a9"
    assert tx["chainId"] == 42161
