"""Wallet management: create, import, balance queries."""

from eth_account import Account

from defi_cli.registry import CHAINS, SELECTORS, TOKENS


def create_wallet() -> dict:
    """Create a new wallet with a random private key."""
    account = Account.create()
    return {
        "address": account.address,
        "private_key": "0x" + account.key.hex(),
    }


def import_wallet(private_key: str) -> dict:
    """Import wallet from a private key string."""
    account = Account.from_key(private_key)
    return {
        "address": account.address,
    }


def build_native_balance_call(chain: str, address: str) -> dict:
    """Build eth_getBalance JSON-RPC call parameters."""
    if chain not in CHAINS:
        raise ValueError(f"Unknown chain: {chain}")
    return {
        "method": "eth_getBalance",
        "params": [address, "latest"],
    }


def build_token_balance_call(chain: str, token_symbol: str, address: str) -> dict:
    """Build ERC20 balanceOf eth_call parameters."""
    if chain not in TOKENS:
        raise ValueError(f"Unknown chain: {chain}")
    if token_symbol not in TOKENS[chain]:
        raise ValueError(f"Unknown token {token_symbol} on {chain}")

    token_address = TOKENS[chain][token_symbol]
    selector = SELECTORS["erc20_balanceOf"]
    # ABI encode: balanceOf(address) — pad address to 32 bytes
    padded_address = address.lower().replace("0x", "").zfill(64)
    calldata = "0x" + selector + padded_address

    return {
        "to": token_address,
        "data": calldata,
    }
