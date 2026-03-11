"""ERC20 approval utilities for DeFi operations."""

from eth_abi import encode

from defi_cli.registry import CHAINS, SELECTORS, TOKENS


def build_approve_tx(
    chain: str,
    token: str,
    spender: str,
    amount: int = 2**256 - 1,  # max approval by default
) -> dict:
    """Build ERC20 approve(address,uint256) transaction.

    Args:
        chain: Chain name.
        token: Token symbol or address.
        spender: Contract address to approve.
        amount: Amount to approve (default: max uint256).

    Returns:
        Transaction dict ready for signing.
    """
    chain_id = CHAINS[chain]["chain_id"]

    # Resolve token address
    if token.startswith("0x"):
        token_addr = token
    else:
        token_addr = TOKENS[chain][token]

    selector = SELECTORS["erc20_approve"]
    params = encode(["address", "uint256"], [spender, amount])

    return {
        "to": token_addr,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_check_allowance_call(
    chain: str,
    token: str,
    owner: str,
    spender: str,
) -> dict:
    """Build ERC20 allowance(address,address) eth_call."""
    if token.startswith("0x"):
        token_addr = token
    else:
        token_addr = TOKENS[chain][token]

    # allowance(address,address) selector = 0xdd62ed3e
    selector = "dd62ed3e"
    params = encode(["address", "address"], [owner, spender])

    return {
        "to": token_addr,
        "data": "0x" + selector + params.hex(),
    }
