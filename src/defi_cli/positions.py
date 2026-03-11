"""Position tracking: query user lending positions and CDP states."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, SELECTORS


def build_user_account_data_call(
    protocol: str,
    chain: str,
    user: str,
) -> dict:
    """Build Aave V3 getUserAccountData(address) eth_call.

    Returns 6 values: totalCollateralBase, totalDebtBase,
    availableBorrowsBase, currentLiquidationThreshold,
    ltv, healthFactor.
    """
    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_getUserAccountData"]

    params = encode(["address"], [user])

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getUserAccountData(address)",
    }


def build_reserve_data_call(
    protocol: str,
    chain: str,
    asset: str,
) -> dict:
    """Build Aave V3 getReserveData(address) eth_call.

    Returns comprehensive reserve info including supply/borrow rates.
    """
    from defi_cli.registry import resolve_token

    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_getReserveData"]
    asset_addr = resolve_token(chain, asset)

    params = encode(["address"], [asset_addr])

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getReserveData(address)",
    }


def build_multi_position_calls(
    user: str,
    protocols_chains: list[tuple[str, str]] | None = None,
) -> list[dict]:
    """Build getUserAccountData calls for multiple protocols/chains.

    Args:
        user: User address.
        protocols_chains: List of (protocol, chain) tuples.
            If None, queries all lending protocols on all chains.

    Returns:
        List of dicts with "protocol", "chain", "call" keys.
    """
    if protocols_chains is None:
        protocols_chains = []
        for name, proto in PROTOCOLS.items():
            if proto["type"] != "lending":
                continue
            for chain_name in proto.get("chains", {}):
                protocols_chains.append((name, chain_name))

    results = []
    for protocol, chain in protocols_chains:
        call = build_user_account_data_call(protocol, chain, user)
        results.append({
            "protocol": protocol,
            "chain": chain,
            "call": call,
        })

    return results


def parse_user_account_data(raw_hex: str) -> dict:
    """Parse getUserAccountData return data.

    Returns dict with human-readable position info.
    Values are in base currency units (8 decimals for USD).
    """
    from eth_abi import decode as abi_decode

    raw = bytes.fromhex(raw_hex[2:] if raw_hex.startswith("0x") else raw_hex)
    values = abi_decode(
        ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
        raw,
    )

    return {
        "total_collateral_base": values[0],
        "total_debt_base": values[1],
        "available_borrows_base": values[2],
        "current_liquidation_threshold": values[3],
        "ltv": values[4],
        "health_factor": values[5],
    }
