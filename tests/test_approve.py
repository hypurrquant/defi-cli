"""Tests for ERC20 approval utilities."""

from prepare import CHAINS, SELECTORS, TOKENS


def test_approve_tx_correct_target(sender):
    """Approve tx targets the correct token contract."""
    from defi_cli.approve import build_approve_tx

    spender = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  # Aave pool
    tx = build_approve_tx(
        chain="arbitrum",
        token="USDC",
        spender=spender,
    )

    assert tx["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert tx["data"][:10] == "0x" + SELECTORS["erc20_approve"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_approve_tx_max_amount():
    """Default approval is max uint256."""
    from defi_cli.approve import build_approve_tx

    tx = build_approve_tx(
        chain="arbitrum",
        token="USDC",
        spender="0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    )

    # The data should encode max uint256 (all ff's in the amount slot)
    # Selector (4) + address (32) + uint256 (32) = 68 bytes = 136 hex chars + 0x = 138
    assert len(tx["data"]) == 2 + 8 + 128  # 0x + selector + 2 params


def test_check_allowance_call():
    """Build correct allowance check call."""
    from defi_cli.approve import build_check_allowance_call

    owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    spender = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"

    call = build_check_allowance_call(
        chain="arbitrum",
        token="USDC",
        owner=owner,
        spender=spender,
    )

    assert call["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert call["data"][:10] == "0xdd62ed3e"  # allowance(address,address)
