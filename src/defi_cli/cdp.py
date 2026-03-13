"""CDP operations for Felix (Liquity V2 fork) on HyperEVM.

Thin wrappers that delegate to protocol adapters.
"""

from defi_cli.protocols import get_cdp


def build_open_trove_tx(
    chain: str,
    collateral: str,
    coll_amount: int,
    debt_amount: int,
    owner: str,
    max_upfront_fee: int = 10**18,
    annual_interest_rate: int = 5 * 10**16,
) -> dict:
    """Build Felix openTrove tx on BorrowerOperations."""
    return get_cdp("felix", chain).build_open_position_tx(
        collateral=collateral, coll_amount=coll_amount,
        debt_amount=debt_amount, owner=owner,
        max_upfront_fee=max_upfront_fee,
        annual_interest_rate=annual_interest_rate,
    )


def build_adjust_trove_tx(
    chain: str,
    collateral: str,
    trove_id: int,
    coll_change: int,
    debt_change: int,
    is_coll_increase: bool,
    is_debt_increase: bool,
    owner: str,
    max_upfront_fee: int = 10**18,
) -> dict:
    """Build Felix adjustTrove tx."""
    return get_cdp("felix", chain).build_adjust_position_tx(
        collateral=collateral, position_id=trove_id,
        coll_change=coll_change, debt_change=debt_change,
        is_coll_increase=is_coll_increase,
        is_debt_increase=is_debt_increase,
        owner=owner, max_upfront_fee=max_upfront_fee,
    )


def build_close_trove_tx(
    chain: str,
    collateral: str,
    trove_id: int,
    owner: str,
) -> dict:
    """Build Felix closeTrove tx."""
    return get_cdp("felix", chain).build_close_position_tx(
        collateral=collateral, position_id=trove_id, owner=owner,
    )


def build_get_trove_info_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.Troves(uint256) eth_call to get trove info."""
    # Legacy: use the original selector-based approach
    from eth_abi import encode
    from web3 import Web3

    from defi_cli.registry import CHAINS, PROTOCOLS

    branches = PROTOCOLS["felix"]["chains"][chain]["branches"]
    if collateral not in branches:
        raise ValueError(f"Unknown Felix collateral: {collateral}")
    branch = branches[collateral]
    chain_id = CHAINS[chain]["chain_id"]

    selector = Web3.keccak(text="Troves(uint256)")[:4].hex()
    params = encode(["uint256"], [trove_id])

    return {
        "to": branch["trove_manager"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "Troves(uint256)",
    }


def build_get_trove_debt_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.getTroveDebt(uint256) eth_call."""
    result = get_cdp("felix", chain).build_get_position_call(
        collateral=collateral, position_id=trove_id,
    )
    return result["debt_call"]


def build_get_trove_coll_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.getTroveColl(uint256) eth_call."""
    result = get_cdp("felix", chain).build_get_position_call(
        collateral=collateral, position_id=trove_id,
    )
    return result["coll_call"]


def build_deposit_to_sp_tx(
    chain: str,
    collateral: str,
    amount: int,
) -> dict:
    """Build StabilityPool provideToSP(uint256, bool) tx."""
    return get_cdp("felix", chain).build_deposit_to_sp_tx(
        collateral=collateral, amount=amount,
    )


def build_withdraw_from_sp_tx(
    chain: str,
    collateral: str,
    amount: int,
) -> dict:
    """Build StabilityPool withdrawFromSP(uint256, bool) tx."""
    return get_cdp("felix", chain).build_withdraw_from_sp_tx(
        collateral=collateral, amount=amount,
    )
