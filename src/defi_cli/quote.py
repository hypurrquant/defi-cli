"""Swap price quoting via QuoterV2 contracts."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, resolve_token


def build_quote_call(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> dict:
    """Build a QuoterV2.quoteExactInputSingle eth_call.

    Works with Uniswap V3, HyperSwap, and Algebra-based DEXes.

    Returns:
        Dict with "to", "data", "chainId" for eth_call.
    """
    token_in_addr = resolve_token(chain, token_in)
    token_out_addr = resolve_token(chain, token_out)
    chain_id = CHAINS[chain]["chain_id"]
    interface = PROTOCOLS[protocol]["interface"]
    config = PROTOCOLS[protocol]["chains"][chain]

    quoter_addr = config.get("quoter_v2")
    if not quoter_addr:
        raise ValueError(f"{protocol} on {chain} has no quoter_v2 address")

    if interface == "algebra_v3":
        # Algebra QuoterV2: quoteExactInputSingle(
        #   address tokenIn, address tokenOut, uint256 amountIn,
        #   uint160 sqrtPriceLimitX96
        # ) — no fee param
        # selector: cdca1753
        selector = "cdca1753"
        params = encode(
            ["address", "address", "uint256", "uint160"],
            [token_in_addr, token_out_addr, amount_in, 0],
        )
    else:
        # Uniswap V3 QuoterV2: quoteExactInputSingle(
        #   (address tokenIn, address tokenOut, uint256 amountIn,
        #    uint24 fee, uint160 sqrtPriceLimitX96)
        # )
        # selector: c6a5026a
        selector = "c6a5026a"
        params = encode(
            ["(address,address,uint256,uint24,uint160)"],
            [(token_in_addr, token_out_addr, amount_in, fee, 0)],
        )

    return {
        "to": quoter_addr,
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
    }


def build_multi_quote_calls(
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> list[dict]:
    """Build quote calls for all DEX protocols on a chain.

    Returns list of dicts, each with "protocol", "call" keys.
    Useful for comparing prices across DEXes.
    """
    results = []
    for name, proto in PROTOCOLS.items():
        if proto["type"] != "dex":
            continue
        if chain not in proto.get("chains", {}):
            continue
        if "quoter_v2" not in proto["chains"][chain]:
            continue

        try:
            call = build_quote_call(
                protocol=name, chain=chain,
                token_in=token_in, token_out=token_out,
                amount_in=amount_in, fee=fee,
            )
            results.append({"protocol": name, "call": call})
        except ValueError:
            continue

    return results
