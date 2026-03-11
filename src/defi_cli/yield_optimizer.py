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
        {recommended, net_apy_gain, bridge_cost, payback_days}
    """
    current_chain = current["chain"]
    current_apy = current["supply_apy"]
    amount = current.get("amount", 0)

    best_option = None
    best_net_gain = 0
    best_bridge_cost = 0
    best_payback = None

    for opt in options:
        opt_chain = opt["chain"]
        apy_gain = opt["supply_apy"] - current_apy

        # Get bridge cost
        route = (current_chain, opt_chain)
        bridge_cost = bridge_costs.get(route, 0) if current_chain != opt_chain else 0

        # Calculate payback period
        payback_days = None
        if amount > 0 and bridge_cost > 0 and apy_gain > 0:
            daily_extra_yield = amount * (apy_gain / 100) / 365
            if daily_extra_yield > 0:
                payback_days = bridge_cost / daily_extra_yield
            annual_extra_yield = amount * (apy_gain / 100)
            if annual_extra_yield <= bridge_cost:
                continue  # Not worth it within a year

        net_gain = apy_gain

        if net_gain > best_net_gain:
            best_net_gain = net_gain
            best_option = opt
            best_bridge_cost = bridge_cost
            best_payback = payback_days

    if best_option is None:
        return {
            "recommended": None,
            "net_apy_gain": 0,
            "bridge_cost": 0,
            "payback_days": None,
        }

    return {
        "recommended": best_option,
        "net_apy_gain": best_net_gain,
        "bridge_cost": best_bridge_cost,
        "payback_days": best_payback,
    }


def rank_all_opportunities(
    positions: list[dict],
    rates: list[dict],
    bridge_costs: dict,
) -> list[dict]:
    """Rank all optimization opportunities across positions.

    Args:
        positions: Current positions [{protocol, chain, asset, supply_apy, amount}]
        rates: Available rates [{protocol, chain, asset, supply_apy}]
        bridge_costs: {(from_chain, to_chain): cost_usd}

    Returns:
        Sorted list of moves with highest net gain first.
    """
    moves = []

    for pos in positions:
        # Find alternatives for this asset
        alternatives = [
            r for r in rates
            if r["asset"] == pos["asset"]
            and (r["protocol"] != pos["protocol"] or r["chain"] != pos["chain"])
        ]

        suggestion = suggest_optimization(pos, alternatives, bridge_costs)
        if suggestion["recommended"] is not None:
            moves.append({
                "from": {
                    "protocol": pos["protocol"],
                    "chain": pos["chain"],
                    "supply_apy": pos["supply_apy"],
                },
                "to": suggestion["recommended"],
                "asset": pos["asset"],
                "amount": pos.get("amount", 0),
                "net_apy_gain": suggestion["net_apy_gain"],
                "bridge_cost": suggestion["bridge_cost"],
                "payback_days": suggestion["payback_days"],
            })

    return sorted(moves, key=lambda m: m["net_apy_gain"], reverse=True)


def generate_rebalance_plan(
    positions: list[dict],
    rates: list[dict],
    bridge_costs: dict,
    min_apy_gain: float = 0.5,
) -> list[dict]:
    """Generate a rebalance plan filtering by minimum APY gain.

    Args:
        positions: Current positions.
        rates: Available rates.
        bridge_costs: Bridge costs.
        min_apy_gain: Minimum APY improvement to consider (percentage points).

    Returns:
        List of recommended moves with steps.
    """
    ranked = rank_all_opportunities(positions, rates, bridge_costs)

    plan = []
    for move in ranked:
        if move["net_apy_gain"] < min_apy_gain:
            continue

        steps = []
        from_chain = move["from"]["chain"]
        to_chain = move["to"]["chain"]

        # Step 1: Withdraw from current protocol
        steps.append({
            "action": "withdraw",
            "protocol": move["from"]["protocol"],
            "chain": from_chain,
            "asset": move["asset"],
            "amount": move["amount"],
        })

        # Step 2: Bridge if cross-chain
        if from_chain != to_chain:
            steps.append({
                "action": "bridge",
                "from_chain": from_chain,
                "to_chain": to_chain,
                "asset": move["asset"],
                "amount": move["amount"],
            })

        # Step 3: Approve + supply to new protocol
        steps.append({
            "action": "approve_and_supply",
            "protocol": move["to"]["protocol"],
            "chain": to_chain,
            "asset": move["asset"],
            "amount": move["amount"],
        })

        plan.append({
            **move,
            "steps": steps,
        })

    return plan
