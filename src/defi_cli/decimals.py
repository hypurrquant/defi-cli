"""Token decimal handling and human-readable amount formatting."""

# Known decimals for supported tokens
TOKEN_DECIMALS = {
    "WETH": 18,
    "USDC": 6,
    "USDT": 6,
    "USDT0": 6,
    "ARB": 18,
    "WHYPE": 18,
    "feUSD": 18,
}


def get_decimals(token: str) -> int:
    """Get the number of decimals for a token.

    Args:
        token: Token symbol (e.g. "USDC", "WETH").

    Returns:
        Number of decimals.

    Raises:
        ValueError: If token decimals are unknown.
    """
    if token in TOKEN_DECIMALS:
        return TOKEN_DECIMALS[token]
    raise ValueError(
        f"Unknown token decimals for {token}. "
        f"Known tokens: {', '.join(TOKEN_DECIMALS)}"
    )


def to_raw(amount: float, token: str) -> int:
    """Convert a human-readable amount to raw (smallest unit).

    Examples:
        to_raw(1.5, "USDC") -> 1500000
        to_raw(0.1, "WETH") -> 100000000000000000
    """
    decimals = get_decimals(token)
    return int(amount * 10**decimals)


def to_human(raw_amount: int, token: str) -> float:
    """Convert a raw amount to human-readable.

    Examples:
        to_human(1500000, "USDC") -> 1.5
        to_human(10**18, "WETH") -> 1.0
    """
    decimals = get_decimals(token)
    return raw_amount / 10**decimals


def format_amount(raw_amount: int, token: str, precision: int = 4) -> str:
    """Format a raw amount as a human-readable string.

    Examples:
        format_amount(1500000, "USDC") -> "1.5000 USDC"
        format_amount(10**18, "WETH") -> "1.0000 WETH"
    """
    human = to_human(raw_amount, token)
    return f"{human:.{precision}f} {token}"


def build_balanceof_call(chain: str, token: str, address: str) -> dict:
    """Build a balanceOf call to read decimals-aware balance.

    Returns a dict suitable for eth_call with metadata.
    """
    from eth_abi import encode

    from defi_cli.registry import SELECTORS, resolve_token

    token_addr = resolve_token(chain, token)
    selector = SELECTORS["erc20_balanceOf"]
    params = encode(["address"], [address])

    return {
        "to": token_addr,
        "data": "0x" + selector + params.hex(),
        "token": token,
        "decimals": get_decimals(token),
    }
