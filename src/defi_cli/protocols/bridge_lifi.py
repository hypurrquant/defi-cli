"""LI.FI bridge protocol adapter."""

from __future__ import annotations

from defi_cli.protocols.base import BaseBridge
from defi_cli.registry import CHAINS, TOKENS


class LiFiBridge(BaseBridge):
    """LI.FI bridge adapter (API-based).

    LI.FI is a DEX/bridge aggregator that uses a REST API to obtain
    quotes and transaction data. This adapter returns request parameters
    rather than on-chain calldata.
    """

    def build_bridge_tx(
        self,
        from_chain: str,
        to_chain: str,
        token: str,
        amount: int,
        sender: str,
        recipient: str,
        **kwargs,
    ) -> dict:
        """Build LI.FI /quote API request parameters.

        Returns a dict with ``type: "api_request"`` and ``params`` suitable
        for passing to the LI.FI quote endpoint.
        """
        from_token_addr = TOKENS[from_chain].get(token, token)
        to_token_addr = TOKENS[to_chain].get(token, token)

        return {
            "type": "api_request",
            "params": {
                "fromChain": str(CHAINS[from_chain]["chain_id"]),
                "toChain": str(CHAINS[to_chain]["chain_id"]),
                "fromToken": from_token_addr,
                "toToken": to_token_addr,
                "fromAmount": str(amount),
                "fromAddress": sender,
            },
        }
