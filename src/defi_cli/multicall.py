"""Multicall3 batching for efficient on-chain queries."""

from eth_abi import decode, encode

# Multicall3 is deployed at the same address on all EVM chains
MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11"

# aggregate3((address target, bool allowFailure, bytes callData)[])
AGGREGATE3_SELECTOR = "82ad56cb"


def build_multicall(
    calls: list[dict],
    chain_id: int,
) -> dict:
    """Build a Multicall3.aggregate3 transaction.

    Args:
        calls: List of dicts with "to" and "data" keys.
        chain_id: Target chain ID.

    Returns:
        Transaction dict targeting the Multicall3 contract.
    """
    # Encode each call as (address, bool, bytes)
    encoded_calls = []
    for call in calls:
        target = call["to"]
        calldata = bytes.fromhex(call["data"][2:])  # strip 0x
        encoded_calls.append((target, True, calldata))  # allowFailure=True

    params = encode(
        ["(address,bool,bytes)[]"],
        [encoded_calls],
    )

    return {
        "to": MULTICALL3_ADDRESS,
        "data": "0x" + AGGREGATE3_SELECTOR + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def decode_multicall_result(result_hex: str) -> list[dict]:
    """Decode Multicall3.aggregate3 return data.

    Returns:
        List of {"success": bool, "data": bytes} for each call.
    """
    raw = bytes.fromhex(result_hex[2:] if result_hex.startswith("0x") else result_hex)
    # aggregate3 returns (bool success, bytes returnData)[]
    decoded = decode(["(bool,bytes)[]"], raw)[0]
    return [
        {"success": item[0], "data": item[1]}
        for item in decoded
    ]


def build_balance_multicall(
    chain: str,
    tokens: list[str],
    address: str,
) -> dict:
    """Build a multicall to query multiple token balances at once.

    Args:
        chain: Chain name.
        tokens: List of token symbols or addresses.
        address: Address to check balances for.

    Returns:
        Transaction dict for multicall.
    """
    from defi_cli.registry import CHAINS, SELECTORS, resolve_token

    chain_id = CHAINS[chain]["chain_id"]
    balance_selector = SELECTORS["erc20_balanceOf"]
    addr_encoded = encode(["address"], [address]).hex()

    calls = []
    for token in tokens:
        token_addr = resolve_token(chain, token)
        calls.append({
            "to": token_addr,
            "data": "0x" + balance_selector + addr_encoded,
        })

    return build_multicall(calls, chain_id)


def build_allowance_multicall(
    chain: str,
    tokens: list[str],
    owner: str,
    spender: str,
) -> dict:
    """Build a multicall to query multiple token allowances.

    Args:
        chain: Chain name.
        tokens: List of token symbols or addresses.
        owner: Token owner address.
        spender: Approved spender address.

    Returns:
        Transaction dict for multicall.
    """
    from defi_cli.registry import CHAINS, resolve_token

    chain_id = CHAINS[chain]["chain_id"]
    # allowance(address,address) = 0xdd62ed3e
    allowance_selector = "dd62ed3e"
    params = encode(["address", "address"], [owner, spender]).hex()

    calls = []
    for token in tokens:
        token_addr = resolve_token(chain, token)
        calls.append({
            "to": token_addr,
            "data": "0x" + allowance_selector + params,
        })

    return build_multicall(calls, chain_id)
