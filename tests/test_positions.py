"""Tests for position tracking."""

from eth_abi import encode

from prepare import PROTOCOLS, SELECTORS


def test_user_account_data_call_structure():
    """getUserAccountData targets pool with correct selector."""
    from defi_cli.positions import build_user_account_data_call

    call = build_user_account_data_call(
        protocol="aave_v3",
        chain="arbitrum",
        user="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert call["to"].lower() == pool.lower()
    assert call["data"][:10] == "0x" + SELECTORS["aave_getUserAccountData"]
    assert call["chainId"] == 42161


def test_reserve_data_call_structure():
    """getReserveData targets pool with correct selector."""
    from defi_cli.positions import build_reserve_data_call

    call = build_reserve_data_call(
        protocol="aave_v3",
        chain="arbitrum",
        asset="USDC",
    )

    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert call["to"].lower() == pool.lower()
    assert call["data"][:10] == "0x" + SELECTORS["aave_getReserveData"]


def test_multi_position_calls_all_lending():
    """Multi-position queries all lending protocols."""
    from defi_cli.positions import build_multi_position_calls

    results = build_multi_position_calls(
        user="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    # aave_v3 (arb, base), hyperlend (hyperevm), hypurrfi (hyperevm) = 4
    assert len(results) >= 4
    protocols = {r["protocol"] for r in results}
    assert "aave_v3" in protocols
    assert "hyperlend" in protocols


def test_multi_position_calls_filtered():
    """Multi-position with specific protocols."""
    from defi_cli.positions import build_multi_position_calls

    results = build_multi_position_calls(
        user="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        protocols_chains=[("aave_v3", "arbitrum")],
    )

    assert len(results) == 1
    assert results[0]["protocol"] == "aave_v3"
    assert results[0]["chain"] == "arbitrum"


def test_parse_user_account_data():
    """Parse getUserAccountData return values."""
    from defi_cli.positions import parse_user_account_data

    # Simulate: 10000e8 collateral, 5000e8 debt, 3000e8 available,
    # threshold 8500, ltv 8000, health_factor 1.7e18
    raw = encode(
        ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [
            10000 * 10**8,
            5000 * 10**8,
            3000 * 10**8,
            8500,
            8000,
            17 * 10**17,  # 1.7e18
        ],
    )

    parsed = parse_user_account_data("0x" + raw.hex())
    assert parsed["total_collateral_base"] == 10000 * 10**8
    assert parsed["total_debt_base"] == 5000 * 10**8
    assert parsed["health_factor"] == 17 * 10**17
    assert parsed["ltv"] == 8000
