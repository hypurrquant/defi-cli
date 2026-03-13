"""UniswapV3 original SwapRouter adapter (used by hyperswap, projectx)."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseDEX


class UniswapV3Router(BaseDEX):
    """DEX adapter for the ``uniswap_v3_router`` interface.

    This covers forks that deploy the original Uniswap V3 SwapRouter
    contract which includes a ``deadline`` field inside the swap struct.
    Used by HyperSwap and ProjectX on HyperEVM.
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
        """Build an exactInputSingle swap via the original SwapRouter.

        Selector ``414bf389`` — struct includes deadline.
        """
        selector = "414bf389"
        params = encode(
            ["(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
            [(token_in, token_out, fee, recipient, deadline, amount_in, 0, 0)],
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
        """Build a QuoterV2.quoteExactInputSingle eth_call.

        Selector ``c6a5026a`` — same tuple encoding as SwapRouter02.
        """
        selector = "c6a5026a"
        params = encode(
            ["(address,address,uint256,uint24,uint160)"],
            [(token_in, token_out, amount_in, fee, 0)],
        )
        calldata = "0x" + selector + params.hex()
        return {"to": self.config["quoter_v2"], "data": calldata, "chainId": self.chain_id}

    # ----------------------------------------------------------- V2 swap

    def build_v2_swap_tx(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        recipient: str,
        deadline: int = 2**32 - 1,
    ) -> dict:
        """Build a V2 swapExactTokensForTokens tx.

        Selector ``38ed1739``.  Router address from ``self.config["v2_router"]``.
        """
        v2_router = self.config.get("v2_router")
        if not v2_router:
            raise ValueError(
                f"{self.protocol} on {self.chain} has no v2_router"
            )

        selector = "38ed1739"
        params = encode(
            ["uint256", "uint256", "address[]", "address", "uint256"],
            [amount_in, 0, [token_in, token_out], recipient, deadline],
        )
        calldata = "0x" + selector + params.hex()
        return self._tx(v2_router, calldata)
