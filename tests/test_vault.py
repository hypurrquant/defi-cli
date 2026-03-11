"""Tests for ERC-4626 vault utilities."""


VAULT = "0x" + "aa" * 20
SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_vault_selectors():
    """ERC-4626 selectors match standard."""
    from defi_cli.vault import VAULT_SELECTORS

    assert VAULT_SELECTORS["deposit"] == "6e553f65"
    assert VAULT_SELECTORS["withdraw"] == "b460af94"
    assert VAULT_SELECTORS["redeem"] == "ba087652"
    assert VAULT_SELECTORS["totalAssets"] == "01e1d114"
    assert VAULT_SELECTORS["asset"] == "38d52e0f"


def test_build_vault_deposit():
    """Deposit tx has correct selector and encoding."""
    from defi_cli.vault import build_vault_deposit_tx

    tx = build_vault_deposit_tx("arbitrum", VAULT, 1_000_000, SENDER)

    assert tx["to"] == VAULT
    assert tx["data"][:10] == "0x6e553f65"
    assert tx["chainId"] == 42161
    assert tx["value"] == 0


def test_build_vault_withdraw():
    """Withdraw tx includes owner parameter."""
    from defi_cli.vault import build_vault_withdraw_tx

    tx = build_vault_withdraw_tx("arbitrum", VAULT, 500_000, SENDER, SENDER)

    assert tx["to"] == VAULT
    assert tx["data"][:10] == "0xb460af94"
    assert tx["chainId"] == 42161


def test_build_vault_redeem():
    """Redeem tx uses shares amount."""
    from defi_cli.vault import build_vault_redeem_tx

    tx = build_vault_redeem_tx("arbitrum", VAULT, 100, SENDER, SENDER)

    assert tx["to"] == VAULT
    assert tx["data"][:10] == "0xba087652"
    assert tx["chainId"] == 42161


def test_build_total_assets_call():
    """totalAssets() read call."""
    from defi_cli.vault import build_total_assets_call

    call = build_total_assets_call(VAULT)
    assert call["to"] == VAULT
    assert call["data"] == "0x01e1d114"


def test_build_convert_to_shares():
    """convertToShares() read call."""
    from defi_cli.vault import build_convert_to_shares_call

    call = build_convert_to_shares_call(VAULT, 1_000_000)
    assert call["to"] == VAULT
    assert call["data"][:10] == "0xc6e6f592"


def test_build_convert_to_assets():
    """convertToAssets() read call."""
    from defi_cli.vault import build_convert_to_assets_call

    call = build_convert_to_assets_call(VAULT, 100)
    assert call["to"] == VAULT
    assert call["data"][:10] == "0x07a2d13a"


def test_build_preview_deposit():
    """previewDeposit() read call."""
    from defi_cli.vault import build_preview_deposit_call

    call = build_preview_deposit_call(VAULT, 1_000_000)
    assert call["to"] == VAULT
    assert call["data"][:10] == "0xef8b30f7"


def test_build_asset_call():
    """asset() read call."""
    from defi_cli.vault import build_asset_call

    call = build_asset_call(VAULT)
    assert call["to"] == VAULT
    assert call["data"] == "0x38d52e0f"


def test_vault_deposit_hyperevm():
    """Vault deposit works on HyperEVM (chainId 999)."""
    from defi_cli.vault import build_vault_deposit_tx

    tx = build_vault_deposit_tx("hyperevm", VAULT, 10**18, SENDER)
    assert tx["chainId"] == 999
