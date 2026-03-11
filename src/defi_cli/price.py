"""Price feed queries via protocol oracles and Chainlink."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, resolve_token


def build_get_asset_price_call(
    protocol: str,
    chain: str,
    asset: str,
) -> dict:
    """Build Aave V3 Oracle getAssetPrice(address) eth_call.

    Returns price in base currency (usually USD, 8 decimals).

    Args:
        protocol: Lending protocol name.
        chain: Chain name.
        asset: Token symbol or address.

    Returns:
        Dict for eth_call.
    """
    oracle = PROTOCOLS[protocol]["chains"][chain].get("oracle")
    if not oracle:
        raise ValueError(f"{protocol} on {chain} has no oracle address")

    chain_id = CHAINS[chain]["chain_id"]
    asset_addr = resolve_token(chain, asset)

    # getAssetPrice(address) selector: b3596f07
    selector = "b3596f07"
    params = encode(["address"], [asset_addr])

    return {
        "to": oracle,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getAssetPrice(address)",
    }


def build_multi_price_calls(
    protocol: str,
    chain: str,
    assets: list[str],
) -> list[dict]:
    """Build price calls for multiple assets on a protocol's oracle."""
    return [
        {
            "asset": asset,
            "call": build_get_asset_price_call(protocol, chain, asset),
        }
        for asset in assets
    ]


def build_get_asset_prices_call(
    protocol: str,
    chain: str,
    assets: list[str],
) -> dict:
    """Build Aave V3 Oracle getAssetsPrices(address[]) — batch price query.

    Returns all prices in one call.
    selector: 9d23d9f2
    """
    oracle = PROTOCOLS[protocol]["chains"][chain].get("oracle")
    if not oracle:
        raise ValueError(f"{protocol} on {chain} has no oracle address")

    chain_id = CHAINS[chain]["chain_id"]
    asset_addrs = [resolve_token(chain, a) for a in assets]

    selector = "9d23d9f2"
    params = encode(["address[]"], [asset_addrs])

    return {
        "to": oracle,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getAssetsPrices(address[])",
    }
