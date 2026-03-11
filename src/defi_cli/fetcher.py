"""Real-time on-chain data fetcher via JSON-RPC."""

import httpx

from defi_cli.registry import CHAINS


def eth_call(chain: str, call: dict, rpc_url: str | None = None) -> dict:
    """Execute eth_call and return raw result.

    Args:
        chain: Chain name.
        call: Dict with "to" and "data" keys.
        rpc_url: Override RPC URL.

    Returns:
        {"success": bool, "result": hex_string or "error": str}
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    call_obj = {"to": call["to"], "data": call["data"]}

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
            return {"success": False, "error": data["error"].get("message", "")}
        return {"success": True, "result": data.get("result", "0x")}
    except Exception as e:
        return {"success": False, "error": str(e)}


def eth_call_batch(
    chain: str,
    calls: list[dict],
    rpc_url: str | None = None,
) -> list[dict]:
    """Execute multiple eth_calls via JSON-RPC batch request.

    Args:
        chain: Chain name.
        calls: List of dicts with "to" and "data" keys.
        rpc_url: Override RPC URL.

    Returns:
        List of {"success": bool, "result": hex} for each call.
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    batch = []
    for i, call in enumerate(calls):
        batch.append({
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [{"to": call["to"], "data": call["data"]}, "latest"],
            "id": i + 1,
        })

    try:
        resp = httpx.post(rpc_url, json=batch, timeout=30)
        resp.raise_for_status()
        responses = resp.json()

        # Sort by id to maintain order
        if isinstance(responses, list):
            responses.sort(key=lambda r: r.get("id", 0))

        results = []
        for r in responses:
            if "error" in r:
                results.append({
                    "success": False,
                    "error": r["error"].get("message", ""),
                })
            else:
                results.append({
                    "success": True,
                    "result": r.get("result", "0x"),
                })
        return results
    except Exception as e:
        return [{"success": False, "error": str(e)} for _ in calls]


def fetch_balance(
    chain: str,
    address: str,
    rpc_url: str | None = None,
) -> dict:
    """Fetch native token balance for an address.

    Returns:
        {"success": bool, "balance_wei": int, "balance_eth": float}
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getBalance",
        "params": [address, "latest"],
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
            "balance_wei": wei,
            "balance_eth": wei / 10**18,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def fetch_token_balance(
    chain: str,
    token: str,
    address: str,
    rpc_url: str | None = None,
) -> dict:
    """Fetch ERC20 token balance.

    Returns:
        {"success": bool, "balance_raw": int, "token": str}
    """
    from eth_abi import decode, encode

    from defi_cli.registry import SELECTORS, resolve_token

    token_addr = resolve_token(chain, token)
    selector = SELECTORS["erc20_balanceOf"]
    params = encode(["address"], [address])
    call = {"to": token_addr, "data": "0x" + selector + params.hex()}

    result = eth_call(chain, call, rpc_url)
    if not result["success"]:
        return {"success": False, "error": result.get("error", "")}

    try:
        raw = bytes.fromhex(result["result"][2:])
        balance = decode(["uint256"], raw)[0]
        return {"success": True, "balance_raw": balance, "token": token}
    except Exception as e:
        return {"success": False, "error": str(e)}


def fetch_lending_rates(
    protocol: str,
    chain: str,
    asset: str,
    rpc_url: str | None = None,
) -> dict:
    """Fetch real-time lending rates from on-chain getReserveData.

    Returns:
        {"success": bool, "reserve_data_hex": str} or error.
        Raw hex must be decoded by caller for specific rate fields.
    """
    from defi_cli.positions import build_reserve_data_call

    call = build_reserve_data_call(protocol, chain, asset)
    return eth_call(chain, call, rpc_url)


def fetch_asset_price(
    protocol: str,
    chain: str,
    asset: str,
    rpc_url: str | None = None,
) -> dict:
    """Fetch asset price from protocol oracle.

    Returns:
        {"success": bool, "price_raw": int, "price_usd": float}
    """
    from eth_abi import decode

    from defi_cli.price import build_get_asset_price_call

    call = build_get_asset_price_call(protocol, chain, asset)
    result = eth_call(chain, call, rpc_url)
    if not result["success"]:
        return {"success": False, "error": result.get("error", "")}

    try:
        raw = bytes.fromhex(result["result"][2:])
        price = decode(["uint256"], raw)[0]
        return {
            "success": True,
            "price_raw": price,
            "price_usd": price / 10**8,  # Aave oracle returns 8 decimals
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def fetch_user_position(
    protocol: str,
    chain: str,
    user: str,
    rpc_url: str | None = None,
) -> dict:
    """Fetch user lending position via getUserAccountData.

    Returns parsed position data with health factor.
    """
    from defi_cli.liquidation import assess_health
    from defi_cli.positions import build_user_account_data_call, parse_user_account_data

    call = build_user_account_data_call(protocol, chain, user)
    result = eth_call(chain, call, rpc_url)
    if not result["success"]:
        return {"success": False, "error": result.get("error", "")}

    try:
        parsed = parse_user_account_data(result["result"])
        health = assess_health(parsed)
        return {"success": True, **health}
    except Exception as e:
        return {"success": False, "error": str(e)}
