"""Across V3 bridge protocol adapter."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseBridge
from defi_cli.registry import CHAINS, TOKENS

ZERO_ADDR = "0x" + "00" * 20

# depositV3 selector
DEPOSIT_V3_SELECTOR = "e7a7ed02"


class AcrossBridge(BaseBridge):
    """Across V3 bridge adapter using SpokePool contracts.

    Config must contain ``chains.<chain>.spoke_pool`` for each supported chain.
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
        """Build depositV3 transaction on the source chain SpokePool.

        depositV3(address depositor, address recipient,
                  address inputToken, address outputToken,
                  uint256 inputAmount, uint256 outputAmount,
                  uint256 destinationChainId, address exclusiveRelayer,
                  uint32 quoteTimestamp, uint32 fillDeadline,
                  uint32 exclusivityDeadline, bytes message)
        """
        spoke_pool = self.config["chains"][from_chain]["spoke_pool"]
        chain_id = CHAINS[from_chain]["chain_id"]
        dest_chain_id = CHAINS[to_chain]["chain_id"]

        token_addr = TOKENS[from_chain].get(token, token)
        output_token = TOKENS[to_chain].get(token, token)

        params = encode(
            [
                "address", "address", "address", "address",
                "uint256", "uint256", "uint256", "address",
                "uint32", "uint32", "uint32", "bytes",
            ],
            [
                recipient,                              # depositor
                recipient,                              # recipient
                token_addr,                             # inputToken
                output_token,                           # outputToken
                amount,                                 # inputAmount
                0,                                      # outputAmount (0 = market)
                dest_chain_id,                          # destinationChainId
                ZERO_ADDR,                              # exclusiveRelayer
                kwargs.get("quote_timestamp", 0),       # quoteTimestamp
                kwargs.get("fill_deadline", 2**32 - 1), # fillDeadline
                kwargs.get("exclusivity_deadline", 0),  # exclusivityDeadline
                kwargs.get("message", b""),             # message
            ],
        )

        data = "0x" + DEPOSIT_V3_SELECTOR + params.hex()
        return self._tx(spoke_pool, data, chain_id)

    def build_quote_params(
        self,
        from_chain: str,
        to_chain: str,
        token: str,
        amount: int,
        sender: str,
    ) -> dict:
        """Build Across /suggested-fees request parameters."""
        token_addr = TOKENS[from_chain].get(token, token)

        return {
            "originChainId": CHAINS[from_chain]["chain_id"],
            "destinationChainId": CHAINS[to_chain]["chain_id"],
            "inputToken": token_addr,
            "amount": str(amount),
            "recipient": sender,
        }
