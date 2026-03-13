"""Aave V3 lending protocol adapter."""

from __future__ import annotations

from eth_abi import encode

from defi_cli.protocols.base import BaseLending

# Function selectors (4-byte hex, no 0x prefix)
AAVE_SUPPLY_SELECTOR = "617ba037"
AAVE_BORROW_SELECTOR = "a415bcad"
AAVE_REPAY_SELECTOR = "573ade81"
AAVE_WITHDRAW_SELECTOR = "69328dec"
AAVE_GET_RESERVE_DATA_SELECTOR = "35ea6a75"
FLASH_LOAN_SELECTOR = "ab9c4b5d"
FLASH_LOAN_SIMPLE_SELECTOR = "42b0b77c"


class AaveV3Lending(BaseLending):
    """Aave V3 lending protocol adapter.

    Implements supply, borrow, repay, withdraw, rate queries, and flash loans
    for any Aave V3-compatible pool (aave_v3, hyperlend, hypurrfi).
    """

    def build_supply_tx(
        self,
        asset: str,
        amount: int,
        on_behalf_of: str,
        referral_code: int = 0,
    ) -> dict:
        """Build supply(address,uint256,address,uint16) transaction."""
        params = encode(
            ["address", "uint256", "address", "uint16"],
            [asset, amount, on_behalf_of, referral_code],
        )
        data = "0x" + AAVE_SUPPLY_SELECTOR + params.hex()
        return self._tx(self.config["pool"], data)

    def build_borrow_tx(
        self,
        asset: str,
        amount: int,
        on_behalf_of: str,
        interest_rate_mode: int = 2,
        referral_code: int = 0,
    ) -> dict:
        """Build borrow(address,uint256,uint256,uint16,address) transaction."""
        params = encode(
            ["address", "uint256", "uint256", "uint16", "address"],
            [asset, amount, interest_rate_mode, referral_code, on_behalf_of],
        )
        data = "0x" + AAVE_BORROW_SELECTOR + params.hex()
        return self._tx(self.config["pool"], data)

    def build_repay_tx(
        self,
        asset: str,
        amount: int,
        on_behalf_of: str,
        interest_rate_mode: int = 2,
    ) -> dict:
        """Build repay(address,uint256,uint256,address) transaction."""
        params = encode(
            ["address", "uint256", "uint256", "address"],
            [asset, amount, interest_rate_mode, on_behalf_of],
        )
        data = "0x" + AAVE_REPAY_SELECTOR + params.hex()
        return self._tx(self.config["pool"], data)

    def build_withdraw_tx(self, asset: str, amount: int, to: str) -> dict:
        """Build withdraw(address,uint256,address) transaction."""
        params = encode(
            ["address", "uint256", "address"],
            [asset, amount, to],
        )
        data = "0x" + AAVE_WITHDRAW_SELECTOR + params.hex()
        return self._tx(self.config["pool"], data)

    def build_get_rates_call(self, asset: str) -> dict:
        """Build getReserveData(address) eth_call for rate queries.

        Returns a read-only call dict (no chainId/value).
        """
        params = encode(["address"], [asset])
        data = "0x" + AAVE_GET_RESERVE_DATA_SELECTOR + params.hex()
        return {"to": self.config["pool"], "data": data}

    def build_flash_loan_tx(
        self,
        receiver: str,
        assets: list[str],
        amounts: list[int],
        modes: list[int] | None = None,
        on_behalf_of: str | None = None,
        params: bytes = b"",
        referral_code: int = 0,
    ) -> dict:
        """Build flashLoan multi-asset transaction."""
        if modes is None:
            modes = [0] * len(assets)
        if on_behalf_of is None:
            on_behalf_of = receiver

        encoded = encode(
            [
                "address",
                "address[]",
                "uint256[]",
                "uint256[]",
                "address",
                "bytes",
                "uint16",
            ],
            [receiver, assets, amounts, modes, on_behalf_of, params, referral_code],
        )
        data = "0x" + FLASH_LOAN_SELECTOR + encoded.hex()
        return self._tx(self.config["pool"], data)

    def build_flash_loan_simple_tx(
        self,
        receiver: str,
        asset: str,
        amount: int,
        params: bytes = b"",
        referral_code: int = 0,
    ) -> dict:
        """Build flashLoanSimple(address,address,uint256,bytes,uint16) transaction."""
        encoded = encode(
            ["address", "address", "uint256", "bytes", "uint16"],
            [receiver, asset, amount, params, referral_code],
        )
        data = "0x" + FLASH_LOAN_SIMPLE_SELECTOR + encoded.hex()
        return self._tx(self.config["pool"], data)
