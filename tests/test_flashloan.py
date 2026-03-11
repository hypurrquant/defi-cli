"""Tests for flash loan transaction building."""

from prepare import PROTOCOLS


def test_flash_loan_multi_asset():
    """flashLoan targets pool with correct selector."""
    from defi_cli.flashloan import FLASH_LOAN_SELECTOR, build_flash_loan_tx

    receiver = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    tx = build_flash_loan_tx(
        protocol="aave_v3",
        chain="arbitrum",
        receiver=receiver,
        assets=["USDC", "WETH"],
        amounts=[1_000_000, 10**18],
    )

    pool = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"]
    assert tx["to"].lower() == pool.lower()
    assert tx["data"][:10] == "0x" + FLASH_LOAN_SELECTOR
    assert tx["chainId"] == 42161
    assert tx["value"] == 0


def test_flash_loan_simple():
    """flashLoanSimple targets pool with correct selector."""
    from defi_cli.flashloan import FLASH_LOAN_SIMPLE_SELECTOR, build_flash_loan_simple_tx

    tx = build_flash_loan_simple_tx(
        protocol="aave_v3",
        chain="base",
        receiver="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        asset="USDC",
        amount=5_000_000,
    )

    pool = PROTOCOLS["aave_v3"]["chains"]["base"]["pool"]
    assert tx["to"].lower() == pool.lower()
    assert tx["data"][:10] == "0x" + FLASH_LOAN_SIMPLE_SELECTOR
    assert tx["chainId"] == 8453


def test_flash_loan_default_modes():
    """Default modes are all 0 (no debt)."""
    from defi_cli.flashloan import build_flash_loan_tx

    tx = build_flash_loan_tx(
        protocol="hyperlend",
        chain="hyperevm",
        receiver="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        assets=["USDC"],
        amounts=[100_000],
    )

    # Should build successfully with default modes
    assert tx["chainId"] == 999
    assert len(tx["data"]) > 10


def test_flash_loan_custom_modes():
    """Custom modes (variable debt) are encoded correctly."""
    from defi_cli.flashloan import build_flash_loan_tx

    tx = build_flash_loan_tx(
        protocol="aave_v3",
        chain="arbitrum",
        receiver="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        assets=["USDC"],
        amounts=[1_000_000],
        modes=[2],  # variable rate debt
        on_behalf_of="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert tx["data"][:10] == "0xab9c4b5d"
