"""Tests for transaction pipeline (approve-then-execute workflows)."""

from prepare import PROTOCOLS, SELECTORS, TOKENS


def test_supply_pipeline_builds_two_steps():
    """Supply pipeline produces approve + supply transactions."""
    from defi_cli.pipeline import build_supply_pipeline

    steps = build_supply_pipeline(
        protocol="aave_v3",
        chain="arbitrum",
        token="USDC",
        amount=1_000_000,
        sender="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert len(steps) == 2

    # Step 0: approve
    assert steps[0]["data"][:10] == "0x" + SELECTORS["erc20_approve"]
    assert steps[0]["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert "label" in steps[0]

    # Step 1: supply
    assert steps[1]["data"][:10] == "0x" + SELECTORS["aave_supply"]
    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert steps[1]["to"].lower() == pool.lower()


def test_swap_pipeline_builds_two_steps():
    """Swap pipeline produces approve + swap transactions."""
    from defi_cli.pipeline import build_swap_pipeline

    steps = build_swap_pipeline(
        protocol="uniswap_v3",
        chain="arbitrum",
        token_in="USDC",
        token_out="WETH",
        amount_in=1_000_000,
        recipient="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert len(steps) == 2

    # Step 0: approve USDC for router
    assert steps[0]["data"][:10] == "0x" + SELECTORS["erc20_approve"]
    assert steps[0]["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()

    # Step 1: swap
    assert steps[1]["data"][:10] == "0x" + SELECTORS["v3_02_exactInputSingle"]
    router = PROTOCOLS["uniswap_v3"]["chains"]["arbitrum"]["swap_router"]
    assert steps[1]["to"].lower() == router.lower()


def test_repay_pipeline_builds_two_steps():
    """Repay pipeline produces approve + repay transactions."""
    from defi_cli.pipeline import build_repay_pipeline

    steps = build_repay_pipeline(
        protocol="aave_v3",
        chain="arbitrum",
        token="USDC",
        amount=500_000,
        sender="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert len(steps) == 2
    assert steps[0]["data"][:10] == "0x" + SELECTORS["erc20_approve"]
    assert steps[1]["data"][:10] == "0x" + SELECTORS["aave_repay"]


def test_pipeline_chain_ids_match():
    """All steps in a pipeline have the same chainId."""
    from defi_cli.pipeline import build_supply_pipeline

    steps = build_supply_pipeline(
        protocol="hyperlend",
        chain="hyperevm",
        token="USDC",
        amount=100_000,
        sender="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    chain_ids = [s["chainId"] for s in steps]
    assert all(cid == 999 for cid in chain_ids)


def test_pipeline_labels_present():
    """Each step in pipeline has a descriptive label."""
    from defi_cli.pipeline import build_swap_pipeline

    steps = build_swap_pipeline(
        protocol="uniswap_v3",
        chain="base",
        token_in="USDC",
        token_out="WETH",
        amount_in=5_000_000,
        recipient="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    for step in steps:
        assert "label" in step
        assert len(step["label"]) > 0
