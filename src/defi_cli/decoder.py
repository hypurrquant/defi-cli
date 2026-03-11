"""Calldata decoder for DeFi transactions."""

from defi_cli.registry import SELECTORS

# Reverse map: selector -> (name, param_types)
_SELECTOR_MAP = {
    SELECTORS["erc20_approve"]: ("erc20.approve", ["address", "uint256"]),
    SELECTORS["erc20_transfer"]: ("erc20.transfer", ["address", "uint256"]),
    SELECTORS["erc20_balanceOf"]: ("erc20.balanceOf", ["address"]),
    SELECTORS["aave_supply"]: (
        "aave.supply", ["address", "uint256", "address", "uint16"],
    ),
    SELECTORS["aave_borrow"]: (
        "aave.borrow", ["address", "uint256", "uint256", "uint16", "address"],
    ),
    SELECTORS["aave_repay"]: (
        "aave.repay", ["address", "uint256", "uint256", "address"],
    ),
    SELECTORS["aave_withdraw"]: (
        "aave.withdraw", ["address", "uint256", "address"],
    ),
    SELECTORS["aave_getReserveData"]: ("aave.getReserveData", ["address"]),
    SELECTORS["aave_getUserAccountData"]: (
        "aave.getUserAccountData", ["address"],
    ),
    SELECTORS["cctp_depositForBurn"]: (
        "cctp.depositForBurn", ["uint256", "uint32", "bytes32", "address"],
    ),
    "d0e30db0": ("weth.deposit", []),
    "2e1a7d4d": ("weth.withdraw", ["uint256"]),
    "ab9c4b5d": (
        "aave.flashLoan",
        ["address", "address[]", "uint256[]", "uint256[]",
         "address", "bytes", "uint16"],
    ),
    "42b0b77c": (
        "aave.flashLoanSimple",
        ["address", "address", "uint256", "bytes", "uint16"],
    ),
    "00a718a9": (
        "aave.liquidationCall",
        ["address", "address", "address", "uint256", "bool"],
    ),
    "38ed1739": (
        "v2.swapExactTokensForTokens",
        ["uint256", "uint256", "address[]", "address", "uint256"],
    ),
    "b3596f07": ("oracle.getAssetPrice", ["address"]),
    "9d23d9f2": ("oracle.getAssetsPrices", ["address[]"]),
    "e7a7ed02": (
        "across.depositV3",
        ["address", "address", "address", "address",
         "uint256", "uint256", "uint256", "address",
         "uint32", "uint32", "uint32", "bytes"],
    ),
}


def identify_function(data: str) -> dict:
    """Identify the function being called from calldata.

    Args:
        data: Hex-encoded calldata (with 0x prefix).

    Returns:
        {"selector": str, "name": str, "known": bool}
    """
    if len(data) < 10:
        return {"selector": "", "name": "unknown", "known": False}

    selector = data[2:10]

    if selector in _SELECTOR_MAP:
        name, _ = _SELECTOR_MAP[selector]
        return {"selector": selector, "name": name, "known": True}

    return {"selector": selector, "name": f"unknown({selector})", "known": False}


def decode_calldata(data: str) -> dict:
    """Decode calldata into function name and parameters.

    Args:
        data: Hex-encoded calldata (with 0x prefix).

    Returns:
        {"name": str, "selector": str, "params": list or None}
    """
    from eth_abi import decode as abi_decode

    if len(data) < 10:
        return {"name": "unknown", "selector": "", "params": None}

    selector = data[2:10]

    if selector not in _SELECTOR_MAP:
        return {
            "name": f"unknown({selector})",
            "selector": selector,
            "params": None,
        }

    name, param_types = _SELECTOR_MAP[selector]

    if not param_types:
        return {"name": name, "selector": selector, "params": []}

    try:
        raw_params = bytes.fromhex(data[10:])
        decoded = abi_decode(param_types, raw_params)
        # Convert bytes and large ints to hex strings for readability
        params = []
        for val in decoded:
            if isinstance(val, bytes):
                params.append("0x" + val.hex())
            elif isinstance(val, (list, tuple)):
                params.append([
                    "0x" + v.hex() if isinstance(v, bytes) else v
                    for v in val
                ])
            else:
                params.append(val)
        return {"name": name, "selector": selector, "params": params}
    except Exception:
        return {"name": name, "selector": selector, "params": None}
