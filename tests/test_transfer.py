"""Tests for token transfer utilities."""

from prepare import CHAINS, SELECTORS, TOKENS


def test_erc20_transfer_tx():
    """ERC20 transfer targets token with correct selector."""
    from defi_cli.transfer import build_erc20_transfer_tx

    tx = build_erc20_transfer_tx(
        chain="arbitrum",
        token="USDC",
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount=1_000_000,
    )

    assert tx["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert tx["data"][:10] == "0x" + SELECTORS["erc20_transfer"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]
    assert tx["value"] == 0


def test_erc20_transfer_data_length():
    """ERC20 transfer data is selector + address + uint256."""
    from defi_cli.transfer import build_erc20_transfer_tx

    tx = build_erc20_transfer_tx(
        chain="base",
        token="USDC",
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount=5_000_000,
    )

    # 0x + selector(8) + address(64) + uint256(64) = 2 + 136 = 138
    assert len(tx["data"]) == 2 + 8 + 128


def test_native_transfer_tx():
    """Native transfer has value and empty data."""
    from defi_cli.transfer import build_native_transfer_tx

    tx = build_native_transfer_tx(
        chain="arbitrum",
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount_wei=10**18,
    )

    assert tx["to"] == "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    assert tx["data"] == "0x"
    assert tx["value"] == 10**18
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_native_transfer_hyperevm():
    """Native transfer on HyperEVM uses correct chain ID."""
    from defi_cli.transfer import build_native_transfer_tx

    tx = build_native_transfer_tx(
        chain="hyperevm",
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount_wei=100 * 10**18,
    )

    assert tx["chainId"] == 999
