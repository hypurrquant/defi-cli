"""Flash loan transaction building for Aave V3.

Thin wrappers that delegate to protocol adapters.
"""

from defi_cli.protocols import get_lending
from defi_cli.registry import resolve_token

# Keep selectors exported for backward compatibility
FLASH_LOAN_SELECTOR = "ab9c4b5d"
FLASH_LOAN_SIMPLE_SELECTOR = "42b0b77c"


def build_flash_loan_tx(
    protocol: str,
    chain: str,
    receiver: str,
    assets: list[str],
    amounts: list[int],
    modes: list[int] | None = None,
    on_behalf_of: str | None = None,
    params: bytes = b"",
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 flashLoan transaction."""
    asset_addrs = [resolve_token(chain, a) for a in assets]
    return get_lending(protocol, chain).build_flash_loan_tx(
        receiver=receiver, assets=asset_addrs, amounts=amounts,
        modes=modes, on_behalf_of=on_behalf_of,
        params=params, referral_code=referral_code,
    )


def build_flash_loan_simple_tx(
    protocol: str,
    chain: str,
    receiver: str,
    asset: str,
    amount: int,
    params: bytes = b"",
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 flashLoanSimple for a single asset."""
    asset_addr = resolve_token(chain, asset)
    return get_lending(protocol, chain).build_flash_loan_simple_tx(
        receiver=receiver, asset=asset_addr, amount=amount,
        params=params, referral_code=referral_code,
    )
