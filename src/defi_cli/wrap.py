"""WETH/WHYPE wrap and unwrap operations."""

from eth_abi import encode

from defi_cli.registry import CHAINS, TOKENS

# WETH9 deposit() — wraps native ETH/HYPE to WETH/WHYPE
# selector: d0e30db0 (no params, value = amount to wrap)
DEPOSIT_SELECTOR = "d0e30db0"

# WETH9 withdraw(uint256) — unwraps WETH/WHYPE to native
# selector: 2e1a7d4d
WITHDRAW_SELECTOR = "2e1a7d4d"


def get_wrapped_native(chain: str) -> str:
    """Get the wrapped native token address for a chain."""
    native = CHAINS[chain]["native_token"]
    # Map native token to its wrapped version
    wrapped_map = {"ETH": "WETH", "HYPE": "WHYPE"}
    wrapped_symbol = wrapped_map.get(native)
    if wrapped_symbol is None:
        raise ValueError(f"No wrapped token mapping for {native} on {chain}")
    if wrapped_symbol not in TOKENS.get(chain, {}):
        raise ValueError(f"No {wrapped_symbol} address on {chain}")
    return TOKENS[chain][wrapped_symbol]


def build_wrap_tx(chain: str, amount_wei: int) -> dict:
    """Build a transaction to wrap native token (ETH -> WETH, HYPE -> WHYPE).

    Args:
        chain: Chain name.
        amount_wei: Amount to wrap in wei.

    Returns:
        Transaction dict. The value field contains the amount to wrap.
    """
    wrapped_addr = get_wrapped_native(chain)
    chain_id = CHAINS[chain]["chain_id"]

    return {
        "to": wrapped_addr,
        "data": "0x" + DEPOSIT_SELECTOR,
        "chainId": chain_id,
        "value": amount_wei,
    }


def build_unwrap_tx(chain: str, amount_wei: int) -> dict:
    """Build a transaction to unwrap (WETH -> ETH, WHYPE -> HYPE).

    Args:
        chain: Chain name.
        amount_wei: Amount to unwrap in wei.

    Returns:
        Transaction dict.
    """
    wrapped_addr = get_wrapped_native(chain)
    chain_id = CHAINS[chain]["chain_id"]

    params = encode(["uint256"], [amount_wei])

    return {
        "to": wrapped_addr,
        "data": "0x" + WITHDRAW_SELECTOR + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }
