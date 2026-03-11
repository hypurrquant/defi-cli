"""Tests for lending protocol operations."""

from prepare import CHAINS, PROTOCOLS, SELECTORS, TOKENS


def test_aave_v3_supply(sender):
    """Build Aave V3 supply tx on Arbitrum: correct Pool address + selector."""
    from defi_cli.lending import build_supply_tx

    tx = build_supply_tx(
        protocol="aave_v3",
        chain="arbitrum",
        asset=TOKENS["arbitrum"]["USDC"],
        amount=1000 * 10**6,
        on_behalf_of=sender,
    )

    expected_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == expected_pool.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["aave_supply"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_aave_v3_borrow(sender):
    """Build Aave V3 borrow tx: variable rate mode."""
    from defi_cli.lending import build_borrow_tx

    tx = build_borrow_tx(
        protocol="aave_v3",
        chain="arbitrum",
        asset=TOKENS["arbitrum"]["USDC"],
        amount=500 * 10**6,
        on_behalf_of=sender,
    )

    expected_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == expected_pool.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["aave_borrow"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_aave_v3_repay(sender):
    """Build Aave V3 repay tx."""
    from defi_cli.lending import build_repay_tx

    tx = build_repay_tx(
        protocol="aave_v3",
        chain="arbitrum",
        asset=TOKENS["arbitrum"]["USDC"],
        amount=500 * 10**6,
        on_behalf_of=sender,
    )

    expected_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == expected_pool.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["aave_repay"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_aave_v3_withdraw(sender):
    """Build Aave V3 withdraw tx."""
    from defi_cli.lending import build_withdraw_tx

    tx = build_withdraw_tx(
        protocol="aave_v3",
        chain="arbitrum",
        asset=TOKENS["arbitrum"]["USDC"],
        amount=1000 * 10**6,
        to=sender,
    )

    expected_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == expected_pool.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["aave_withdraw"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_hyperlend_supply(sender):
    """Build HyperLend supply tx on HyperEVM: same Aave V3 interface, different pool."""
    from defi_cli.lending import build_supply_tx

    tx = build_supply_tx(
        protocol="hyperlend",
        chain="hyperevm",
        asset=TOKENS["hyperevm"]["USDC"],
        amount=100 * 10**6,
        on_behalf_of=sender,
    )

    expected_pool = PROTOCOLS["hyperlend"]["chains"]["hyperevm"]["pool"]
    assert tx["to"].lower() == expected_pool.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["aave_supply"]
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def test_lending_get_rates_call():
    """Build getReserveData call to query lending/borrow APY."""
    from defi_cli.lending import build_get_rates_call

    call = build_get_rates_call(
        protocol="aave_v3",
        chain="arbitrum",
        asset=TOKENS["arbitrum"]["USDC"],
    )

    expected_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert call["to"].lower() == expected_pool.lower()
    assert call["data"][:10] == "0x" + SELECTORS["aave_getReserveData"]
