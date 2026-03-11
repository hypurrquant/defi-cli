"""Liquidation monitoring and health factor analysis."""

from defi_cli.registry import CHAINS, PROTOCOLS


def assess_health(parsed_data: dict) -> dict:
    """Assess position health from parsed getUserAccountData.

    Returns:
        Dict with health_status, health_factor_human, and recommendations.
    """
    hf = parsed_data["health_factor"]
    collateral = parsed_data["total_collateral_base"]
    debt = parsed_data["total_debt_base"]

    # Health factor is in 1e18 units
    hf_human = hf / 10**18 if hf > 0 else float("inf")

    if debt == 0:
        status = "safe"
        risk_level = "none"
        recommendations = []
    elif hf_human > 2.0:
        status = "healthy"
        risk_level = "low"
        recommendations = []
    elif hf_human > 1.5:
        status = "moderate"
        risk_level = "medium"
        recommendations = ["Consider reducing debt or adding collateral"]
    elif hf_human > 1.1:
        status = "at_risk"
        risk_level = "high"
        recommendations = [
            "Urgently add collateral or repay debt",
            "Health factor approaching liquidation threshold (1.0)",
        ]
    else:
        status = "critical"
        risk_level = "critical"
        recommendations = [
            "IMMEDIATE ACTION REQUIRED",
            "Position may be liquidated at health factor 1.0",
            "Repay debt immediately or add significant collateral",
        ]

    return {
        "health_status": status,
        "risk_level": risk_level,
        "health_factor": hf_human,
        "total_collateral_usd": collateral / 10**8,
        "total_debt_usd": debt / 10**8,
        "available_borrows_usd": parsed_data["available_borrows_base"] / 10**8,
        "ltv_bps": parsed_data["ltv"],
        "liquidation_threshold_bps": parsed_data["current_liquidation_threshold"],
        "recommendations": recommendations,
    }


def build_liquidation_call(
    protocol: str,
    chain: str,
    collateral_asset: str,
    debt_asset: str,
    user: str,
    debt_to_cover: int,
    receive_a_token: bool = False,
) -> dict:
    """Build Aave V3 liquidationCall transaction.

    liquidationCall(address collateralAsset, address debtAsset,
                    address user, uint256 debtToCover,
                    bool receiveAToken)
    selector: 00a718a9
    """
    from eth_abi import encode

    from defi_cli.registry import resolve_token

    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    chain_id = CHAINS[chain]["chain_id"]

    coll_addr = resolve_token(chain, collateral_asset)
    debt_addr = resolve_token(chain, debt_asset)

    params = encode(
        ["address", "address", "address", "uint256", "bool"],
        [coll_addr, debt_addr, user, debt_to_cover, receive_a_token],
    )

    return {
        "to": pool,
        "data": "0x00a718a9" + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }
