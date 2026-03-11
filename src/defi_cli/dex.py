"""DEX operations: swap, add/remove liquidity."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, SELECTORS


def _get_protocol_chain(protocol: str, chain: str) -> dict:
    """Get protocol config for a specific chain."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"Unknown protocol: {protocol}")
    p = PROTOCOLS[protocol]
    if chain not in p.get("chains", {}):
        raise ValueError(f"{protocol} not available on {chain}")
    return p["chains"][chain]


def build_swap_tx(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    recipient: str,
    fee: int = 3000,
    slippage: float = 0.005,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build a swap transaction for a DEX protocol."""
    config = _get_protocol_chain(protocol, chain)
    interface = PROTOCOLS[protocol]["interface"]
    chain_id = CHAINS[chain]["chain_id"]

    if interface == "uniswap_v3_router02":
        # SwapRouter02: no deadline in struct
        selector = SELECTORS["v3_02_exactInputSingle"]
        params = encode(
            ["(address,address,uint24,address,uint256,uint256,uint160)"],
            [(token_in, token_out, fee, recipient, amount_in, 0, 0)],
        )
    elif interface == "uniswap_v3_router":
        # Original SwapRouter: deadline in struct
        selector = SELECTORS["v3_exactInputSingle"]
        params = encode(
            ["(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
            [(token_in, token_out, fee, recipient, deadline, amount_in, 0, 0)],
        )
    elif interface == "algebra_v3":
        # Algebra Integral: no fee field, uses limitSqrtPrice
        params = encode(
            ["(address,address,address,uint256,uint256,uint256,uint160)"],
            [(token_in, token_out, recipient, deadline, amount_in, 0, 0)],
        )
        # Compute Algebra exactInputSingle selector
        from web3 import Web3

        selector = Web3.keccak(
            text="exactInputSingle((address,address,address,uint256,uint256,uint256,uint160))"
        )[:4].hex()
    else:
        raise ValueError(f"Unsupported DEX interface: {interface}")

    calldata = "0x" + selector + params.hex()

    return {
        "to": config["swap_router"],
        "data": calldata,
        "chainId": chain_id,
        "value": 0,
    }


def build_add_liquidity_tx(
    protocol: str,
    chain: str,
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
    """Build add liquidity tx via NonfungiblePositionManager.mint()."""
    config = _get_protocol_chain(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["v3_mint"]

    # mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))
    params = encode(
        ["(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [(token_a, token_b, fee, tick_lower, tick_upper,
          amount_a, amount_b, 0, 0, recipient, deadline)],
    )

    calldata = "0x" + selector + params.hex()

    return {
        "to": config["position_manager"],
        "data": calldata,
        "chainId": chain_id,
        "value": 0,
    }


def build_remove_liquidity_tx(
    protocol: str,
    chain: str,
    token_id: int,
    liquidity: int,
    recipient: str,
    deadline: int = 2**32 - 1,
) -> dict:
    """Build remove liquidity tx via NonfungiblePositionManager.decreaseLiquidity()."""
    config = _get_protocol_chain(protocol, chain)
    chain_id = CHAINS[chain]["chain_id"]
    selector = SELECTORS["v3_decreaseLiquidity"]

    # decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))
    params = encode(
        ["(uint256,uint128,uint256,uint256,uint256)"],
        [(token_id, liquidity, 0, 0, deadline)],
    )

    calldata = "0x" + selector + params.hex()

    return {
        "to": config["position_manager"],
        "data": calldata,
        "chainId": chain_id,
        "value": 0,
    }
