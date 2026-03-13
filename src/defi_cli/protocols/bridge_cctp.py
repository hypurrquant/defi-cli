"""CCTP V2 bridge protocol adapter."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseBridge
from defi_cli.registry import CHAINS, TOKENS

# depositForBurn(uint256,uint32,bytes32,address)
DEPOSIT_FOR_BURN_SELECTOR = "6fd3504e"


class CCTPBridge(BaseBridge):
    """Circle CCTP V2 bridge adapter.

    Config must contain ``contracts.token_messenger`` and a ``domains`` dict
    mapping chain names to CCTP domain IDs.
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
        """Build depositForBurn(uint256,uint32,bytes32,address) tx.

        Burns USDC on the source chain for minting on the destination.
        """
        dest_domain = self.config["domains"][to_chain]
        usdc_address = TOKENS[from_chain]["USDC"]
        chain_id = CHAINS[from_chain]["chain_id"]

        # Convert recipient address to bytes32 (left-padded with zeros)
        recipient_bytes32 = bytes.fromhex(recipient.replace("0x", "").zfill(64))

        params = encode(
            ["uint256", "uint32", "bytes32", "address"],
            [amount, dest_domain, recipient_bytes32, usdc_address],
        )

        data = "0x" + DEPOSIT_FOR_BURN_SELECTOR + params.hex()
        return self._tx(
            self.config["contracts"]["token_messenger"],
            data,
            chain_id,
        )
