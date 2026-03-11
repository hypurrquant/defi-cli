"""Tests for swap price quoting."""

from prepare import PROTOCOLS


def test_quote_uniswap_v3_structure():
    """QuoterV2 call targets correct quoter with right selector."""
    from defi_cli.quote import build_quote_call

    call = build_quote_call(
        protocol="uniswap_v3",
        chain="arbitrum",
        token_in="USDC",
        token_out="WETH",
        amount_in=1_000_000,
    )

    quoter = PROTOCOLS["uniswap_v3"]["chains"]["arbitrum"]["quoter_v2"]
    assert call["to"].lower() == quoter.lower()
    # quoteExactInputSingle selector = c6a5026a
    assert call["data"][:10] == "0xc6a5026a"
    assert call["chainId"] == 42161


def test_quote_algebra_no_fee():
    """Algebra QuoterV2 uses different selector (no fee param)."""
    from defi_cli.quote import build_quote_call

    call = build_quote_call(
        protocol="kittenswap",
        chain="hyperevm",
        token_in="USDC",
        token_out="WHYPE",
        amount_in=500_000,
    )

    quoter = PROTOCOLS["kittenswap"]["chains"]["hyperevm"]["quoter_v2"]
    assert call["to"].lower() == quoter.lower()
    # Algebra selector: cdca1753
    assert call["data"][:10] == "0xcdca1753"
    assert call["chainId"] == 999


def test_multi_quote_finds_dexes():
    """Multi-quote returns calls for all DEXes on a chain."""
    from defi_cli.quote import build_multi_quote_calls

    results = build_multi_quote_calls(
        chain="arbitrum",
        token_in="USDC",
        token_out="WETH",
        amount_in=1_000_000,
    )

    # At least uniswap_v3 on arbitrum has quoter_v2
    assert len(results) >= 1
    protocols = [r["protocol"] for r in results]
    assert "uniswap_v3" in protocols

    for r in results:
        assert "call" in r
        assert r["call"]["chainId"] == 42161


def test_multi_quote_hyperevm():
    """Multi-quote on hyperevm finds kittenswap."""
    from defi_cli.quote import build_multi_quote_calls

    results = build_multi_quote_calls(
        chain="hyperevm",
        token_in="USDC",
        token_out="WHYPE",
        amount_in=100_000,
    )

    protocols = [r["protocol"] for r in results]
    assert "kittenswap" in protocols
