"""ERC20 and native token transfer utilities."""

from eth_abi import encode

from defi_cli.registry import CHAINS, SELECTORS, resolve_token


def build_erc20_transfer_tx(
    chain: str,
    token: str,
    to: str,
    amount: int,
) -> dict:
    """Build ERC20 transfer(address,uint256) transaction.

    Args:
        chain: Chain name.
        token: Token symbol or address.
        to: Recipient address.
        amount: Amount in token's smallest unit.

    Returns:
        Transaction dict ready for signing.
    """
    token_addr = resolve_token(chain, token)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["erc20_transfer"]

    params = encode(["address", "uint256"], [to, amount])

    return {
        "to": token_addr,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_native_transfer_tx(
    chain: str,
    to: str,
    amount_wei: int,
) -> dict:
    """Build native token transfer (ETH/HYPE).

    Args:
        chain: Chain name.
        to: Recipient address.
        amount_wei: Amount in wei.

    Returns:
        Transaction dict ready for signing.
    """
    chain_id = CHAINS[chain]["chain_id"]

    return {
        "to": to,
        "data": "0x",
        "chainId": chain_id,
        "value": amount_wei,
    }
