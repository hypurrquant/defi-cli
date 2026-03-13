"""Algebra V3 (Integral) DEX adapter (used by kittenswap, nest)."""

from __future__ import annotations

from eth_abi import encode
from web3 import Web3

from defi_cli.protocols.base import BaseDEX

# Pre-compute the Algebra exactInputSingle selector once at import time.
_ALGEBRA_EXACT_INPUT_SINGLE_SEL = Web3.keccak(
    text="exactInputSingle((address,address,address,uint256,uint256,uint256,uint160))"
)[:4].hex()


class AlgebraV3(BaseDEX):
    """DEX adapter for the ``algebra_v3`` interface.

    Algebra Integral does not use a fee tier — pools are identified
    solely by the token pair.  Used by KittenSwap and NEST on HyperEVM.
    """

    # ------------------------------------------------------------------ swap

    def build_swap_tx(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        recipient: str,
        fee: int = 3000,
        deadline: int = 2**32 - 1,
        slippage: float = 0.005,
    ) -> dict:
        """Build an Algebra exactInputSingle swap.

        No fee field — struct is
        ``(address tokenIn, address tokenOut, address recipient,
          uint256 deadline, uint256 amountIn,
          uint256 amountOutMinimum, uint160 limitSqrtPrice)``.
        """
        selector = _ALGEBRA_EXACT_INPUT_SINGLE_SEL
        params = encode(
            ["(address,address,address,uint256,uint256,uint256,uint160)"],
            [(token_in, token_out, recipient, deadline, amount_in, 0, 0)],
        )
        calldata = "0x" + selector + params.hex()
        return self._tx(self.config["swap_router"], calldata)

    # ------------------------------------------------------------------ quote

    def build_quote_call(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        fee: int = 3000,
    ) -> dict:
        """Build an Algebra QuoterV2.quoteExactInputSingle eth_call.

        Selector ``cdca1753`` — flat params, no fee.
        """
        selector = "cdca1753"
        params = encode(
            ["address", "address", "uint256", "uint160"],
            [token_in, token_out, amount_in, 0],
        )
        calldata = "0x" + selector + params.hex()
        return {"to": self.config["quoter_v2"], "data": calldata, "chainId": self.chain_id}
