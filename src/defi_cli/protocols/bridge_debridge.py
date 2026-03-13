"""deBridge bridge protocol adapter."""

from __future__ import annotations

from defi_cli.protocols.base import BaseBridge
from defi_cli.registry import TOKENS


class DeBridgeBridge(BaseBridge):
    """deBridge DLN bridge adapter (API-based).

    Config must contain ``chain_ids`` mapping chain names to deBridge-specific
    chain IDs (which may differ from EVM chain IDs, e.g. hyperevm uses
    100000022).
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
        """Build deBridge /dln/order/create-tx API request parameters.

        Returns a dict with ``type: "api_request"`` and ``params`` suitable
        for passing to the deBridge order creation endpoint.
        """
        from_token_addr = TOKENS[from_chain].get(token, token)
        to_token_addr = TOKENS[to_chain].get(token, token)

        return {
            "type": "api_request",
            "params": {
                "srcChainId": str(self.config["chain_ids"][from_chain]),
                "dstChainId": str(self.config["chain_ids"][to_chain]),
                "srcChainTokenIn": from_token_addr,
                "dstChainTokenOut": to_token_addr,
                "srcChainTokenInAmount": str(amount),
                "dstChainTokenOutAmount": "auto",
                "dstChainTokenOutRecipient": recipient,
                "srcChainOrderAuthorityAddress": sender,
                "dstChainOrderAuthorityAddress": recipient,
            },
        }
