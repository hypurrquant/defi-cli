"""Tests for token decimal handling."""


def test_get_decimals():
    """Known tokens return correct decimals."""
    from defi_cli.decimals import get_decimals

    assert get_decimals("USDC") == 6
    assert get_decimals("WETH") == 18
    assert get_decimals("feUSD") == 18
    assert get_decimals("USDT0") == 6


def test_to_raw():
    """Convert human amounts to raw."""
    from defi_cli.decimals import to_raw

    assert to_raw(1.5, "USDC") == 1_500_000
    assert to_raw(1.0, "WETH") == 10**18
    assert to_raw(100.0, "feUSD") == 100 * 10**18


def test_to_human():
    """Convert raw amounts to human."""
    from defi_cli.decimals import to_human

    assert to_human(1_500_000, "USDC") == 1.5
    assert to_human(10**18, "WETH") == 1.0
    assert to_human(50 * 10**18, "WHYPE") == 50.0


def test_format_amount():
    """Format amounts with token symbol."""
    from defi_cli.decimals import format_amount

    assert format_amount(1_500_000, "USDC") == "1.5000 USDC"
    assert format_amount(10**18, "WETH") == "1.0000 WETH"
    assert format_amount(10**18, "WETH", precision=2) == "1.00 WETH"


def test_to_raw_roundtrip():
    """Raw -> human -> raw roundtrips correctly."""
    from defi_cli.decimals import to_human, to_raw

    original = 1_234_567
    human = to_human(original, "USDC")
    back = to_raw(human, "USDC")
    assert back == original


def test_build_balanceof_call():
    """Balance call includes token metadata."""
    from defi_cli.decimals import build_balanceof_call

    call = build_balanceof_call(
        chain="arbitrum",
        token="USDC",
        address="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert call["token"] == "USDC"
    assert call["decimals"] == 6
    assert call["data"][:10] == "0x70a08231"
