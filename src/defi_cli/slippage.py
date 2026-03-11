"""Slippage protection and MEV-aware swap parameters."""


def calculate_min_output(
    expected_output: int,
    slippage_bps: int = 50,
) -> int:
    """Calculate minimum output amount with slippage tolerance.

    Args:
        expected_output: Expected output from quoter.
        slippage_bps: Slippage tolerance in basis points (50 = 0.5%).

    Returns:
        Minimum acceptable output amount.
    """
    return expected_output * (10000 - slippage_bps) // 10000


def calculate_max_input(
    expected_input: int,
    slippage_bps: int = 50,
) -> int:
    """Calculate maximum input amount with slippage tolerance.

    Args:
        expected_input: Expected input from quoter.
        slippage_bps: Slippage tolerance in basis points.

    Returns:
        Maximum acceptable input amount.
    """
    return expected_input * (10000 + slippage_bps) // 10000


def detect_price_impact(
    amount_in: int,
    amount_out: int,
    market_price: float,
    token_in_decimals: int = 18,
    token_out_decimals: int = 18,
) -> dict:
    """Detect price impact of a swap.

    Args:
        amount_in: Input amount in raw units.
        amount_out: Output amount in raw units.
        market_price: Current market price (token_out per token_in).
        token_in_decimals: Decimals for input token.
        token_out_decimals: Decimals for output token.

    Returns:
        {"price_impact_bps": int, "severity": str, "warning": str|None}
    """
    if amount_in == 0 or market_price == 0:
        return {"price_impact_bps": 0, "severity": "none", "warning": None}

    # Normalize amounts
    normalized_in = amount_in / (10 ** token_in_decimals)
    normalized_out = amount_out / (10 ** token_out_decimals)

    # Expected output at market price
    expected_out = normalized_in * market_price

    if expected_out == 0:
        return {"price_impact_bps": 0, "severity": "none", "warning": None}

    # Price impact = (expected - actual) / expected
    impact = (expected_out - normalized_out) / expected_out
    impact_bps = int(impact * 10000)

    if impact_bps < 10:
        severity = "negligible"
        warning = None
    elif impact_bps < 50:
        severity = "low"
        warning = None
    elif impact_bps < 200:
        severity = "moderate"
        warning = f"Price impact {impact_bps/100:.2f}% — consider splitting the trade"
    elif impact_bps < 500:
        severity = "high"
        warning = f"HIGH price impact {impact_bps/100:.2f}% — strongly consider splitting"
    else:
        severity = "extreme"
        warning = f"EXTREME price impact {impact_bps/100:.2f}% — do NOT proceed"

    return {
        "price_impact_bps": impact_bps,
        "severity": severity,
        "warning": warning,
    }


def suggest_split_sizes(
    amount_in: int,
    max_impact_bps: int = 50,
    num_splits: int | None = None,
) -> list[int]:
    """Suggest how to split a large trade to reduce price impact.

    Args:
        amount_in: Total input amount.
        max_impact_bps: Target maximum impact per chunk.
        num_splits: Number of splits. If None, auto-calculated.

    Returns:
        List of amounts for each chunk.
    """
    if num_splits is None:
        # Heuristic: split larger amounts more
        # This is a simplified approach; real implementation
        # would use on-chain liquidity data
        if amount_in < 1000:
            num_splits = 1
        elif amount_in < 100_000:
            num_splits = 2
        elif amount_in < 1_000_000:
            num_splits = 4
        else:
            num_splits = 8

    if num_splits <= 1:
        return [amount_in]

    chunk = amount_in // num_splits
    remainder = amount_in - chunk * num_splits
    splits = [chunk] * num_splits
    splits[-1] += remainder
    return splits


def build_deadline(seconds_from_now: int = 300) -> int:
    """Build a deadline timestamp for swap transactions.

    Args:
        seconds_from_now: Seconds until deadline (default: 5 min).

    Returns:
        Unix timestamp for the deadline.
    """
    import time

    return int(time.time()) + seconds_from_now
