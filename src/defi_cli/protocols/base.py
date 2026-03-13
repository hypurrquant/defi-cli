"""Abstract base classes for DeFi protocol adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseDEX(ABC):
    """Abstract interface for DEX protocols."""

    def __init__(self, protocol: str, chain: str, config: dict, chain_id: int):
        self.protocol = protocol
        self.chain = chain
        self.config = config
        self.chain_id = chain_id

    @abstractmethod
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
        """Build a swap transaction."""

    @abstractmethod
    def build_quote_call(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        fee: int = 3000,
    ) -> dict:
        """Build a quote eth_call."""

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
        """Build add liquidity tx. Override if supported."""
        raise NotImplementedError(f"{self.protocol} does not support add_liquidity")

    def build_remove_liquidity_tx(
        self,
        token_id: int,
        liquidity: int,
        recipient: str,
        deadline: int = 2**32 - 1,
    ) -> dict:
        """Build remove liquidity tx. Override if supported."""
        raise NotImplementedError(f"{self.protocol} does not support remove_liquidity")

    def build_v2_swap_tx(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        recipient: str,
        deadline: int = 2**32 - 1,
    ) -> dict:
        """Build V2-style swap. Override if supported."""
        raise NotImplementedError(f"{self.protocol} does not support v2 swaps")

    def _tx(self, to: str, data: str, value: int = 0) -> dict:
        return {"to": to, "data": data, "chainId": self.chain_id, "value": value}


class BaseLending(ABC):
    """Abstract interface for lending protocols."""

    def __init__(self, protocol: str, chain: str, config: dict, chain_id: int):
        self.protocol = protocol
        self.chain = chain
        self.config = config
        self.chain_id = chain_id

    @abstractmethod
    def build_supply_tx(
        self, asset: str, amount: int, on_behalf_of: str, **kwargs
    ) -> dict:
        """Build supply/deposit transaction."""

    @abstractmethod
    def build_borrow_tx(
        self, asset: str, amount: int, on_behalf_of: str, **kwargs
    ) -> dict:
        """Build borrow transaction."""

    @abstractmethod
    def build_repay_tx(
        self, asset: str, amount: int, on_behalf_of: str, **kwargs
    ) -> dict:
        """Build repay transaction."""

    @abstractmethod
    def build_withdraw_tx(self, asset: str, amount: int, to: str) -> dict:
        """Build withdraw transaction."""

    @abstractmethod
    def build_get_rates_call(self, asset: str) -> dict:
        """Build rate query call."""

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
        """Build flash loan tx. Override if supported."""
        raise NotImplementedError(f"{self.protocol} does not support flash loans")

    def build_flash_loan_simple_tx(
        self,
        receiver: str,
        asset: str,
        amount: int,
        params: bytes = b"",
        referral_code: int = 0,
    ) -> dict:
        """Build simple flash loan tx. Override if supported."""
        raise NotImplementedError(f"{self.protocol} does not support flash loans")

    def _tx(self, to: str, data: str, value: int = 0) -> dict:
        return {"to": to, "data": data, "chainId": self.chain_id, "value": value}


class BaseCDP(ABC):
    """Abstract interface for CDP protocols."""

    def __init__(self, protocol: str, chain: str, config: dict, chain_id: int):
        self.protocol = protocol
        self.chain = chain
        self.config = config
        self.chain_id = chain_id

    @abstractmethod
    def build_open_position_tx(
        self,
        collateral: str,
        coll_amount: int,
        debt_amount: int,
        owner: str,
        **kwargs,
    ) -> dict:
        """Build open position tx."""

    @abstractmethod
    def build_adjust_position_tx(
        self,
        collateral: str,
        position_id: int,
        coll_change: int,
        debt_change: int,
        is_coll_increase: bool,
        is_debt_increase: bool,
        owner: str,
        **kwargs,
    ) -> dict:
        """Build adjust position tx."""

    @abstractmethod
    def build_close_position_tx(
        self, collateral: str, position_id: int, owner: str
    ) -> dict:
        """Build close position tx."""

    @abstractmethod
    def build_get_position_call(
        self, collateral: str, position_id: int
    ) -> dict:
        """Build position info query."""

    def _tx(self, to: str, data: str, value: int = 0) -> dict:
        return {"to": to, "data": data, "chainId": self.chain_id, "value": value}


class BaseBridge(ABC):
    """Abstract interface for bridge protocols."""

    def __init__(self, protocol: str, config: dict):
        self.protocol = protocol
        self.config = config

    @abstractmethod
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
        """Build bridge transaction or return API params."""

    def _tx(self, to: str, data: str, chain_id: int, value: int = 0) -> dict:
        return {"to": to, "data": data, "chainId": chain_id, "value": value}
