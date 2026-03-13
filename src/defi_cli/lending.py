"""Lending protocol operations: supply, borrow, repay, withdraw, rates.

Thin wrappers that delegate to protocol adapters.
"""

from defi_cli.protocols import get_lending


def _get_pool_address(protocol: str, chain: str) -> str:
    """Get lending pool address for a protocol on a chain."""
    adapter = get_lending(protocol, chain)
    return adapter.config["pool"]


def build_supply_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 supply(address,uint256,address,uint16) tx."""
    return get_lending(protocol, chain).build_supply_tx(
        asset=asset, amount=amount,
        on_behalf_of=on_behalf_of, referral_code=referral_code,
    )


def build_borrow_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    interest_rate_mode: int = 2,
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 borrow(address,uint256,uint256,uint16,address) tx."""
    return get_lending(protocol, chain).build_borrow_tx(
        asset=asset, amount=amount,
        on_behalf_of=on_behalf_of,
        interest_rate_mode=interest_rate_mode,
        referral_code=referral_code,
    )


def build_repay_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    interest_rate_mode: int = 2,
) -> dict:
    """Build Aave V3 repay(address,uint256,uint256,address) tx."""
    return get_lending(protocol, chain).build_repay_tx(
        asset=asset, amount=amount,
        on_behalf_of=on_behalf_of,
        interest_rate_mode=interest_rate_mode,
    )


def build_withdraw_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    to: str,
) -> dict:
    """Build Aave V3 withdraw(address,uint256,address) tx."""
    return get_lending(protocol, chain).build_withdraw_tx(
        asset=asset, amount=amount, to=to,
    )


def build_get_rates_call(
    protocol: str,
    chain: str,
    asset: str,
) -> dict:
    """Build getReserveData(address) eth_call to query lending/borrow rates."""
    return get_lending(protocol, chain).build_get_rates_call(asset=asset)
