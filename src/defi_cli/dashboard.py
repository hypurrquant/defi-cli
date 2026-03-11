"""Live yield dashboard — aggregates rates, prices, and balances."""

from defi_cli.registry import TOKENS


def fetch_all_rates(assets: list[str] | None = None) -> list[dict]:
    """Fetch lending rates for all assets across all protocols.

    Args:
        assets: Token symbols to query. None = all common lending assets.

    Returns:
        List of {protocol, chain, asset, supply_apy, borrow_apy} dicts.
    """
    from defi_cli.fetcher import eth_call
    from defi_cli.rates import build_rate_comparison_calls, parse_reserve_data

    if assets is None:
        assets = ["USDC", "WETH"]

    results = []
    for asset in assets:
        calls = build_rate_comparison_calls(asset)
        for entry in calls:
            rpc_result = eth_call(entry["chain"], entry["call"])
            if rpc_result["success"]:
                parsed = parse_reserve_data(rpc_result["result"])
                results.append({
                    "protocol": entry["protocol"],
                    "chain": entry["chain"],
                    "asset": asset,
                    "supply_apy": round(parsed["supply_apy"], 4),
                    "borrow_apy": round(parsed["borrow_apy"], 4),
                })

    results.sort(key=lambda r: r["supply_apy"], reverse=True)
    return results


def fetch_portfolio(
    chain: str,
    address: str,
    tokens: list[str] | None = None,
) -> dict:
    """Fetch a portfolio overview: native + token balances.

    Args:
        chain: Chain name.
        address: Wallet address.
        tokens: Token symbols to check. None = all tokens on chain.

    Returns:
        {"native": {...}, "tokens": [...], "chain": str}
    """
    from defi_cli.decimals import to_human
    from defi_cli.fetcher import fetch_balance, fetch_token_balance

    if tokens is None:
        tokens = list(TOKENS.get(chain, {}).keys())
        # Filter out wrapped native (already shown as native)
        tokens = [t for t in tokens if t not in ("WETH", "WHYPE")]

    native = fetch_balance(chain, address)
    token_balances = []

    for token in tokens:
        result = fetch_token_balance(chain, token, address)
        if result["success"] and result["balance_raw"] > 0:
            try:
                human = to_human(result["balance_raw"], token)
            except ValueError:
                human = result["balance_raw"]
            token_balances.append({
                "token": token,
                "balance_raw": result["balance_raw"],
                "balance": human,
            })

    return {
        "chain": chain,
        "native": native,
        "tokens": token_balances,
    }


def build_yield_summary(
    rates: list[dict],
    top_n: int = 10,
) -> list[dict]:
    """Build a summary of the top N yield opportunities.

    Returns sorted list with supply and borrow APY, annotated with
    best-supply and lowest-borrow flags per asset.
    """
    # Group by asset
    by_asset: dict[str, list[dict]] = {}
    for r in rates:
        by_asset.setdefault(r["asset"], []).append(r)

    summary = []
    for asset, entries in by_asset.items():
        sorted_supply = sorted(entries, key=lambda x: x["supply_apy"], reverse=True)
        sorted_borrow = sorted(entries, key=lambda x: x["borrow_apy"])

        best_supply_key = (sorted_supply[0]["protocol"], sorted_supply[0]["chain"])
        cheapest_borrow_key = (sorted_borrow[0]["protocol"], sorted_borrow[0]["chain"])

        for e in entries:
            key = (e["protocol"], e["chain"])
            summary.append({
                **e,
                "best_supply": key == best_supply_key,
                "cheapest_borrow": key == cheapest_borrow_key,
            })

    summary.sort(key=lambda r: r["supply_apy"], reverse=True)
    return summary[:top_n]
