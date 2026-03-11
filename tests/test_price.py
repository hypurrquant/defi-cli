"""Tests for price feed queries."""

from prepare import PROTOCOLS


def test_get_asset_price_call():
    """getAssetPrice targets oracle with correct selector."""
    from defi_cli.price import build_get_asset_price_call

    call = build_get_asset_price_call(
        protocol="aave_v3", chain="arbitrum", asset="USDC",
    )

    oracle = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["oracle"]
    assert call["to"].lower() == oracle.lower()
    assert call["data"][:10] == "0xb3596f07"
    assert call["chainId"] == 42161


def test_get_asset_price_hyperlend():
    """Price query works for HyperLend on HyperEVM."""
    from defi_cli.price import build_get_asset_price_call

    call = build_get_asset_price_call(
        protocol="hyperlend", chain="hyperevm", asset="USDC",
    )

    oracle = PROTOCOLS["hyperlend"]["chains"]["hyperevm"]["oracle"]
    assert call["to"].lower() == oracle.lower()
    assert call["chainId"] == 999


def test_multi_price_calls():
    """Multi-price returns one call per asset."""
    from defi_cli.price import build_multi_price_calls

    results = build_multi_price_calls(
        protocol="aave_v3", chain="arbitrum",
        assets=["USDC", "WETH", "USDT"],
    )

    assert len(results) == 3
    for r in results:
        assert "asset" in r
        assert "call" in r
        assert r["call"]["data"][:10] == "0xb3596f07"


def test_batch_prices_call():
    """getAssetsPrices encodes array of addresses."""
    from defi_cli.price import build_get_asset_prices_call

    call = build_get_asset_prices_call(
        protocol="aave_v3", chain="arbitrum",
        assets=["USDC", "WETH"],
    )

    oracle = PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["oracle"]
    assert call["to"].lower() == oracle.lower()
    assert call["data"][:10] == "0x9d23d9f2"
    # Should have encoded 2 addresses
    assert len(call["data"]) > 100
