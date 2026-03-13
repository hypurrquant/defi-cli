"""UniswapV3 SwapRouter02 adapter (used by uniswap_v3 on ARB/Base)."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseDEX


class UniswapV3Router02(BaseDEX):
    """DEX adapter for the ``uniswap_v3_router02`` interface.

    This covers Uniswap V3 deployments that use the newer SwapRouter02
    contract (no ``deadline`` field inside the swap struct).
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
        """Build an exactInputSingle swap via SwapRouter02.

        Selector ``04e45aaf`` — struct has no deadline field.
        """
        selector = "04e45aaf"
        params = encode(
            ["(address,address,uint24,address,uint256,uint256,uint160)"],
            [(token_in, token_out, fee, recipient, amount_in, 0, 0)],
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

        Selector ``c6a5026a`` — tuple encoding with fee.
        """
        selector = "c6a5026a"
        params = encode(
            ["(address,address,uint256,uint24,uint160)"],
            [(token_in, token_out, amount_in, fee, 0)],
        )
        calldata = "0x" + selector + params.hex()
        return {"to": self.config["quoter_v2"], "data": calldata, "chainId": self.chain_id}

    # --------------------------------------------------------- add liquidity

    def build_add_liquidity_tx(
        self,
        token_a: str,
        token_b: str,
        amount_a: int,
        amount_b: int,
        fee: int,
        tick_lower: int,
        tick_upper: int,
        recipient: str,
        deadline: int = 2**32 - 1,
    ) -> dict:
        """Build NonfungiblePositionManager.mint() tx.

        Selector ``88316456``.
        """
        selector = "88316456"
        params = encode(
            [
                "(address,address,uint24,int24,int24,"
                "uint256,uint256,uint256,uint256,address,uint256)"
            ],
            [
                (
                    token_a,
                    token_b,
                    fee,
                    tick_lower,
                    tick_upper,
                    amount_a,
                    amount_b,
                    0,
                    0,
                    recipient,
                    deadline,
                )
            ],
        )
        calldata = "0x" + selector + params.hex()
        return self._tx(self.config["position_manager"], calldata)

    # ------------------------------------------------------ remove liquidity

    def build_remove_liquidity_tx(
        self,
        token_id: int,
        liquidity: int,
        recipient: str,
        deadline: int = 2**32 - 1,
    ) -> dict:
        """Build NonfungiblePositionManager.decreaseLiquidity() tx.

        Selector ``0c49ccbe``.
        """
        selector = "0c49ccbe"
        params = encode(
            ["(uint256,uint128,uint256,uint256,uint256)"],
            [(token_id, liquidity, 0, 0, deadline)],
        )
        calldata = "0x" + selector + params.hex()
        return self._tx(self.config["position_manager"], calldata)
