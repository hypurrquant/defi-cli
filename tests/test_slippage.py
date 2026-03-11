"""Tests for slippage protection and MEV helpers."""


def test_calculate_min_output_default():
    """Default 0.5% slippage on output."""
    from defi_cli.slippage import calculate_min_output

    # 1000 tokens with 0.5% slippage = 995
    result = calculate_min_output(1000, slippage_bps=50)
    assert result == 995


def test_calculate_min_output_1_percent():
    """1% slippage protection."""
    from defi_cli.slippage import calculate_min_output

    result = calculate_min_output(10000, slippage_bps=100)
    assert result == 9900


def test_calculate_max_input():
    """Max input increases by slippage tolerance."""
    from defi_cli.slippage import calculate_max_input

    result = calculate_max_input(1000, slippage_bps=50)
    assert result == 1005


def test_detect_price_impact_negligible():
    """Small swap has negligible price impact."""
    from defi_cli.slippage import detect_price_impact

    # 1 ETH in, 3000 USDC out, market price 3000 USDC/ETH
    result = detect_price_impact(
        amount_in=10**18,
        amount_out=3000 * 10**6,
        market_price=3000.0,
        token_in_decimals=18,
        token_out_decimals=6,
    )
    assert result["severity"] == "negligible"
    assert result["warning"] is None


def test_detect_price_impact_moderate():
    """Moderate price impact detected."""
    from defi_cli.slippage import detect_price_impact

    # 1 ETH in, only 2970 USDC out (1% impact), market 3000
    result = detect_price_impact(
        amount_in=10**18,
        amount_out=2970 * 10**6,
        market_price=3000.0,
        token_in_decimals=18,
        token_out_decimals=6,
    )
    assert result["severity"] == "moderate"
    assert result["warning"] is not None
    assert result["price_impact_bps"] == 100


def test_detect_price_impact_extreme():
    """Extreme price impact triggers warning."""
    from defi_cli.slippage import detect_price_impact

    # 1 ETH in, only 1500 USDC out (50% impact), market 3000
    result = detect_price_impact(
        amount_in=10**18,
        amount_out=1500 * 10**6,
        market_price=3000.0,
        token_in_decimals=18,
        token_out_decimals=6,
    )
    assert result["severity"] == "extreme"
    assert "do NOT" in result["warning"]


def test_detect_price_impact_zero_amount():
    """Zero input returns no impact."""
    from defi_cli.slippage import detect_price_impact

    result = detect_price_impact(0, 0, 3000.0)
    assert result["severity"] == "none"


def test_suggest_split_small():
    """Small amounts don't need splitting."""
    from defi_cli.slippage import suggest_split_sizes

    splits = suggest_split_sizes(500)
    assert splits == [500]


def test_suggest_split_large():
    """Large amounts get split into chunks."""
    from defi_cli.slippage import suggest_split_sizes

    splits = suggest_split_sizes(1_000_000)
    assert len(splits) == 8  # 1M gets 8 splits
    assert sum(splits) == 1_000_000


def test_suggest_split_custom():
    """Custom number of splits."""
    from defi_cli.slippage import suggest_split_sizes

    splits = suggest_split_sizes(1000, num_splits=3)
    assert len(splits) == 3
    assert sum(splits) == 1000
    # Last chunk gets remainder
    assert splits[0] == 333
    assert splits[-1] == 334


def test_build_deadline():
    """build_deadline returns future timestamp."""
    import time

    from defi_cli.slippage import build_deadline

    now = int(time.time())
    deadline = build_deadline(300)
    assert deadline >= now + 299
    assert deadline <= now + 301
