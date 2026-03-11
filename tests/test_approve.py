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


def test_revoke_tx():
    """Revoke sets approval amount to 0."""
    from defi_cli.approve import build_revoke_tx

    spender = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
    tx = build_revoke_tx(chain="arbitrum", token="USDC", spender=spender)

    assert tx["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert tx["data"][:10] == "0x" + SELECTORS["erc20_approve"]
    # Amount should be 0 encoded as uint256 (32 zero bytes)
    amount_hex = tx["data"][74:]  # skip selector(8) + address(64) + 0x prefix(2)
    assert int(amount_hex, 16) == 0


def test_batch_allowance_calls():
    """build_batch_allowance_calls creates cartesian product."""
    from defi_cli.approve import build_batch_allowance_calls

    owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    tokens = ["USDC", "WETH"]
    spenders = [
        "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    ]

    calls = build_batch_allowance_calls("arbitrum", owner, tokens, spenders)
    assert len(calls) == 4  # 2 tokens × 2 spenders
    assert calls[0]["token"] == "USDC"
    assert all("call" in c for c in calls)


def test_get_protocol_spenders():
    """get_protocol_spenders returns known addresses for chain."""
    from defi_cli.approve import get_protocol_spenders

    spenders = get_protocol_spenders("arbitrum")
    assert len(spenders) > 0
    # Should find at least one protocol
    protocols = {s["protocol"] for s in spenders}
    assert len(protocols) > 0
    assert all(s["address"].startswith("0x") for s in spenders)
