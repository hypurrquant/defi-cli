"""Tests for calldata decoder."""

from prepare import SELECTORS


def test_identify_approve():
    """Identify ERC20 approve from calldata."""
    from defi_cli.decoder import identify_function

    data = "0x" + SELECTORS["erc20_approve"] + "00" * 64
    result = identify_function(data)

    assert result["known"] is True
    assert result["name"] == "erc20.approve"
    assert result["selector"] == SELECTORS["erc20_approve"]


def test_identify_supply():
    """Identify Aave supply from calldata."""
    from defi_cli.decoder import identify_function

    data = "0x" + SELECTORS["aave_supply"] + "00" * 128
    result = identify_function(data)

    assert result["known"] is True
    assert result["name"] == "aave.supply"


def test_identify_unknown():
    """Unknown selector returns known=False."""
    from defi_cli.decoder import identify_function

    result = identify_function("0xdeadbeef" + "00" * 32)
    assert result["known"] is False
    assert "deadbeef" in result["name"]


def test_decode_approve_calldata():
    """Decode ERC20 approve calldata into params."""
    from defi_cli.approve import build_approve_tx
    from defi_cli.decoder import decode_calldata

    tx = build_approve_tx(
        chain="arbitrum", token="USDC",
        spender="0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        amount=1_000_000,
    )

    decoded = decode_calldata(tx["data"])
    assert decoded["name"] == "erc20.approve"
    assert decoded["params"] is not None
    assert len(decoded["params"]) == 2
    # First param is spender address
    assert decoded["params"][0].lower() == "0x794a61358D6845594F94dc1DB02A252b5b4814aD".lower()
    # Second param is amount
    assert decoded["params"][1] == 1_000_000


def test_decode_transfer_calldata():
    """Decode ERC20 transfer calldata."""
    from defi_cli.decoder import decode_calldata
    from defi_cli.transfer import build_erc20_transfer_tx

    tx = build_erc20_transfer_tx(
        chain="arbitrum", token="USDC",
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount=500_000,
    )

    decoded = decode_calldata(tx["data"])
    assert decoded["name"] == "erc20.transfer"
    assert decoded["params"][1] == 500_000


def test_decode_wrap_deposit():
    """Decode WETH deposit (no params)."""
    from defi_cli.decoder import decode_calldata

    decoded = decode_calldata("0xd0e30db0")
    assert decoded["name"] == "weth.deposit"
    assert decoded["params"] == []


def test_decode_short_data():
    """Short/empty data returns unknown."""
    from defi_cli.decoder import decode_calldata

    decoded = decode_calldata("0x")
    assert decoded["name"] == "unknown"
