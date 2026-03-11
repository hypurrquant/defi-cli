"""Tests for CDP operations (Felix — Liquity V2 fork on HyperEVM)."""

from prepare import CHAINS, PROTOCOLS


def _felix_whype_borrower_ops() -> str:
    return PROTOCOLS["felix"]["chains"]["hyperevm"]["branches"]["WHYPE"]["borrower_operations"]


def test_felix_open_trove(sender):
    """Build Felix open trove tx: targets WHYPE BorrowerOperations on HyperEVM."""
    from defi_cli.cdp import build_open_trove_tx

    tx = build_open_trove_tx(
        chain="hyperevm",
        collateral="WHYPE",
        coll_amount=10 * 10**18,   # 10 WHYPE
        debt_amount=100 * 10**18,  # 100 feUSD
        owner=sender,
    )

    assert tx["to"].lower() == _felix_whype_borrower_ops().lower()
    assert len(tx["data"]) > 10  # Has calldata
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def test_felix_adjust_trove(sender):
    """Build Felix adjust trove tx: add collateral and/or mint more feUSD."""
    from defi_cli.cdp import build_adjust_trove_tx

    tx = build_adjust_trove_tx(
        chain="hyperevm",
        collateral="WHYPE",
        trove_id=1,
        coll_change=5 * 10**18,   # add 5 WHYPE
        debt_change=50 * 10**18,  # mint 50 more feUSD
        is_coll_increase=True,
        is_debt_increase=True,
        owner=sender,
    )

    assert tx["to"].lower() == _felix_whype_borrower_ops().lower()
    assert len(tx["data"]) > 10
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def test_felix_close_trove(sender):
    """Build Felix close trove tx: repay all debt and withdraw collateral."""
    from defi_cli.cdp import build_close_trove_tx

    tx = build_close_trove_tx(
        chain="hyperevm",
        collateral="WHYPE",
        trove_id=1,
        owner=sender,
    )

    assert tx["to"].lower() == _felix_whype_borrower_ops().lower()
    assert len(tx["data"]) > 10
    assert tx["chainId"] == CHAINS["hyperevm"]["chain_id"]


def _felix_whype_trove_manager() -> str:
    return PROTOCOLS["felix"]["chains"]["hyperevm"]["branches"]["WHYPE"]["trove_manager"]


def test_felix_get_trove_debt():
    """Build getTroveDebt call targeting TroveManager."""
    from defi_cli.cdp import build_get_trove_debt_call

    call = build_get_trove_debt_call(
        chain="hyperevm", collateral="WHYPE", trove_id=1,
    )

    assert call["to"].lower() == _felix_whype_trove_manager().lower()
    assert len(call["data"]) > 10
    assert call["chainId"] == 999


def test_felix_get_trove_coll():
    """Build getTroveColl call targeting TroveManager."""
    from defi_cli.cdp import build_get_trove_coll_call

    call = build_get_trove_coll_call(
        chain="hyperevm", collateral="WHYPE", trove_id=42,
    )

    assert call["to"].lower() == _felix_whype_trove_manager().lower()
    assert len(call["data"]) > 10


def _felix_whype_stability_pool() -> str:
    return PROTOCOLS["felix"]["chains"]["hyperevm"]["branches"]["WHYPE"]["stability_pool"]


def test_felix_sp_deposit():
    """Build stability pool deposit tx."""
    from defi_cli.cdp import build_deposit_to_sp_tx

    tx = build_deposit_to_sp_tx(
        chain="hyperevm", collateral="WHYPE", amount=100 * 10**18,
    )

    assert tx["to"].lower() == _felix_whype_stability_pool().lower()
    assert len(tx["data"]) > 10
    assert tx["chainId"] == 999
    assert tx["value"] == 0


def test_felix_sp_withdraw():
    """Build stability pool withdraw tx."""
    from defi_cli.cdp import build_withdraw_from_sp_tx

    tx = build_withdraw_from_sp_tx(
        chain="hyperevm", collateral="WHYPE", amount=50 * 10**18,
    )

    assert tx["to"].lower() == _felix_whype_stability_pool().lower()
    assert len(tx["data"]) > 10


def test_felix_get_trove_info():
    """Build Troves mapping call."""
    from defi_cli.cdp import build_get_trove_info_call

    call = build_get_trove_info_call(
        chain="hyperevm", collateral="WHYPE", trove_id=1,
    )

    assert call["to"].lower() == _felix_whype_trove_manager().lower()
    assert call["chainId"] == 999
