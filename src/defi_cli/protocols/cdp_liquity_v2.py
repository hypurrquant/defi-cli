"""Liquity V2 CDP protocol adapter (Felix on HyperEVM)."""

from __future__ import annotations

from eth_abi import encode
from web3 import Web3

from defi_cli.protocols.base import BaseCDP

ZERO_ADDR = "0x" + "00" * 20

OPEN_TROVE_SELECTOR = Web3.keccak(
    text="openTrove(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address,address)"
)[:4].hex()

ADJUST_TROVE_SELECTOR = Web3.keccak(
    text="adjustTrove(uint256,uint256,bool,uint256,bool,uint256)"
)[:4].hex()

CLOSE_TROVE_SELECTOR = Web3.keccak(
    text="closeTrove(uint256)"
)[:4].hex()

GET_TROVE_DEBT_SELECTOR = Web3.keccak(
    text="getTroveDebt(uint256)"
)[:4].hex()

GET_TROVE_COLL_SELECTOR = Web3.keccak(
    text="getTroveColl(uint256)"
)[:4].hex()

PROVIDE_TO_SP_SELECTOR = Web3.keccak(
    text="provideToSP(uint256,bool)"
)[:4].hex()

WITHDRAW_FROM_SP_SELECTOR = Web3.keccak(
    text="withdrawFromSP(uint256,bool)"
)[:4].hex()


class LiquityV2CDP(BaseCDP):
    """Liquity V2 CDP adapter for Felix on HyperEVM.

    Config must contain a ``branches`` dict keyed by collateral symbol
    (e.g. ``self.config["branches"]["WHYPE"]``), where each branch has
    ``borrower_operations``, ``trove_manager``, ``stability_pool``, etc.
    """

    def _get_branch(self, collateral: str) -> dict:
        """Get branch config for a collateral type."""
        branches = self.config.get("branches", {})
        if collateral not in branches:
            raise ValueError(
                f"Unknown collateral {collateral} for {self.protocol} on {self.chain}"
            )
        return branches[collateral]

    def build_open_position_tx(
        self,
        collateral: str,
        coll_amount: int,
        debt_amount: int,
        owner: str,
        max_upfront_fee: int = 10**18,
        annual_interest_rate: int = 5 * 10**16,
    ) -> dict:
        """Build openTrove transaction on BorrowerOperations.

        openTrove(address,uint256,uint256,uint256,uint256,uint256,
                  uint256,uint256,address,address,address)
        """
        branch = self._get_branch(collateral)

        params = encode(
            [
                "address", "uint256", "uint256", "uint256",
                "uint256", "uint256", "uint256", "uint256",
                "address", "address", "address",
            ],
            [
                owner,                  # _owner
                0,                      # _ownerIndex
                coll_amount,            # _collAmount
                debt_amount,            # _boldAmount
                0,                      # _upperHint
                0,                      # _lowerHint
                annual_interest_rate,   # _annualInterestRate
                max_upfront_fee,        # _maxUpfrontFee
                ZERO_ADDR,              # _addManager
                ZERO_ADDR,              # _removeManager
                ZERO_ADDR,              # _receiver
            ],
        )

        data = "0x" + OPEN_TROVE_SELECTOR + params.hex()
        value = coll_amount if collateral == "WHYPE" else 0
        return self._tx(branch["borrower_operations"], data, value)

    def build_adjust_position_tx(
        self,
        collateral: str,
        position_id: int,
        coll_change: int,
        debt_change: int,
        is_coll_increase: bool,
        is_debt_increase: bool,
        owner: str,
        max_upfront_fee: int = 10**18,
    ) -> dict:
        """Build adjustTrove(uint256,uint256,bool,uint256,bool,uint256) tx."""
        branch = self._get_branch(collateral)

        params = encode(
            ["uint256", "uint256", "bool", "uint256", "bool", "uint256"],
            [
                position_id,
                coll_change,
                is_coll_increase,
                debt_change,
                is_debt_increase,
                max_upfront_fee,
            ],
        )

        data = "0x" + ADJUST_TROVE_SELECTOR + params.hex()
        value = coll_change if (collateral == "WHYPE" and is_coll_increase) else 0
        return self._tx(branch["borrower_operations"], data, value)

    def build_close_position_tx(
        self, collateral: str, position_id: int, owner: str
    ) -> dict:
        """Build closeTrove(uint256) tx."""
        branch = self._get_branch(collateral)

        params = encode(["uint256"], [position_id])
        data = "0x" + CLOSE_TROVE_SELECTOR + params.hex()
        return self._tx(branch["borrower_operations"], data)

    def build_get_position_call(
        self, collateral: str, position_id: int
    ) -> dict:
        """Build eth_call dicts for getTroveDebt and getTroveColl.

        Returns a dict with ``debt_call`` and ``coll_call`` entries.
        """
        branch = self._get_branch(collateral)
        params = encode(["uint256"], [position_id])

        debt_data = "0x" + GET_TROVE_DEBT_SELECTOR + params.hex()
        coll_data = "0x" + GET_TROVE_COLL_SELECTOR + params.hex()

        return {
            "debt_call": {
                "to": branch["trove_manager"],
                "data": debt_data,
                "chainId": self.chain_id,
                "method_info": "getTroveDebt(uint256)",
            },
            "coll_call": {
                "to": branch["trove_manager"],
                "data": coll_data,
                "chainId": self.chain_id,
                "method_info": "getTroveColl(uint256)",
            },
        }

    def build_deposit_to_sp_tx(self, collateral: str, amount: int) -> dict:
        """Build provideToSP(uint256,bool) tx on StabilityPool."""
        branch = self._get_branch(collateral)

        if "stability_pool" not in branch:
            raise ValueError(
                f"No stability pool for {collateral} on {self.chain}"
            )

        params = encode(["uint256", "bool"], [amount, True])
        data = "0x" + PROVIDE_TO_SP_SELECTOR + params.hex()
        return self._tx(branch["stability_pool"], data)

    def build_withdraw_from_sp_tx(self, collateral: str, amount: int) -> dict:
        """Build withdrawFromSP(uint256,bool) tx on StabilityPool."""
        branch = self._get_branch(collateral)

        if "stability_pool" not in branch:
            raise ValueError(
                f"No stability pool for {collateral} on {self.chain}"
            )

        params = encode(["uint256", "bool"], [amount, True])
        data = "0x" + WITHDRAW_FROM_SP_SELECTOR + params.hex()
        return self._tx(branch["stability_pool"], data)
