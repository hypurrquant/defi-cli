"""EIP-2612 permit and Permit2 utilities for gasless approvals."""

from eth_abi import encode

# Uniswap Permit2 contract (same address on all EVM chains)
PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

# EIP-2612 permit selector
PERMIT_SELECTOR = "d505accf"  # permit(address,address,uint256,uint256,uint8,bytes32,bytes32)


def build_permit2_approve_tx(
    chain: str,
    token: str,
    amount: int = 2**256 - 1,
) -> dict:
    """Build an ERC20 approve tx to Permit2 contract.

    This is the first step to use Permit2 — approve the Permit2 contract
    to spend your tokens, then use signed permits for individual protocols.

    Args:
        chain: Chain name.
        token: Token symbol or address.
        amount: Amount to approve (default: max).

    Returns:
        Transaction dict.
    """
    from defi_cli.approve import build_approve_tx

    return build_approve_tx(chain, token, PERMIT2_ADDRESS, amount)


def build_permit2_transfer_from_call(
    token: str,
    from_addr: str,
    to_addr: str,
    amount: int,
) -> dict:
    """Build Permit2 transferFrom call (after signature approval).

    Permit2 transferFrom selector: 36c78516
    transferFrom(address from, address to, uint160 amount, address token)
    """
    selector = "36c78516"
    params = encode(
        ["address", "address", "uint160", "address"],
        [from_addr, to_addr, amount, token],
    )
    return {
        "to": PERMIT2_ADDRESS,
        "data": "0x" + selector + params.hex(),
    }


def build_eip2612_permit_data(
    token: str,
    owner: str,
    spender: str,
    value: int,
    nonce: int,
    deadline: int,
    chain_id: int,
) -> dict:
    """Build EIP-712 typed data for an EIP-2612 permit signature.

    This returns the structured data that needs to be signed with
    eth_signTypedData_v4 or equivalent.

    Args:
        token: Token contract address.
        owner: Token holder address.
        spender: Approved spender address.
        value: Amount to approve.
        nonce: Permit nonce for owner.
        deadline: Expiry timestamp.
        chain_id: Chain ID.

    Returns:
        EIP-712 typed data dict.
    """
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Permit": [
                {"name": "owner", "type": "address"},
                {"name": "spender", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "nonce", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
            ],
        },
        "primaryType": "Permit",
        "domain": {
            "chainId": chain_id,
            "verifyingContract": token,
        },
        "message": {
            "owner": owner,
            "spender": spender,
            "value": value,
            "nonce": nonce,
            "deadline": deadline,
        },
    }


def build_permit_call(
    token: str,
    owner: str,
    spender: str,
    value: int,
    deadline: int,
    v: int,
    r: bytes,
    s: bytes,
    chain_id: int,
) -> dict:
    """Build permit(owner,spender,value,deadline,v,r,s) call.

    Args:
        token: Token address.
        owner: Token holder address.
        spender: Approved spender.
        value: Amount to approve.
        deadline: Expiry timestamp.
        v: Signature v.
        r: Signature r (32 bytes).
        s: Signature s (32 bytes).
        chain_id: Chain ID.

    Returns:
        Transaction dict.
    """
    params = encode(
        ["address", "address", "uint256", "uint256", "uint8", "bytes32", "bytes32"],
        [owner, spender, value, deadline, v, r, s],
    )

    return {
        "to": token,
        "data": "0x" + PERMIT_SELECTOR + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }
