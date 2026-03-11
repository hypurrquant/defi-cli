"""Chain health monitoring — RPC latency, block freshness, failover."""

import time

import httpx

from defi_cli.registry import CHAINS


def check_rpc_health(chain: str, rpc_url: str | None = None) -> dict:
    """Check RPC endpoint health: latency, block number, block age.

    Returns:
        {
            "chain": str,
            "rpc_url": str,
            "healthy": bool,
            "latency_ms": float,
            "block_number": int,
            "block_timestamp": int,
            "block_age_seconds": int,
        }
    """
    if rpc_url is None:
        rpc_url = CHAINS[chain]["rpc_url"]

    # Measure latency on eth_blockNumber
    start = time.time()
    try:
        resp = httpx.post(
            rpc_url,
            json={"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1},
            timeout=10,
        )
        latency_ms = (time.time() - start) * 1000
        resp.raise_for_status()
        data = resp.json()
        block_number = int(data["result"], 16)
    except Exception as e:
        return {
            "chain": chain,
            "rpc_url": rpc_url,
            "healthy": False,
            "error": str(e),
            "latency_ms": (time.time() - start) * 1000,
        }

    # Get block timestamp
    try:
        resp2 = httpx.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_getBlockByNumber",
                "params": [hex(block_number), False],
                "id": 2,
            },
            timeout=10,
        )
        block_data = resp2.json().get("result", {})
        block_timestamp = int(block_data.get("timestamp", "0x0"), 16)
        block_age = int(time.time()) - block_timestamp
    except Exception:
        block_timestamp = 0
        block_age = -1

    # Healthy if latency < 5s and block is recent (< 120s)
    healthy = latency_ms < 5000 and (block_age < 120 or block_age == -1)

    return {
        "chain": chain,
        "rpc_url": rpc_url,
        "healthy": healthy,
        "latency_ms": round(latency_ms, 1),
        "block_number": block_number,
        "block_timestamp": block_timestamp,
        "block_age_seconds": block_age,
    }


def check_all_chains() -> list[dict]:
    """Check health of all configured chains.

    Returns:
        List of health results for each chain, sorted by latency.
    """
    results = []
    for chain_name in CHAINS:
        result = check_rpc_health(chain_name)
        results.append(result)
    results.sort(key=lambda r: r.get("latency_ms", 99999))
    return results


def get_best_rpc(chain: str, rpc_urls: list[str]) -> str | None:
    """Find the fastest healthy RPC from a list of candidates.

    Args:
        chain: Chain name (for result labeling).
        rpc_urls: List of RPC URLs to test.

    Returns:
        Best RPC URL or None if all are unhealthy.
    """
    best_url = None
    best_latency = float("inf")

    for url in rpc_urls:
        result = check_rpc_health(chain, url)
        if result["healthy"] and result["latency_ms"] < best_latency:
            best_latency = result["latency_ms"]
            best_url = url

    return best_url
