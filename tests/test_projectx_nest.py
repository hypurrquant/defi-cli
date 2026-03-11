"""Tests for ProjectX and NEST protocol integration."""


def test_projectx_registry():
    """ProjectX protocol is registered with correct addresses."""
    from defi_cli.registry import PROTOCOLS

    assert "projectx" in PROTOCOLS
    px = PROTOCOLS["projectx"]
    assert px["type"] == "dex"
    assert px["interface"] == "uniswap_v3_router"
    assert "hyperevm" in px["chains"]

    hyper = px["chains"]["hyperevm"]
    assert hyper["factory"] == "0xFF7B3E8C00e57ea31477c32A5B52a58Eea47b072"
    assert hyper["swap_router"] == "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B"
    assert hyper["position_manager"] == "0xeaD19AE861c29bBb2101E834922B2FEee69B9091"


def test_nest_registry():
    """NEST protocol is registered with correct addresses."""
    from defi_cli.registry import PROTOCOLS

    assert "nest" in PROTOCOLS
    nest = PROTOCOLS["nest"]
    assert nest["type"] == "dex"
    assert nest["interface"] == "algebra_v3"
    assert "hyperevm" in nest["chains"]

    hyper = nest["chains"]["hyperevm"]
    assert hyper["pool_deployer"] == "0x3842CE04380b8655a3a47ed87ea0d311adca161f"
    assert hyper["position_manager"] == "0xeaf58788a405f3253814b4559391a22be8616250"
    assert hyper["nest_token"] == "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035"


def test_hyperevm_tokens_expanded():
    """HyperEVM has expanded token list with USDH, UBTC, UETH, NEST."""
    from defi_cli.registry import TOKENS

    hyper_tokens = TOKENS["hyperevm"]
    assert "USDH" in hyper_tokens
    assert "UBTC" in hyper_tokens
    assert "UETH" in hyper_tokens
    assert "NEST" in hyper_tokens
    assert hyper_tokens["USDH"] == "0x111111a1a0667d36bD57c0A9f569b98057111111"


def test_projectx_swap_build():
    """Build a swap tx via ProjectX (Uniswap V3 interface)."""
    from defi_cli.dex import build_swap_tx
    from defi_cli.registry import SELECTORS, TOKENS

    tx = build_swap_tx(
        protocol="projectx",
        chain="hyperevm",
        token_in=TOKENS["hyperevm"]["USDC"],
        token_out=TOKENS["hyperevm"]["WHYPE"],
        amount_in=1_000_000,
        recipient="0x" + "ab" * 20,
    )

    assert tx["to"] == "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B"
    assert tx["chainId"] == 999
    # ProjectX uses uniswap_v3_router interface (with deadline)
    assert tx["data"][:10] == "0x" + SELECTORS["v3_exactInputSingle"]


def test_nest_token_resolve():
    """NEST token resolves correctly on hyperevm."""
    from defi_cli.registry import resolve_token

    addr = resolve_token("hyperevm", "NEST")
    assert addr == "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035"


def test_protocol_count_expanded():
    """Protocol count increased with ProjectX and NEST."""
    from defi_cli.registry import PROTOCOLS

    dexes = [name for name, p in PROTOCOLS.items() if p["type"] == "dex"]
    assert "projectx" in dexes
    assert "nest" in dexes
    assert len(dexes) >= 5  # uniswap_v3, hyperswap, kittenswap, projectx, nest
