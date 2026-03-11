"""Tests for DEX operations (swap, add/remove liquidity)."""

from prepare import CHAINS, PROTOCOLS, SELECTORS, TOKENS


def test_uniswap_v3_swap_arbitrum(sender):
    """Build Uniswap V3 swap tx on Arbitrum: correct SwapRouter02 + selector."""
    from defi_cli.dex import build_swap_tx

    tx = build_swap_tx(
        protocol="uniswap_v3",
        chain="arbitrum",
        token_in=TOKENS["arbitrum"]["USDC"],
        token_out=TOKENS["arbitrum"]["WETH"],
        amount_in=1000 * 10**6,  # 1000 USDC
        recipient=sender,
    )

    expected_router = PROTOCOLS["uniswap_v3"]["chains"]["arbitrum"]["swap_router"]
    assert tx["to"].lower() == expected_router.lower()
    # SwapRouter02 uses 04e45aaf selector (no deadline in struct)
    assert tx["data"][:10] == "0x" + SELECTORS["v3_02_exactInputSingle"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_uniswap_v3_swap_base(sender):
    """Build Uniswap V3 swap tx on Base: correct chain-specific addresses."""
    from defi_cli.dex import build_swap_tx

    tx = build_swap_tx(
        protocol="uniswap_v3",
        chain="base",
        token_in=TOKENS["base"]["USDC"],
        token_out=TOKENS["base"]["WETH"],
        amount_in=500 * 10**6,
        recipient=sender,
    )

    expected_router = PROTOCOLS["uniswap_v3"]["chains"]["base"]["swap_router"]
    assert tx["to"].lower() == expected_router.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["v3_02_exactInputSingle"]
    assert tx["chainId"] == CHAINS["base"]["chain_id"]


def test_hyperswap_swap(sender):
    """Build HyperSwap V3 swap tx on HyperEVM: original SwapRouter interface."""
    from defi_cli.dex import build_swap_tx

    tx = build_swap_tx(
        protocol="hyperswap",
        chain="hyperevm",
        token_in=TOKENS["hyperevm"]["USDC"],
        token_out=TOKENS["hyperevm"]["WHYPE"],
        amount_in=100 * 10**6,
        recipient=sender,
    )

    expected_router = PROTOCOLS["hyperswap"]["chains"]["hyperevm"]["swap_router"]
    assert tx["to"].lower() == expected_router.lower()
    # HyperSwap uses original V3 SwapRouter (with deadline in struct)
    assert tx["data"][:10] == "0x" + SELECTORS["v3_exactInputSingle"]
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def test_kittenswap_swap(sender):
    """Build KittenSwap swap tx on HyperEVM: Algebra interface, correct router."""
    from defi_cli.dex import build_swap_tx

    tx = build_swap_tx(
        protocol="kittenswap",
        chain="hyperevm",
        token_in=TOKENS["hyperevm"]["USDC"],
        token_out=TOKENS["hyperevm"]["WHYPE"],
        amount_in=100 * 10**6,
        recipient=sender,
    )

    expected_router = PROTOCOLS["kittenswap"]["chains"]["hyperevm"]["swap_router"]
    assert tx["to"].lower() == expected_router.lower()
    # Algebra uses different struct (no fee field), verify calldata is present
    assert len(tx["data"]) > 10
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def test_dex_add_liquidity(sender):
    """Build add liquidity tx via NonfungiblePositionManager.mint()."""
    from defi_cli.dex import build_add_liquidity_tx

    tx = build_add_liquidity_tx(
        protocol="uniswap_v3",
        chain="arbitrum",
        token_a=TOKENS["arbitrum"]["USDC"],
        token_b=TOKENS["arbitrum"]["WETH"],
        amount_a=1000 * 10**6,
        amount_b=10**18 // 3,
        fee=3000,
        tick_lower=-887220,
        tick_upper=887220,
        recipient=sender,
    )

    expected_pm = PROTOCOLS["uniswap_v3"]["chains"]["arbitrum"]["position_manager"]
    assert tx["to"].lower() == expected_pm.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["v3_mint"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_dex_remove_liquidity(sender):
    """Build remove liquidity tx targeting NonfungiblePositionManager."""
    from defi_cli.dex import build_remove_liquidity_tx

    tx = build_remove_liquidity_tx(
        protocol="uniswap_v3",
        chain="arbitrum",
        token_id=12345,
        liquidity=10**18,
        recipient=sender,
    )

    expected_pm = PROTOCOLS["uniswap_v3"]["chains"]["arbitrum"]["position_manager"]
    assert tx["to"].lower() == expected_pm.lower()
    # Could be decreaseLiquidity or multicall(decreaseLiquidity + collect)
    assert len(tx["data"]) > 10
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]
