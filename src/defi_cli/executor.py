"""Transaction executor: dry-run via eth_call, sign, and send."""

import httpx

from defi_cli.registry import CHAINS


def dry_run(tx: dict, rpc_url: str | None = None) -> dict:
    """Execute a dry-run via eth_call against the chain's RPC.

    Args:
        tx: Transaction dict with to, data, chainId, and optionally value.
        rpc_url: Override RPC URL. If None, derived from chainId.

    Returns:
        {"success": bool, "result": hex_string or error_message}
    """
    if rpc_url is None:
        chain_id = tx.get("chainId")
        rpc_url = _rpc_for_chain_id(chain_id)

    call_obj = {
        "to": tx["to"],
        "data": tx["data"],
    }
    if tx.get("value", 0) > 0:
        call_obj["value"] = hex(tx["value"])

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [call_obj, "latest"],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            return {
                "success": False,
                "result": data["error"].get("message", str(data["error"])),
            }

        return {
            "success": True,
            "result": data.get("result", "0x"),
        }
    except httpx.HTTPError as e:
        return {"success": False, "result": f"HTTP error: {e}"}
    except Exception as e:
        return {"success": False, "result": str(e)}


def dry_run_rpc_call(call: dict, chain: str, rpc_url: str | None = None) -> dict:
    """Execute a raw JSON-RPC call (e.g. eth_getBalance).

    Args:
        call: Dict with "method" and "params" keys.
        chain: Chain name for RPC URL lookup.
        rpc_url: Override RPC URL.

    Returns:
        {"success": bool, "result": value}
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    payload = {
        "jsonrpc": "2.0",
        "method": call["method"],
        "params": call["params"],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            return {
                "success": False,
                "result": data["error"].get("message", str(data["error"])),
            }

        return {"success": True, "result": data.get("result", "0x")}
    except httpx.HTTPError as e:
        return {"success": False, "result": f"HTTP error: {e}"}
    except Exception as e:
        return {"success": False, "result": str(e)}


def sign_tx(tx: dict, private_key: str) -> str:
    """Sign a transaction and return the raw signed hex.

    Args:
        tx: Transaction dict (to, data, chainId, value, gas, etc.)
        private_key: Hex-encoded private key.

    Returns:
        Raw signed transaction hex string.
    """
    from eth_account import Account

    # Ensure required fields have defaults
    sign_dict = {
        "to": tx["to"],
        "data": tx["data"],
        "chainId": tx["chainId"],
        "value": tx.get("value", 0),
        "gas": tx.get("gas", 500_000),
        "maxFeePerGas": tx.get("maxFeePerGas", 50 * 10**9),
        "maxPriorityFeePerGas": tx.get("maxPriorityFeePerGas", 2 * 10**9),
        "nonce": tx.get("nonce", 0),
        "type": 2,  # EIP-1559
    }

    signed = Account.sign_transaction(sign_dict, private_key)
    return "0x" + signed.raw_transaction.hex()


def send_raw_tx(raw_tx: str, rpc_url: str) -> dict:
    """Broadcast a signed transaction via eth_sendRawTransaction.

    Returns:
        {"success": bool, "tx_hash": hash or "error": message}
    """
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_sendRawTransaction",
        "params": [raw_tx],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            return {
                "success": False,
                "error": data["error"].get("message", str(data["error"])),
            }

        return {"success": True, "tx_hash": data.get("result", "")}
    except httpx.HTTPError as e:
        return {"success": False, "error": f"HTTP error: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_tx_receipt(tx_hash: str, rpc_url: str) -> dict:
    """Get transaction receipt."""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getTransactionReceipt",
        "params": [tx_hash],
        "id": 1,
    }

    try:
        resp = httpx.post(rpc_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("result")
    except Exception:
        return None


def _rpc_for_chain_id(chain_id: int) -> str:
    """Resolve RPC URL from chain ID."""
    for info in CHAINS.values():
        if info["chain_id"] == chain_id:
            return info["rpc_url"]
    raise ValueError(f"No RPC configured for chain_id={chain_id}")
