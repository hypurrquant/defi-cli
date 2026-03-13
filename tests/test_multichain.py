"""Tests for multi-chain protocol support (BSC, Base, Arbitrum expansion)."""

import pytest

from defi_cli.protocols import get_dex, get_lending
from defi_cli.registry import CHAINS, PROTOCOLS, TOKENS, resolve_token

# ── Chain registry tests ────────────────────────────────────────────────────


class TestChainRegistry:
    def test_bsc_chain_exists(self):
        assert "bsc" in CHAINS
        assert CHAINS["bsc"]["chain_id"] == 56
        assert CHAINS["bsc"]["native_token"] == "BNB"

    def test_all_chains_have_required_fields(self):
        for name, chain in CHAINS.items():
            assert "chain_id" in chain, f"{name} missing chain_id"
            assert "rpc_url" in chain, f"{name} missing rpc_url"
            assert "native_token" in chain, f"{name} missing native_token"


# ── Token registry tests ────────────────────────────────────────────────────


class TestTokenRegistry:
    def test_bsc_tokens(self):
        bsc = TOKENS["bsc"]
        assert "WBNB" in bsc
        assert "USDC" in bsc
        assert "USDT" in bsc
        assert "ETH" in bsc
        assert "BTCB" in bsc

    def test_arbitrum_new_tokens(self):
        arb = TOKENS["arbitrum"]
        assert "WBTC" in arb
        assert "DAI" in arb
        assert "LINK" in arb
        assert "GMX" in arb

    def test_base_new_tokens(self):
        base = TOKENS["base"]
        assert "USDbC" in base
        assert "DAI" in base
        assert "cbETH" in base
        assert "AERO" in base

    def test_resolve_token_bsc(self):
        addr = resolve_token("bsc", "WBNB")
        assert addr.startswith("0x")

    def test_resolve_token_passthrough(self):
        addr = "0x1234567890abcdef1234567890abcdef12345678"
        assert resolve_token("bsc", addr) == addr


# ── PancakeSwap V3 on BSC tests ─────────────────────────────────────────────


class TestPancakeSwapV3:
    def test_protocol_registered(self):
        assert "pancakeswap_v3" in PROTOCOLS
        assert PROTOCOLS["pancakeswap_v3"]["interface"] == "uniswap_v3_router"
        assert "bsc" in PROTOCOLS["pancakeswap_v3"]["chains"]

    def test_get_dex_adapter(self):
        dex = get_dex("pancakeswap_v3", "bsc")
        assert dex.protocol == "pancakeswap_v3"
        assert dex.chain == "bsc"
        assert dex.chain_id == 56

    def test_build_swap_tx(self):
        dex = get_dex("pancakeswap_v3", "bsc")
        tx = dex.build_swap_tx(
            token_in=TOKENS["bsc"]["USDC"],
            token_out=TOKENS["bsc"]["WBNB"],
            amount_in=1_000_000,
            recipient="0x" + "ab" * 20,
            fee=2500,
        )
        assert tx["to"] == "0x1b81D678ffb9C0263b24A97847620C99d213eB14"
        assert tx["chainId"] == 56
        assert tx["data"].startswith("0x414bf389")  # v3_exactInputSingle
        assert tx["value"] == 0

    def test_build_quote_call(self):
        dex = get_dex("pancakeswap_v3", "bsc")
        call = dex.build_quote_call(
            token_in=TOKENS["bsc"]["USDC"],
            token_out=TOKENS["bsc"]["WBNB"],
            amount_in=1_000_000,
        )
        assert call["to"] == "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997"
        assert call["chainId"] == 56
        assert call["data"].startswith("0xc6a5026a")


# ── Camelot on Arbitrum tests ────────────────────────────────────────────────


class TestCamelot:
    def test_protocol_registered(self):
        assert "camelot" in PROTOCOLS
        assert PROTOCOLS["camelot"]["interface"] == "algebra_v3"
        assert "arbitrum" in PROTOCOLS["camelot"]["chains"]

    def test_build_swap_tx(self):
        dex = get_dex("camelot", "arbitrum")
        tx = dex.build_swap_tx(
            token_in=TOKENS["arbitrum"]["WETH"],
            token_out=TOKENS["arbitrum"]["USDC"],
            amount_in=10**18,
            recipient="0x" + "cd" * 20,
        )
        assert tx["to"] == "0x1F721E2E82F6676FCE4eA07A5958cF098D339e18"
        assert tx["chainId"] == 42161
        # Algebra V3 uses computed selector, not 414bf389
        assert not tx["data"].startswith("0x414bf389")
        assert tx["value"] == 0

    def test_build_quote_call(self):
        dex = get_dex("camelot", "arbitrum")
        call = dex.build_quote_call(
            token_in=TOKENS["arbitrum"]["WETH"],
            token_out=TOKENS["arbitrum"]["USDC"],
            amount_in=10**18,
        )
        assert call["to"] == "0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E"
        assert call["data"].startswith("0xcdca1753")  # Algebra quoter


# ── Aerodrome on Base tests ──────────────────────────────────────────────────


class TestAerodrome:
    def test_protocol_registered(self):
        assert "aerodrome" in PROTOCOLS
        assert PROTOCOLS["aerodrome"]["interface"] == "solidly_v2"
        assert "base" in PROTOCOLS["aerodrome"]["chains"]

    def test_build_swap_tx_volatile(self):
        dex = get_dex("aerodrome", "base")
        tx = dex.build_swap_tx(
            token_in=TOKENS["base"]["WETH"],
            token_out=TOKENS["base"]["USDC"],
            amount_in=10**18,
            recipient="0x" + "ef" * 20,
            stable=False,
        )
        assert tx["to"] == "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"
        assert tx["chainId"] == 8453
        assert tx["data"].startswith("0xcac88ea9")  # solidly swap selector
        assert tx["value"] == 0

    def test_build_swap_tx_stable(self):
        dex = get_dex("aerodrome", "base")
        tx_volatile = dex.build_swap_tx(
            token_in=TOKENS["base"]["USDC"],
            token_out=TOKENS["base"]["USDbC"],
            amount_in=1_000_000,
            recipient="0x" + "ef" * 20,
            stable=False,
        )
        tx_stable = dex.build_swap_tx(
            token_in=TOKENS["base"]["USDC"],
            token_out=TOKENS["base"]["USDbC"],
            amount_in=1_000_000,
            recipient="0x" + "ef" * 20,
            stable=True,
        )
        # Same selector, different calldata (stable flag encoded differently)
        assert tx_volatile["data"][:10] == tx_stable["data"][:10]
        assert tx_volatile["data"] != tx_stable["data"]

    def test_build_quote_call(self):
        dex = get_dex("aerodrome", "base")
        call = dex.build_quote_call(
            token_in=TOKENS["base"]["WETH"],
            token_out=TOKENS["base"]["USDC"],
            amount_in=10**18,
        )
        assert call["to"] == "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"
        assert call["data"].startswith("0x5509a1ac")  # getAmountsOut


# ── GMX V1 on Arbitrum tests ────────────────────────────────────────────────


class TestGmxV1:
    def test_protocol_registered(self):
        assert "gmx_v1" in PROTOCOLS
        assert PROTOCOLS["gmx_v1"]["interface"] == "gmx_v1"
        assert "arbitrum" in PROTOCOLS["gmx_v1"]["chains"]

    def test_build_swap_tx(self):
        dex = get_dex("gmx_v1", "arbitrum")
        tx = dex.build_swap_tx(
            token_in=TOKENS["arbitrum"]["WETH"],
            token_out=TOKENS["arbitrum"]["USDC"],
            amount_in=10**18,
            recipient="0x" + "ab" * 20,
        )
        assert tx["to"] == "0xAbBc5F99639c9B6bCb58544ddf04EFA6802F4064"
        assert tx["chainId"] == 42161
        assert tx["value"] == 0

    def test_quote_not_implemented(self):
        dex = get_dex("gmx_v1", "arbitrum")
        with pytest.raises(NotImplementedError):
            dex.build_quote_call(
                token_in=TOKENS["arbitrum"]["WETH"],
                token_out=TOKENS["arbitrum"]["USDC"],
                amount_in=10**18,
            )


# ── Aave V3 on BSC tests ────────────────────────────────────────────────────


class TestAaveV3BSC:
    def test_aave_v3_on_bsc(self):
        assert "bsc" in PROTOCOLS["aave_v3"]["chains"]

    def test_build_supply_tx(self):
        lend = get_lending("aave_v3", "bsc")
        tx = lend.build_supply_tx(
            asset=TOKENS["bsc"]["USDC"],
            amount=1_000_000,
            on_behalf_of="0x" + "aa" * 20,
        )
        assert tx["to"] == "0x6807dc923806fE8Fd134338EABCA509979a7e0cB"
        assert tx["chainId"] == 56
        assert tx["data"].startswith("0x617ba037")  # aave_supply

    def test_build_borrow_tx(self):
        lend = get_lending("aave_v3", "bsc")
        tx = lend.build_borrow_tx(
            asset=TOKENS["bsc"]["USDT"],
            amount=500_000_000_000_000_000,
            on_behalf_of="0x" + "bb" * 20,
        )
        assert tx["chainId"] == 56
        assert tx["data"].startswith("0xa415bcad")

    def test_build_flash_loan_tx(self):
        lend = get_lending("aave_v3", "bsc")
        tx = lend.build_flash_loan_tx(
            receiver="0x" + "cc" * 20,
            assets=[TOKENS["bsc"]["USDC"]],
            amounts=[1_000_000],
        )
        assert tx["chainId"] == 56
        assert tx["data"].startswith("0xab9c4b5d")


# ── Cross-chain protocol adapter tests ───────────────────────────────────────


class TestCrossChainAdapters:
    """Verify same protocol works across different chains."""

    def test_aave_v3_across_chains(self):
        for chain in ["arbitrum", "base", "bsc"]:
            lend = get_lending("aave_v3", chain)
            assert lend.chain_id == CHAINS[chain]["chain_id"]

    def test_debridge_includes_bsc(self):
        assert "bsc" in PROTOCOLS["debridge"]["chain_ids"]
        assert PROTOCOLS["debridge"]["chain_ids"]["bsc"] == 56

    def test_invalid_chain_raises(self):
        with pytest.raises(ValueError, match="not available"):
            get_dex("pancakeswap_v3", "arbitrum")

    def test_invalid_protocol_raises(self):
        with pytest.raises(ValueError, match="Unknown protocol"):
            get_dex("nonexistent", "bsc")
