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


def build_revoke_tx(chain: str, token: str, spender: str) -> dict:
    """Build an ERC20 revoke (approve 0) transaction.

    Args:
        chain: Chain name.
        token: Token symbol or address.
        spender: Contract address to revoke.

    Returns:
        Transaction dict that sets allowance to 0.
    """
    return build_approve_tx(chain, token, spender, amount=0)


def build_batch_allowance_calls(
    chain: str,
    owner: str,
    tokens: list[str],
    spenders: list[str],
) -> list[dict]:
    """Build batch allowance check calls for multiple token-spender pairs.

    Args:
        chain: Chain name.
        owner: Token holder address.
        tokens: List of token symbols/addresses.
        spenders: List of spender addresses.

    Returns:
        List of {"token", "spender", "call"} dicts.
    """
    results = []
    for token in tokens:
        for spender in spenders:
            call = build_check_allowance_call(chain, token, owner, spender)
            results.append({
                "token": token,
                "spender": spender,
                "call": call,
            })
    return results


def get_protocol_spenders(chain: str) -> list[dict]:
    """Get known spender addresses for protocols on a chain.

    Returns:
        List of {"protocol", "address", "type"} dicts.
    """
    from defi_cli.registry import PROTOCOLS

    spenders = []
    for name, proto in PROTOCOLS.items():
        chains = proto.get("chains", {})
        if chain in chains:
            chain_config = chains[chain]
            # Add pool/router addresses as potential spenders
            if "pool" in chain_config:
                spenders.append({
                    "protocol": name,
                    "address": chain_config["pool"],
                    "type": "pool",
                })
            if "router" in chain_config:
                spenders.append({
                    "protocol": name,
                    "address": chain_config["router"],
                    "type": "router",
                })
    return spenders
