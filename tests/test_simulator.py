"""Tests for transaction simulator."""

from unittest.mock import patch

from eth_abi import encode

SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_simulate_swap_success():
    """simulate_swap returns decoded quote result."""
    from defi_cli.simulator import simulate_swap

    # QuoterV2 returns (amountOut, sqrtPriceX96After, ticksCrossed, gasEstimate)
    quote_result = encode(
        ["uint256", "uint160", "uint32", "uint256"],
        [2000 * 10**18, 10**30, 1, 150_000],
    )
    mock_rpc = {"success": True, "result": "0x" + quote_result.hex()}

    with (
        patch("defi_cli.quote.build_quote_call", return_value={"to": "0x1", "data": "0x2"}),
        patch("defi_cli.fetcher.eth_call", return_value=mock_rpc),
    ):
        result = simulate_swap("uniswap_v3", "arbitrum", "USDC", "WETH", 1_000_000)

    assert result["success"] is True
    assert result["amount_out"] == 2000 * 10**18
    assert result["gas_estimate"] == 150_000


def test_simulate_swap_failure():
    """simulate_swap handles RPC failure."""
    from defi_cli.simulator import simulate_swap

    mock_rpc = {"success": False, "error": "execution reverted"}

    with (
        patch("defi_cli.quote.build_quote_call", return_value={"to": "0x1", "data": "0x2"}),
        patch("defi_cli.fetcher.eth_call", return_value=mock_rpc),
    ):
        result = simulate_swap("uniswap_v3", "arbitrum", "USDC", "WETH", 1_000_000)

    assert result["success"] is False


def test_simulate_supply():
    """simulate_supply returns dry-run result."""
    from defi_cli.simulator import simulate_supply

    mock_dry = {"success": True, "result": "0x" + "00" * 32}

    with (
        patch("defi_cli.lending.build_supply_tx", return_value={
            "to": "0x1", "data": "0x2", "chainId": 42161}),
        patch("defi_cli.executor.dry_run", return_value=mock_dry),
    ):
        result = simulate_supply("aave_v3", "arbitrum", "0x" + "ab" * 20, 1000, SENDER)

    assert result["success"] is True
    assert result["will_succeed"] is True
    assert result["tx_preview"]["chainId"] == 42161


def test_simulate_supply_fails():
    """simulate_supply reports failure from dry-run."""
    from defi_cli.simulator import simulate_supply

    mock_dry = {"success": False, "result": "execution reverted"}

    with (
        patch("defi_cli.lending.build_supply_tx", return_value={
            "to": "0x1", "data": "0x2", "chainId": 42161}),
        patch("defi_cli.executor.dry_run", return_value=mock_dry),
    ):
        result = simulate_supply("aave_v3", "arbitrum", "0x" + "ab" * 20, 1000, SENDER)

    assert result["success"] is True
    assert result["will_succeed"] is False
    assert "reverted" in result["error"]


def test_estimate_total_gas():
    """estimate_total_gas sums conservative estimates."""
    from defi_cli.simulator import estimate_total_gas

    actions = [
        {"type": "approve", "chain": "arbitrum", "token": "USDC",
         "spender": "0x" + "11" * 20},
        {"type": "swap", "protocol": "uniswap_v3", "chain": "arbitrum",
         "token_in": "USDC", "token_out": "WETH",
         "amount_in": 1000, "recipient": SENDER},
    ]

    result = estimate_total_gas(actions)
    assert result["total_gas"] == 50_000 + 250_000
    assert len(result["per_action"]) == 2
    assert result["per_action"][0] == 50_000  # approve
    assert result["per_action"][1] == 250_000  # swap


def test_estimate_gas_per_type():
    """Each action type has a reasonable gas estimate."""
    from defi_cli.simulator import _estimate_gas_for_type

    assert _estimate_gas_for_type("native_transfer") == 21_000
    assert _estimate_gas_for_type("approve") == 50_000
    assert _estimate_gas_for_type("swap") == 250_000
    assert _estimate_gas_for_type("flash_loan") == 500_000
    # Unknown type gets default
    assert _estimate_gas_for_type("unknown") == 200_000


def test_simulate_batch():
    """simulate_batch processes multiple actions."""
    from defi_cli.simulator import simulate_batch

    quote_result = encode(
        ["uint256", "uint160", "uint32", "uint256"],
        [500 * 10**6, 10**30, 1, 100_000],
    )
    mock_swap_rpc = {"success": True, "result": "0x" + quote_result.hex()}
    mock_supply_dry = {"success": True, "result": "0x" + "00" * 32}

    actions = [
        {"type": "swap", "protocol": "uniswap_v3", "chain": "arbitrum",
         "token_in": "USDC", "token_out": "WETH", "amount_in": 1000},
        {"type": "supply", "protocol": "aave_v3", "chain": "arbitrum",
         "token": "0x" + "ab" * 20, "amount": 1000, "sender": SENDER},
    ]

    with (
        patch("defi_cli.quote.build_quote_call", return_value={"to": "0x1", "data": "0x2"}),
        patch("defi_cli.fetcher.eth_call", return_value=mock_swap_rpc),
        patch("defi_cli.lending.build_supply_tx", return_value={
            "to": "0x1", "data": "0x2", "chainId": 42161}),
        patch("defi_cli.executor.dry_run", return_value=mock_supply_dry),
    ):
        results = simulate_batch(actions)

    assert len(results) == 2
    assert results[0]["action_type"] == "swap"
    assert results[0]["success"] is True
    assert results[1]["action_type"] == "supply"
    assert results[1]["will_succeed"] is True
