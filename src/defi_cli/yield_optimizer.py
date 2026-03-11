"""Yield comparison and optimization across protocols/chains."""


def compare_rates(rates: list[dict]) -> list[dict]:
    """Compare lending rates, sorted by supply_apy descending (best first)."""
    return sorted(rates, key=lambda r: r["supply_apy"], reverse=True)


def suggest_optimization(
    current: dict,
    options: list[dict],
    bridge_costs: dict,
) -> dict:
    """Suggest optimal yield move considering bridge costs.

    Args:
        current: Current position {protocol, chain, asset, supply_apy, amount}
        options: Available alternatives [{protocol, chain, supply_apy}]
        bridge_costs: {(from_chain, to_chain): cost_usd}

    Returns:
        {recommended, net_apy_gain, bridge_cost}
    """
    current_chain = current["chain"]
    current_apy = current["supply_apy"]
    amount = current.get("amount", 0)

    best_option = None
    best_net_gain = 0

    for opt in options:
        opt_chain = opt["chain"]
        apy_gain = opt["supply_apy"] - current_apy

        # Get bridge cost
        route = (current_chain, opt_chain)
        bridge_cost = bridge_costs.get(route, 0) if current_chain != opt_chain else 0

        # Annualize: how many days to recoup bridge cost?
        # net_gain = apy_gain as percentage points
        # If amount > 0, calculate if bridge cost is worth it over 1 year
        if amount > 0 and bridge_cost > 0:
            annual_extra_yield = amount * (apy_gain / 100)
            if annual_extra_yield <= bridge_cost:
                continue  # Not worth it

        net_gain = apy_gain

        if net_gain > best_net_gain:
            best_net_gain = net_gain
            best_option = opt
            best_bridge_cost = bridge_cost

    if best_option is None:
        return {
            "recommended": None,
            "net_apy_gain": 0,
            "bridge_cost": 0,
        }

    return {
        "recommended": best_option,
        "net_apy_gain": best_net_gain,
        "bridge_cost": best_bridge_cost,
    }
