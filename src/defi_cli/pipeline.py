"""Transaction pipeline: approve-then-execute workflows for DeFi operations."""

from defi_cli.approve import build_approve_tx
from defi_cli.registry import resolve_token


def build_supply_pipeline(
    protocol: str,
    chain: str,
    token: str,
    amount: int,
    sender: str,
) -> list[dict]:
    """Build complete supply pipeline: [approve_tx, supply_tx].

    Returns list of transaction dicts ready for signing.
    Each has a 'label' field describing the step.
    """
    from defi_cli.lending import build_supply_tx

    token_addr = resolve_token(chain, token)
    pool = _get_lending_pool(protocol, chain)

    steps = []

    # Step 1: Approve token spend
    approve_tx = build_approve_tx(
        chain=chain, token=token_addr, spender=pool, amount=amount,
    )
    approve_tx["label"] = f"approve {token} for {protocol}"
    steps.append(approve_tx)

    # Step 2: Supply
    supply_tx = build_supply_tx(
        protocol=protocol, chain=chain, asset=token_addr,
        amount=amount, on_behalf_of=sender,
    )
    supply_tx["label"] = f"supply {amount} {token} to {protocol}"
    steps.append(supply_tx)

    return steps


def build_swap_pipeline(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    recipient: str,
    fee: int = 3000,
) -> list[dict]:
    """Build complete swap pipeline: [approve_tx, swap_tx]."""
    from defi_cli.dex import build_swap_tx

    token_in_addr = resolve_token(chain, token_in)
    token_out_addr = resolve_token(chain, token_out)
    router = _get_swap_router(protocol, chain)

    steps = []

    # Step 1: Approve token_in for router
    approve_tx = build_approve_tx(
        chain=chain, token=token_in_addr, spender=router, amount=amount_in,
    )
    approve_tx["label"] = f"approve {token_in} for {protocol} router"
    steps.append(approve_tx)

    # Step 2: Swap
    swap_tx = build_swap_tx(
        protocol=protocol, chain=chain,
        token_in=token_in_addr, token_out=token_out_addr,
        amount_in=amount_in, recipient=recipient, fee=fee,
    )
    swap_tx["label"] = f"swap {amount_in} {token_in} -> {token_out}"
    steps.append(swap_tx)

    return steps


def build_repay_pipeline(
    protocol: str,
    chain: str,
    token: str,
    amount: int,
    sender: str,
) -> list[dict]:
    """Build complete repay pipeline: [approve_tx, repay_tx]."""
    from defi_cli.lending import build_repay_tx

    token_addr = resolve_token(chain, token)
    pool = _get_lending_pool(protocol, chain)

    steps = []

    approve_tx = build_approve_tx(
        chain=chain, token=token_addr, spender=pool, amount=amount,
    )
    approve_tx["label"] = f"approve {token} for {protocol} repay"
    steps.append(approve_tx)

    repay_tx = build_repay_tx(
        protocol=protocol, chain=chain, asset=token_addr,
        amount=amount, on_behalf_of=sender,
    )
    repay_tx["label"] = f"repay {amount} {token} to {protocol}"
    steps.append(repay_tx)

    return steps


def _get_lending_pool(protocol: str, chain: str) -> str:
    """Get lending pool address."""
    from defi_cli.registry import PROTOCOLS
    return PROTOCOLS[protocol]["chains"][chain]["pool"]


def _get_swap_router(protocol: str, chain: str) -> str:
    """Get swap router address."""
    from defi_cli.registry import PROTOCOLS
    return PROTOCOLS[protocol]["chains"][chain]["swap_router"]
