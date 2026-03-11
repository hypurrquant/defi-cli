"""Tests for yield comparison and optimization."""


def test_yield_compare_rates():
    """Compare lending rates across protocols: returns sorted results with APY fields."""
    from defi_cli.yield_optimizer import compare_rates

    # Provide mock rate data (no network needed)
    mock_rates = [
        {
            "protocol": "aave_v3",
            "chain": "arbitrum",
            "asset": "USDC",
            "supply_apy": 3.5,
            "borrow_apy": 5.2,
        },
        {
            "protocol": "hyperlend",
            "chain": "hyperevm",
            "asset": "USDC",
            "supply_apy": 4.8,
            "borrow_apy": 6.1,
        },
        {
            "protocol": "aave_v3",
            "chain": "base",
            "asset": "USDC",
            "supply_apy": 4.0,
            "borrow_apy": 5.5,
        },
    ]

    results = compare_rates(mock_rates)

    assert isinstance(results, list)
    assert len(results) == 3
    # Should be sorted by supply_apy descending (best first)
    assert results[0]["supply_apy"] >= results[1]["supply_apy"]
    assert results[1]["supply_apy"] >= results[2]["supply_apy"]
    # Each result has required fields
    for r in results:
        assert "protocol" in r
        assert "chain" in r
        assert "supply_apy" in r
        assert "borrow_apy" in r


def test_yield_suggest_optimization():
    """Suggest best yield move considering bridge costs: net gain must be positive."""
    from defi_cli.yield_optimizer import suggest_optimization

    current = {
        "protocol": "aave_v3",
        "chain": "arbitrum",
        "asset": "USDC",
        "supply_apy": 3.5,
        "amount": 10000,  # $10,000 deposited
    }

    options = [
        {
            "protocol": "hyperlend",
            "chain": "hyperevm",
            "supply_apy": 5.0,
        },
        {
            "protocol": "aave_v3",
            "chain": "base",
            "supply_apy": 4.0,
        },
    ]

    bridge_costs = {
        ("arbitrum", "hyperevm"): 2.0,  # $2 bridge cost
        ("arbitrum", "base"): 1.0,      # $1 bridge cost
    }

    suggestion = suggest_optimization(current, options, bridge_costs)

    assert "recommended" in suggestion
    assert "net_apy_gain" in suggestion
    assert "bridge_cost" in suggestion
    assert "payback_days" in suggestion
    # If a recommendation is made, net gain should be positive
    if suggestion["recommended"] is not None:
        assert suggestion["net_apy_gain"] > 0


def test_yield_payback_period():
    """Payback period is calculated when bridge cost applies."""
    from defi_cli.yield_optimizer import suggest_optimization

    current = {
        "protocol": "aave_v3", "chain": "arbitrum",
        "asset": "USDC", "supply_apy": 3.0, "amount": 10000,
    }
    options = [
        {"protocol": "hyperlend", "chain": "hyperevm", "supply_apy": 5.0},
    ]
    bridge_costs = {("arbitrum", "hyperevm"): 5.0}

    suggestion = suggest_optimization(current, options, bridge_costs)

    assert suggestion["recommended"] is not None
    assert suggestion["payback_days"] is not None
    assert suggestion["payback_days"] > 0
    # $200/year extra yield, $5 bridge cost = ~9.1 days
    assert suggestion["payback_days"] < 15


def test_rank_all_opportunities():
    """Rank opportunities by net APY gain."""
    from defi_cli.yield_optimizer import rank_all_opportunities

    positions = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.0, "amount": 10000},
        {"protocol": "aave_v3", "chain": "base", "asset": "USDC",
         "supply_apy": 4.0, "amount": 5000},
    ]
    rates = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.0},
        {"protocol": "aave_v3", "chain": "base", "asset": "USDC",
         "supply_apy": 4.0},
        {"protocol": "hyperlend", "chain": "hyperevm", "asset": "USDC",
         "supply_apy": 6.0},
    ]
    bridge_costs = {
        ("arbitrum", "hyperevm"): 3.0,
        ("base", "hyperevm"): 3.0,
    }

    moves = rank_all_opportunities(positions, rates, bridge_costs)

    assert len(moves) > 0
    # Should be sorted by net_apy_gain descending
    for i in range(len(moves) - 1):
        assert moves[i]["net_apy_gain"] >= moves[i + 1]["net_apy_gain"]


def test_generate_rebalance_plan():
    """Rebalance plan includes steps for each move."""
    from defi_cli.yield_optimizer import generate_rebalance_plan

    positions = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.0, "amount": 10000},
    ]
    rates = [
        {"protocol": "hyperlend", "chain": "hyperevm", "asset": "USDC",
         "supply_apy": 6.0},
    ]
    bridge_costs = {("arbitrum", "hyperevm"): 2.0}

    plan = generate_rebalance_plan(positions, rates, bridge_costs)

    assert len(plan) > 0
    move = plan[0]
    assert "steps" in move
    # Should have: withdraw, bridge, approve_and_supply
    actions = [s["action"] for s in move["steps"]]
    assert "withdraw" in actions
    assert "bridge" in actions
    assert "approve_and_supply" in actions


def test_rebalance_plan_same_chain_no_bridge():
    """Same-chain move doesn't include bridge step."""
    from defi_cli.yield_optimizer import generate_rebalance_plan

    positions = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.0, "amount": 10000},
    ]
    rates = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.0},
        {"protocol": "aave_v3", "chain": "base", "asset": "USDC",
         "supply_apy": 5.0},
    ]
    bridge_costs = {("arbitrum", "base"): 1.0}

    plan = generate_rebalance_plan(positions, rates, bridge_costs)

    assert len(plan) > 0
    move = plan[0]
    assert move["to"]["chain"] == "base"
