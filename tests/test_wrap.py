"""Tests for wrap/unwrap operations."""

from prepare import CHAINS, TOKENS


def test_wrap_eth_arbitrum():
    """Wrap ETH on Arbitrum targets WETH contract."""
    from defi_cli.wrap import DEPOSIT_SELECTOR, build_wrap_tx

    tx = build_wrap_tx("arbitrum", 10**18)

    assert tx["to"].lower() == TOKENS["arbitrum"]["WETH"].lower()
    assert tx["data"] == "0x" + DEPOSIT_SELECTOR
    assert tx["value"] == 10**18
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_wrap_hype_hyperevm():
    """Wrap HYPE on HyperEVM targets WHYPE contract."""
    from defi_cli.wrap import build_wrap_tx

    tx = build_wrap_tx("hyperevm", 100 * 10**18)

    assert tx["to"].lower() == TOKENS["hyperevm"]["WHYPE"].lower()
    assert tx["value"] == 100 * 10**18
    assert tx["chainId"] == 999


def test_unwrap_weth():
    """Unwrap WETH to ETH uses withdraw selector."""
    from defi_cli.wrap import WITHDRAW_SELECTOR, build_unwrap_tx

    tx = build_unwrap_tx("arbitrum", 5 * 10**18)

    assert tx["to"].lower() == TOKENS["arbitrum"]["WETH"].lower()
    assert tx["data"][:10] == "0x" + WITHDRAW_SELECTOR
    assert tx["value"] == 0
    # Data: selector(8) + uint256(64) = 72 hex chars + 0x prefix
    assert len(tx["data"]) == 2 + 8 + 64


def test_unwrap_whype():
    """Unwrap WHYPE to HYPE."""
    from defi_cli.wrap import build_unwrap_tx

    tx = build_unwrap_tx("hyperevm", 50 * 10**18)

    assert tx["to"].lower() == TOKENS["hyperevm"]["WHYPE"].lower()
    assert tx["chainId"] == 999


def test_get_wrapped_native():
    """Get wrapped native token address."""
    from defi_cli.wrap import get_wrapped_native

    assert get_wrapped_native("arbitrum").lower() == TOKENS["arbitrum"]["WETH"].lower()
    assert get_wrapped_native("base").lower() == TOKENS["base"]["WETH"].lower()
    assert get_wrapped_native("hyperevm").lower() == TOKENS["hyperevm"]["WHYPE"].lower()
