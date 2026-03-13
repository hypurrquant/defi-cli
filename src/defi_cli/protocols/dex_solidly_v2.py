"""Solidly/Velodrome V2 DEX adapter (used by Aerodrome on Base)."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseDEX

# swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)
SWAP_SELECTOR = "cac88ea9"

# getAmountsOut(uint256,(address,address,bool,address)[])
GET_AMOUNTS_OUT_SELECTOR = "5509a1ac"


class SolidlyV2(BaseDEX):
    """DEX adapter for the ``solidly_v2`` interface.

    Solidly/Velodrome V2 forks (Aerodrome on Base) use a Route struct
    with ``(address from, address to, bool stable, address factory)``
    for routing, instead of Uniswap-style fee tiers.
    """

    def build_swap_tx(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        recipient: str,
        fee: int = 3000,
        deadline: int = 2**32 - 1,
        slippage: float = 0.005,
        stable: bool = False,
    ) -> dict:
        """Build a swapExactTokensForTokens tx.

        Routes through a single pool. The ``stable`` flag selects between
        volatile (x*y=k) and stable (Curve-style) pool types.

        The ``fee`` parameter is ignored (Solidly pools don't use fee tiers).
        The factory is read from ``self.config["factory"]``.
        """
        factory = self.config["factory"]

        # Route struct: (address from, address to, bool stable, address factory)
        routes = [(token_in, token_out, stable, factory)]

        params = encode(
            ["uint256", "uint256", "(address,address,bool,address)[]", "address", "uint256"],
            [amount_in, 0, routes, recipient, deadline],
        )

        calldata = "0x" + SWAP_SELECTOR + params.hex()
        return self._tx(self.config["router"], calldata)

    def build_quote_call(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        fee: int = 3000,
        stable: bool = False,
    ) -> dict:
        """Build a getAmountsOut read call for price quoting.

        The ``fee`` parameter is ignored.
        """
        factory = self.config["factory"]
        routes = [(token_in, token_out, stable, factory)]

        params = encode(
            ["uint256", "(address,address,bool,address)[]"],
            [amount_in, routes],
        )

        calldata = "0x" + GET_AMOUNTS_OUT_SELECTOR + params.hex()
        return {"to": self.config["router"], "data": calldata, "chainId": self.chain_id}
