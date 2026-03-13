"""GMX V1 DEX adapter (spot swaps via GMX Vault on Arbitrum)."""

from __future__ import annotations

from eth_abi import encode
from web3 import Web3

from defi_cli.protocols.base import BaseDEX

# swap(address[] _path, uint256 _amountIn, uint256 _minOut, address _receiver)
GMX_SWAP_SELECTOR = Web3.keccak(
    text="swap(address[],uint256,uint256,address)"
)[:4].hex()


class GmxV1(BaseDEX):
    """DEX adapter for GMX V1 spot swaps on Arbitrum.

    GMX V1 uses its own Router contract with a simple path-based swap.
    No fee tiers or deadlines — swaps go through the GMX Vault's
    internal pricing using Chainlink oracle prices.
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
        min_out: int = 0,
    ) -> dict:
        """Build a GMX V1 Router.swap tx.

        swap(address[] _path, uint256 _amountIn, uint256 _minOut, address _receiver)

        The ``fee`` and ``deadline`` params are ignored (GMX doesn't use them).
        """
        path = [token_in, token_out]

        params = encode(
            ["address[]", "uint256", "uint256", "address"],
            [path, amount_in, min_out, recipient],
        )

        calldata = "0x" + GMX_SWAP_SELECTOR + params.hex()
        return self._tx(self.config["router"], calldata)

    def build_quote_call(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        fee: int = 3000,
    ) -> dict:
        """GMX V1 doesn't have an on-chain quoter.

        Raises NotImplementedError — use the Reader contract or
        off-chain price feeds for quoting.
        """
        raise NotImplementedError(
            "GMX V1 has no on-chain quoter. Use Reader.getMaxAmountIn() or oracle prices."
        )
