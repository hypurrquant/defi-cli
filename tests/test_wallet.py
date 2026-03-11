"""Tests for wallet management."""

from prepare import SELECTORS, TOKENS


def test_wallet_create():
    """Create a new wallet with valid Ethereum address and private key."""
    from defi_cli.wallet import create_wallet

    wallet = create_wallet()
    assert wallet["address"].startswith("0x")
    assert len(wallet["address"]) == 42
    assert wallet["private_key"].startswith("0x")
    assert len(wallet["private_key"]) == 66


def test_wallet_import_from_private_key(private_key):
    """Import wallet from a known private key and verify derived address."""
    from defi_cli.wallet import import_wallet

    expected_address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    wallet = import_wallet(private_key)
    assert wallet["address"].lower() == expected_address.lower()


def test_wallet_build_native_balance_call(sender):
    """Build correct eth_getBalance RPC call params."""
    from defi_cli.wallet import build_native_balance_call

    call = build_native_balance_call("arbitrum", sender)
    assert call["method"] == "eth_getBalance"
    assert sender in call["params"]


def test_wallet_build_token_balance_call(sender):
    """Build correct ERC20 balanceOf calldata targeting the right token contract."""
    from defi_cli.wallet import build_token_balance_call

    call = build_token_balance_call("arbitrum", "USDC", sender)
    # Must target the correct USDC contract
    assert call["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    # Calldata must start with balanceOf selector
    assert call["data"].startswith("0x" + SELECTORS["erc20_balanceOf"])
