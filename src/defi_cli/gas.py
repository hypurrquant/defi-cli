"""Gas estimation and nonce management."""

import httpx

from defi_cli.registry import CHAINS


def estimate_gas(tx: dict, rpc_url: str | None = None) -> dict:
    """Estimate gas for a transaction via eth_estimateGas.

    Returns:
        {"success": bool, "gas": int or "error": str}
    """
    if rpc_url is None:
        rpc_url = _rpc_for_chain_id(tx["chainId"])

    call_obj = {"to": tx["to"], "data": tx["data"]}
    if tx.get("value", 0) > 0:
        call_obj["value"] = hex(tx["value"])
    if "from" in tx:
        call_obj["from"] = tx["from"]

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_estimateGas",
        "params": [call_obj],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return {"success": False, "error": data["error"].get("message", "")}
        return {"success": True, "gas": int(data["result"], 16)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_gas_price(chain: str, rpc_url: str | None = None) -> dict:
    """Get current gas price via eth_gasPrice.

    Returns:
        {"success": bool, "gas_price_wei": int, "gas_price_gwei": float}
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_gasPrice",
        "params": [],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return {"success": False, "error": data["error"].get("message", "")}
        wei = int(data["result"], 16)
        return {
            "success": True,
            "gas_price_wei": wei,
            "gas_price_gwei": wei / 10**9,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_nonce(chain: str, address: str, rpc_url: str | None = None) -> dict:
    """Get transaction count (nonce) for an address.

    Returns:
        {"success": bool, "nonce": int}
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getTransactionCount",
        "params": [address, "pending"],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return {"success": False, "error": data["error"].get("message", "")}
        return {"success": True, "nonce": int(data["result"], 16)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def prepare_tx_for_signing(
    tx: dict,
    sender: str,
    chain: str | None = None,
    rpc_url: str | None = None,
    gas_multiplier: float = 1.2,
) -> dict:
    """Add gas, nonce, and fee fields to a raw tx for signing.

    This is a convenience function that calls estimate_gas, get_gas_price,
    and get_nonce, then returns a complete tx ready for sign_tx().
    """
    if chain is None:
        chain_id = tx["chainId"]
        for name, info in CHAINS.items():
            if info["chain_id"] == chain_id:
                chain = name
                break

    # Get nonce
    nonce_result = get_nonce(chain, sender, rpc_url)
    if not nonce_result["success"]:
        raise RuntimeError(f"Failed to get nonce: {nonce_result['error']}")

    # Estimate gas
    tx_with_from = {**tx, "from": sender}
    gas_result = estimate_gas(tx_with_from, rpc_url)
    gas = int(gas_result["gas"] * gas_multiplier) if gas_result["success"] else 500_000

    # Get gas price
    gas_price_result = get_gas_price(chain, rpc_url)
    if gas_price_result["success"]:
        max_fee = int(gas_price_result["gas_price_wei"] * 1.5)
        priority_fee = min(2 * 10**9, max_fee // 10)
    else:
        max_fee = 50 * 10**9
        priority_fee = 2 * 10**9

    return {
        **tx,
        "nonce": nonce_result["nonce"],
        "gas": gas,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": priority_fee,
        "type": 2,
    }


def _rpc_for_chain_id(chain_id: int) -> str:
    for info in CHAINS.values():
        if info["chain_id"] == chain_id:
            return info["rpc_url"]
    raise ValueError(f"No RPC for chain_id={chain_id}")
