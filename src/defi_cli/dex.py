"""DEX operations: swap, add/remove liquidity.

Thin wrappers that delegate to protocol adapters.
"""

from defi_cli.protocols import get_dex


def build_swap_tx(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    recipient: str,
    fee: int = 3000,
    slippage: float = 0.005,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build a swap transaction for a DEX protocol."""
    return get_dex(protocol, chain).build_swap_tx(
        token_in=token_in, token_out=token_out,
        amount_in=amount_in, recipient=recipient,
        fee=fee, slippage=slippage, deadline=deadline,
    )


def build_v2_swap_tx(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    recipient: str,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build a Uniswap V2 style swap via swapExactTokensForTokens."""
    return get_dex(protocol, chain).build_v2_swap_tx(
        token_in=token_in, token_out=token_out,
        amount_in=amount_in, recipient=recipient, deadline=deadline,
    )


def build_add_liquidity_tx(
    protocol: str,
    chain: str,
    token_a: str,
    token_b: str,
    amount_a: int,
    amount_b: int,
    fee: int,
    tick_lower: int,
    tick_upper: int,
    recipient: str,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build add liquidity tx via NonfungiblePositionManager.mint()."""
    return get_dex(protocol, chain).build_add_liquidity_tx(
        token_a=token_a, token_b=token_b,
        amount_a=amount_a, amount_b=amount_b,
        fee=fee, tick_lower=tick_lower, tick_upper=tick_upper,
        recipient=recipient, deadline=deadline,
    )


def build_remove_liquidity_tx(
    protocol: str,
    chain: str,
    token_id: int,
    liquidity: int,
    recipient: str,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build remove liquidity tx via NonfungiblePositionManager.decreaseLiquidity()."""
    return get_dex(protocol, chain).build_remove_liquidity_tx(
        token_id=token_id, liquidity=liquidity,
        recipient=recipient, deadline=deadline,
    )
