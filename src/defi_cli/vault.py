"""ERC-4626 vault utilities for yield vault interactions."""

from eth_abi import encode

from defi_cli.registry import CHAINS

# ERC-4626 standard function selectors
VAULT_SELECTORS = {
    "deposit": "6e553f65",       # deposit(uint256 assets, address receiver)
    "withdraw": "b460af94",      # withdraw(uint256 assets, address receiver, address owner)
    "redeem": "ba087652",        # redeem(uint256 shares, address receiver, address owner)
    "totalAssets": "01e1d114",   # totalAssets()
    "convertToShares": "c6e6f592",  # convertToShares(uint256 assets)
    "convertToAssets": "07a2d13a",  # convertToAssets(uint256 shares)
    "maxDeposit": "402d267d",    # maxDeposit(address receiver)
    "maxWithdraw": "ce96cb77",   # maxWithdraw(address owner)
    "previewDeposit": "ef8b30f7",   # previewDeposit(uint256 assets)
    "previewRedeem": "4cdad506",    # previewRedeem(uint256 shares)
    "asset": "38d52e0f",         # asset() — underlying asset address
}


def build_vault_deposit_tx(
    chain: str,
    vault: str,
    assets: int,
    receiver: str,
) -> dict:
    """Build ERC-4626 deposit(assets, receiver) transaction.

    Args:
        chain: Chain name.
        vault: Vault contract address.
        assets: Amount of underlying asset to deposit.
        receiver: Address to receive vault shares.

    Returns:
        Transaction dict.
    """
    chain_id = CHAINS[chain]["chain_id"]
    selector = VAULT_SELECTORS["deposit"]
    params = encode(["uint256", "address"], [assets, receiver])

    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_vault_withdraw_tx(
    chain: str,
    vault: str,
    assets: int,
    receiver: str,
    owner: str,
) -> dict:
    """Build ERC-4626 withdraw(assets, receiver, owner) transaction.

    Args:
        chain: Chain name.
        vault: Vault contract address.
        assets: Amount of underlying asset to withdraw.
        receiver: Address to receive assets.
        owner: Address that owns vault shares.

    Returns:
        Transaction dict.
    """
    chain_id = CHAINS[chain]["chain_id"]
    selector = VAULT_SELECTORS["withdraw"]
    params = encode(["uint256", "address", "address"], [assets, receiver, owner])

    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_vault_redeem_tx(
    chain: str,
    vault: str,
    shares: int,
    receiver: str,
    owner: str,
) -> dict:
    """Build ERC-4626 redeem(shares, receiver, owner) transaction.

    Args:
        chain: Chain name.
        vault: Vault contract address.
        shares: Amount of vault shares to redeem.
        receiver: Address to receive underlying assets.
        owner: Address that owns the shares.

    Returns:
        Transaction dict.
    """
    chain_id = CHAINS[chain]["chain_id"]
    selector = VAULT_SELECTORS["redeem"]
    params = encode(["uint256", "address", "address"], [shares, receiver, owner])

    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_total_assets_call(vault: str) -> dict:
    """Build totalAssets() read call."""
    return {
        "to": vault,
        "data": "0x" + VAULT_SELECTORS["totalAssets"],
    }


def build_convert_to_shares_call(vault: str, assets: int) -> dict:
    """Build convertToShares(uint256) read call."""
    selector = VAULT_SELECTORS["convertToShares"]
    params = encode(["uint256"], [assets])
    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
    }


def build_convert_to_assets_call(vault: str, shares: int) -> dict:
    """Build convertToAssets(uint256) read call."""
    selector = VAULT_SELECTORS["convertToAssets"]
    params = encode(["uint256"], [shares])
    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
    }


def build_preview_deposit_call(vault: str, assets: int) -> dict:
    """Build previewDeposit(uint256) read call."""
    selector = VAULT_SELECTORS["previewDeposit"]
    params = encode(["uint256"], [assets])
    return {
        "to": vault,
        "data": "0x" + selector + params.hex(),
    }


def build_asset_call(vault: str) -> dict:
    """Build asset() read call to get underlying token address."""
    return {
        "to": vault,
        "data": "0x" + VAULT_SELECTORS["asset"],
    }
