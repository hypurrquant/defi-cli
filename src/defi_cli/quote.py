"""Swap price quoting via QuoterV2 contracts.

Thin wrappers that delegate to protocol adapters.
"""

from defi_cli.protocols import get_dex
from defi_cli.registry import PROTOCOLS, resolve_token


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
    """
    token_in_addr = resolve_token(chain, token_in)
    token_out_addr = resolve_token(chain, token_out)
    return get_dex(protocol, chain).build_quote_call(
        token_in=token_in_addr, token_out=token_out_addr,
        amount_in=amount_in, fee=fee,
    )


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
