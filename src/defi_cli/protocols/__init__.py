"""Protocol adapter factory — single entry point for all DeFi protocols.

Usage:
    from defi_cli.protocols import get_dex, get_lending, get_cdp, get_bridge

    dex = get_dex("uniswap_v3", "arbitrum")
    tx = dex.build_swap_tx(token_in, token_out, amount, recipient)
"""

from __future__ import annotations

from defi_cli.protocols.base import BaseBridge, BaseCDP, BaseDEX, BaseLending  # noqa: F401
from defi_cli.registry import CHAINS, PROTOCOLS

# ── Interface → class mappings ──────────────────────────────────────────────

def _dex_registry() -> dict[str, type[BaseDEX]]:
    from defi_cli.protocols.dex_algebra_v3 import AlgebraV3
    from defi_cli.protocols.dex_gmx_v1 import GmxV1
    from defi_cli.protocols.dex_solidly_v2 import SolidlyV2
    from defi_cli.protocols.dex_uniswap_v3 import UniswapV3Router02
    from defi_cli.protocols.dex_uniswap_v3_orig import UniswapV3Router

    return {
        "uniswap_v3_router02": UniswapV3Router02,
        "uniswap_v3_router": UniswapV3Router,
        "algebra_v3": AlgebraV3,
        "solidly_v2": SolidlyV2,
        "gmx_v1": GmxV1,
    }


def _lending_registry() -> dict[str, type[BaseLending]]:
    from defi_cli.protocols.lending_aave_v3 import AaveV3Lending

    return {
        "aave_v3": AaveV3Lending,
    }


def _cdp_registry() -> dict[str, type[BaseCDP]]:
    from defi_cli.protocols.cdp_liquity_v2 import LiquityV2CDP

    return {
        "liquity_v2": LiquityV2CDP,
    }


def _bridge_registry() -> dict[str, type[BaseBridge]]:
    from defi_cli.protocols.bridge_across import AcrossBridge
    from defi_cli.protocols.bridge_cctp import CCTPBridge
    from defi_cli.protocols.bridge_lifi import LiFiBridge

    return {
        "rest_api": LiFiBridge,  # LI.FI default; deBridge overridden below
        "rest_api_and_contract": AcrossBridge,
        "cctp_v2": CCTPBridge,
    }


# ── Factory functions ───────────────────────────────────────────────────────


def get_dex(protocol: str, chain: str) -> BaseDEX:
    """Get a DEX adapter for the given protocol and chain."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    proto = PROTOCOLS[protocol]
    if proto["type"] != "dex":
        raise ValueError(f"{protocol} is not a DEX protocol")
    if chain not in proto.get("chains", {}):
        raise ValueError(f"{protocol} not available on {chain}")

    interface = proto["interface"]
    registry = _dex_registry()
    cls = registry.get(interface)
    if cls is None:
        raise ValueError(f"No DEX adapter for interface: {interface}")

    config = proto["chains"][chain]
    chain_id = CHAINS[chain]["chain_id"]
    return cls(protocol, chain, config, chain_id)


def get_lending(protocol: str, chain: str) -> BaseLending:
    """Get a lending adapter for the given protocol and chain."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    proto = PROTOCOLS[protocol]
    if proto["type"] != "lending":
        raise ValueError(f"{protocol} is not a lending protocol")
    if chain not in proto.get("chains", {}):
        raise ValueError(f"{protocol} not available on {chain}")

    interface = proto["interface"]
    registry = _lending_registry()
    cls = registry.get(interface)
    if cls is None:
        raise ValueError(f"No lending adapter for interface: {interface}")

    config = proto["chains"][chain]
    chain_id = CHAINS[chain]["chain_id"]
    return cls(protocol, chain, config, chain_id)


def get_cdp(protocol: str, chain: str) -> BaseCDP:
    """Get a CDP adapter for the given protocol and chain."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    proto = PROTOCOLS[protocol]
    if proto["type"] != "cdp":
        raise ValueError(f"{protocol} is not a CDP protocol")
    if chain not in proto.get("chains", {}):
        raise ValueError(f"{protocol} not available on {chain}")

    interface = proto["interface"]
    registry = _cdp_registry()
    cls = registry.get(interface)
    if cls is None:
        raise ValueError(f"No CDP adapter for interface: {interface}")

    config = proto["chains"][chain]
    chain_id = CHAINS[chain]["chain_id"]
    return cls(protocol, chain, config, chain_id)


def get_bridge(protocol: str) -> BaseBridge:
    """Get a bridge adapter for the given protocol."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    proto = PROTOCOLS[protocol]
    if proto["type"] != "bridge":
        raise ValueError(f"{protocol} is not a bridge protocol")

    # Special-case deBridge (also rest_api but different class)
    if protocol == "debridge":
        from defi_cli.protocols.bridge_debridge import DeBridgeBridge
        return DeBridgeBridge(protocol, proto)

    interface = proto["interface"]
    registry = _bridge_registry()
    cls = registry.get(interface)
    if cls is None:
        raise ValueError(f"No bridge adapter for interface: {interface}")

    return cls(protocol, proto)
