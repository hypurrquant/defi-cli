"""Real-time lending rate fetching and parsing from on-chain data."""

from eth_abi import decode

from defi_cli.registry import PROTOCOLS


def parse_reserve_data(raw_hex: str) -> dict:
    """Parse Aave V3 getReserveData return data.

    Returns dict with supply/borrow rates in human-readable APY.
    Aave V3 getReserveData returns a tuple of (ReserveConfigurationMap, ...)
    The key rate fields are liquidityRate and variableBorrowRate in RAY (1e27).
    """
    raw = bytes.fromhex(raw_hex[2:] if raw_hex.startswith("0x") else raw_hex)

    # Aave V3 getReserveData returns:
    # (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate,
    #  uint128 variableBorrowIndex, uint128 currentVariableBorrowRate,
    #  uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp,
    #  uint16 id, address aTokenAddress, address stableDebtTokenAddress,
    #  address variableDebtTokenAddress, address interestRateStrategyAddress,
    #  uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)
    try:
        decoded = decode(
            [
                "uint256",   # configuration
                "uint128",   # liquidityIndex
                "uint128",   # currentLiquidityRate (RAY)
                "uint128",   # variableBorrowIndex
                "uint128",   # currentVariableBorrowRate (RAY)
                "uint128",   # currentStableBorrowRate (RAY)
                "uint40",    # lastUpdateTimestamp
                "uint16",    # id
                "address",   # aTokenAddress
                "address",   # stableDebtTokenAddress
                "address",   # variableDebtTokenAddress
                "address",   # interestRateStrategyAddress
                "uint128",   # accruedToTreasury
                "uint128",   # unbacked
                "uint128",   # isolationModeTotalDebt
            ],
            raw,
        )

        ray = 10**27
        liquidity_rate = decoded[2]
        variable_borrow_rate = decoded[4]

        # Convert RAY rate to APY percentage
        supply_apy = (liquidity_rate / ray) * 100
        borrow_apy = (variable_borrow_rate / ray) * 100

        return {
            "supply_apy": supply_apy,
            "borrow_apy": borrow_apy,
            "liquidity_rate_ray": liquidity_rate,
            "variable_borrow_rate_ray": variable_borrow_rate,
            "a_token": decoded[8],
            "variable_debt_token": decoded[10],
        }
    except Exception:
        return {
            "supply_apy": 0.0,
            "borrow_apy": 0.0,
            "error": "Failed to parse reserve data",
        }


def build_rate_comparison_calls(
    asset: str,
    protocols_chains: list[tuple[str, str]] | None = None,
) -> list[dict]:
    """Build getReserveData calls for comparing rates across protocols.

    Args:
        asset: Token symbol (e.g. "USDC").
        protocols_chains: List of (protocol, chain) tuples.
            If None, queries all lending protocols.

    Returns:
        List of {"protocol", "chain", "call"} dicts.
    """
    from defi_cli.positions import build_reserve_data_call

    if protocols_chains is None:
        protocols_chains = []
        for name, proto in PROTOCOLS.items():
            if proto["type"] != "lending":
                continue
            for chain_name in proto.get("chains", {}):
                # Check if asset exists on this chain
                from defi_cli.registry import TOKENS
                if asset in TOKENS.get(chain_name, {}):
                    protocols_chains.append((name, chain_name))

    results = []
    for protocol, chain in protocols_chains:
        try:
            call = build_reserve_data_call(protocol, chain, asset)
            results.append({
                "protocol": protocol,
                "chain": chain,
                "call": call,
            })
        except (ValueError, KeyError):
            continue

    return results
