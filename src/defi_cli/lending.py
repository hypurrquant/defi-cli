"""Lending protocol operations: supply, borrow, repay, withdraw, rates."""

from eth_abi import encode

from prepare import CHAINS, PROTOCOLS, SELECTORS


def _get_pool_address(protocol: str, chain: str) -> str:
    """Get lending pool address for a protocol on a chain."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    p = PROTOCOLS[protocol]
    if chain not in p.get("chains", {}):
        raise ValueError(f"{protocol} not available on {chain}")
    return p["chains"][chain]["pool"]


def build_supply_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 supply(address,uint256,address,uint16) tx."""
    pool = _get_pool_address(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_supply"]

    params = encode(
        ["address", "uint256", "address", "uint16"],
        [asset, amount, on_behalf_of, referral_code],
    )

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_borrow_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    interest_rate_mode: int = 2,  # 2 = variable
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 borrow(address,uint256,uint256,uint16,address) tx."""
    pool = _get_pool_address(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_borrow"]

    params = encode(
        ["address", "uint256", "uint256", "uint16", "address"],
        [asset, amount, interest_rate_mode, referral_code, on_behalf_of],
    )

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_repay_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    on_behalf_of: str,
    interest_rate_mode: int = 2,
) -> dict:
    """Build Aave V3 repay(address,uint256,uint256,address) tx."""
    pool = _get_pool_address(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_repay"]

    params = encode(
        ["address", "uint256", "uint256", "address"],
        [asset, amount, interest_rate_mode, on_behalf_of],
    )

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_withdraw_tx(
    protocol: str,
    chain: str,
    asset: str,
    amount: int,
    to: str,
) -> dict:
    """Build Aave V3 withdraw(address,uint256,address) tx."""
    pool = _get_pool_address(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["aave_withdraw"]

    params = encode(
        ["address", "uint256", "address"],
        [asset, amount, to],
    )

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_get_rates_call(
    protocol: str,
    chain: str,
    asset: str,
) -> dict:
    """Build getReserveData(address) eth_call to query lending/borrow rates."""
    pool = _get_pool_address(protocol, chain)
    selector = SELECTORS["aave_getReserveData"]

    params = encode(["address"], [asset])

    return {
        "to": pool,
        "data": "0x" + selector + params.hex(),
    }
