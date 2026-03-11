"""Integration tests: full DeFi workflows building correct calldata."""

from prepare import CHAINS, PROTOCOLS, SELECTORS, TOKENS

SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_full_supply_workflow():
    """Complete supply workflow: wrap → approve → supply → check position."""
    from defi_cli.approve import build_approve_tx
    from defi_cli.lending import build_supply_tx
    from defi_cli.positions import build_user_account_data_call
    from defi_cli.wrap import build_wrap_tx

    chain = "arbitrum"
    protocol = "aave_v3"
    token_addr = TOKENS[chain]["WETH"]
    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    amount = 10**18  # 1 WETH

    # Step 1: Wrap ETH
    wrap_tx = build_wrap_tx(chain, amount)
    assert wrap_tx["value"] == amount
    assert wrap_tx["to"].lower() == token_addr.lower()

    # Step 2: Approve WETH for pool
    approve_tx = build_approve_tx(chain=chain, token=token_addr, spender=pool)
    assert approve_tx["to"].lower() == token_addr.lower()
    assert approve_tx["data"][:10] == "0x" + SELECTORS["erc20_approve"]

    # Step 3: Supply WETH to Aave
    supply_tx = build_supply_tx(
        protocol=protocol, chain=chain, asset=token_addr,
        amount=amount, on_behalf_of=SENDER,
    )
    assert supply_tx["to"].lower() == pool.lower()
    assert supply_tx["data"][:10] == "0x" + SELECTORS["aave_supply"]

    # Step 4: Check position
    pos_call = build_user_account_data_call(protocol, chain, SENDER)
    assert pos_call["to"].lower() == pool.lower()

    # All on same chain
    assert all(
        tx["chainId"] == CHAINS[chain]["chain_id"]
        for tx in [wrap_tx, approve_tx, supply_tx]
    )


def test_full_swap_workflow():
    """Complete swap workflow: approve → swap → check balance."""
    from defi_cli.approve import build_approve_tx
    from defi_cli.decimals import to_raw
    from defi_cli.dex import build_swap_tx

    chain = "arbitrum"
    protocol = "uniswap_v3"
    router = PROTOCOLS[protocol]["chains"][chain]["swap_router"]
    usdc = TOKENS[chain]["USDC"]
    weth = TOKENS[chain]["WETH"]
    amount = to_raw(1000.0, "USDC")  # 1000 USDC

    # Step 1: Approve USDC for router
    approve_tx = build_approve_tx(chain=chain, token=usdc, spender=router)
    assert approve_tx["to"].lower() == usdc.lower()

    # Step 2: Swap USDC -> WETH
    swap_tx = build_swap_tx(
        protocol=protocol, chain=chain,
        token_in=usdc, token_out=weth,
        amount_in=amount, recipient=SENDER,
    )
    assert swap_tx["to"].lower() == router.lower()
    assert swap_tx["data"][:10] == "0x" + SELECTORS["v3_02_exactInputSingle"]


def test_full_cross_chain_yield_move():
    """Cross-chain yield move: withdraw → bridge → approve → supply."""
    from defi_cli.approve import build_approve_tx
    from defi_cli.bridge import build_cctp_burn_tx
    from defi_cli.lending import build_supply_tx, build_withdraw_tx

    usdc_arb = TOKENS["arbitrum"]["USDC"]
    usdc_base = TOKENS["base"]["USDC"]
    arb_pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    base_pool = PROTOCOLS["aave_v3"]["chains"]["base"]["pool"]
    amount = 5_000_000  # 5 USDC

    # Step 1: Withdraw from Aave on Arbitrum
    withdraw_tx = build_withdraw_tx(
        protocol="aave_v3", chain="arbitrum",
        asset=usdc_arb, amount=amount, to=SENDER,
    )
    assert withdraw_tx["to"].lower() == arb_pool.lower()
    assert withdraw_tx["chainId"] == 42161

    # Step 2: Bridge USDC via CCTP to Base
    bridge_tx = build_cctp_burn_tx(
        from_chain="arbitrum", to_chain="base",
        amount=amount, recipient=SENDER,
    )
    assert bridge_tx["chainId"] == 42161

    # Step 3: Approve USDC on Base
    approve_tx = build_approve_tx(
        chain="base", token=usdc_base, spender=base_pool,
    )
    assert approve_tx["chainId"] == 8453

    # Step 4: Supply to Aave on Base
    supply_tx = build_supply_tx(
        protocol="aave_v3", chain="base",
        asset=usdc_base, amount=amount, on_behalf_of=SENDER,
    )
    assert supply_tx["to"].lower() == base_pool.lower()
    assert supply_tx["chainId"] == 8453


def test_full_cdp_workflow():
    """Felix CDP workflow: open trove → adjust → close."""
    from defi_cli.cdp import (
        build_adjust_trove_tx,
        build_close_trove_tx,
        build_open_trove_tx,
    )

    felix_whype = PROTOCOLS["felix"]["chains"]["hyperevm"]["branches"]["WHYPE"]
    borrower_ops = felix_whype["borrower_operations"]

    # Open trove
    open_tx = build_open_trove_tx(
        chain="hyperevm", collateral="WHYPE",
        coll_amount=10 * 10**18, debt_amount=100 * 10**18, owner=SENDER,
    )
    assert open_tx["to"].lower() == borrower_ops.lower()
    assert open_tx["value"] == 10 * 10**18  # WHYPE is native, sent as value

    # Adjust: add more collateral
    adjust_tx = build_adjust_trove_tx(
        chain="hyperevm", collateral="WHYPE",
        trove_id=1, coll_change=5 * 10**18, debt_change=0,
        is_coll_increase=True, is_debt_increase=False, owner=SENDER,
    )
    assert adjust_tx["to"].lower() == borrower_ops.lower()

    # Close trove
    close_tx = build_close_trove_tx(
        chain="hyperevm", collateral="WHYPE", trove_id=1, owner=SENDER,
    )
    assert close_tx["to"].lower() == borrower_ops.lower()


def test_agent_batch_workflow():
    """Agent batch: approve + supply in one batch."""
    from defi_cli.agent import process_batch

    results = process_batch([
        {
            "type": "approve",
            "chain": "arbitrum",
            "token": "USDC",
            "spender": PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"],
            "amount": 1_000_000,
        },
        {
            "type": "supply",
            "protocol": "aave_v3",
            "chain": "arbitrum",
            "token": "USDC",
            "amount": 1_000_000,
            "sender": SENDER,
        },
    ])

    assert len(results) == 2
    assert all(r["success"] for r in results)
    # First tx targets USDC (approve), second targets pool (supply)
    assert results[0]["tx"]["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert results[1]["tx"]["to"].lower() == pool.lower()


def test_multicall_quote_comparison():
    """Build multicall for cross-DEX quote comparison."""
    from defi_cli.multicall import build_multicall
    from defi_cli.quote import build_multi_quote_calls

    quotes = build_multi_quote_calls(
        chain="arbitrum",
        token_in="USDC",
        token_out="WETH",
        amount_in=1_000_000,
    )

    # Build a multicall from the quote calls
    calls = [q["call"] for q in quotes]
    multicall_tx = build_multicall(calls, chain_id=42161)

    assert multicall_tx["chainId"] == 42161
    assert len(multicall_tx["data"]) > 10
