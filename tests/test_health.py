"""Tests for chain health monitoring."""

from unittest.mock import MagicMock, patch


def _mock_block_number_response(block_hex="0xf4240"):
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": block_hex}
    mock.raise_for_status = MagicMock()
    return mock


def _mock_block_response(timestamp_hex="0x65f00000"):
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {
        "jsonrpc": "2.0", "id": 2,
        "result": {"timestamp": timestamp_hex},
    }
    mock.raise_for_status = MagicMock()
    return mock


def test_check_rpc_health_success():
    """Healthy RPC returns block info with low latency."""
    import time

    from defi_cli.health import check_rpc_health

    # Recent block timestamp
    recent = hex(int(time.time()) - 5)
    responses = [
        _mock_block_number_response("0xf4240"),
        _mock_block_response(recent),
    ]

    with patch("defi_cli.health.httpx.post", side_effect=responses):
        result = check_rpc_health("arbitrum")

    assert result["healthy"] is True
    assert result["block_number"] == 0xf4240
    assert result["latency_ms"] >= 0
    assert result["block_age_seconds"] < 120


def test_check_rpc_health_stale_block():
    """Stale block makes RPC unhealthy."""
    # Old timestamp (1 hour ago)
    import time

    from defi_cli.health import check_rpc_health
    old = hex(int(time.time()) - 3600)
    responses = [
        _mock_block_number_response("0x1"),
        _mock_block_response(old),
    ]

    with patch("defi_cli.health.httpx.post", side_effect=responses):
        result = check_rpc_health("arbitrum")

    assert result["healthy"] is False
    assert result["block_age_seconds"] >= 3500


def test_check_rpc_health_connection_error():
    """Connection error marks RPC as unhealthy."""
    from defi_cli.health import check_rpc_health

    with patch("defi_cli.health.httpx.post", side_effect=Exception("connection refused")):
        result = check_rpc_health("arbitrum")

    assert result["healthy"] is False
    assert "connection refused" in result["error"]


def test_check_all_chains():
    """check_all_chains returns results for all configured chains."""
    import time

    from defi_cli.health import check_all_chains
    from defi_cli.registry import CHAINS

    recent = hex(int(time.time()) - 5)
    responses = [
        _mock_block_number_response(), _mock_block_response(recent),
    ] * len(CHAINS)

    with patch("defi_cli.health.httpx.post", side_effect=responses):
        results = check_all_chains()

    assert len(results) == len(CHAINS)
    assert all(r["healthy"] for r in results)


def test_get_best_rpc():
    """get_best_rpc returns fastest healthy URL."""
    import time

    from defi_cli.health import get_best_rpc

    recent = hex(int(time.time()) - 5)
    responses = [
        _mock_block_number_response(), _mock_block_response(recent),  # url1
        _mock_block_number_response(), _mock_block_response(recent),  # url2
    ]

    with patch("defi_cli.health.httpx.post", side_effect=responses):
        best = get_best_rpc("arbitrum", ["http://rpc1", "http://rpc2"])

    assert best in ("http://rpc1", "http://rpc2")


def test_get_best_rpc_all_unhealthy():
    """get_best_rpc returns None when all RPCs fail."""
    from defi_cli.health import get_best_rpc

    with patch("defi_cli.health.httpx.post", side_effect=Exception("down")):
        best = get_best_rpc("arbitrum", ["http://bad1", "http://bad2"])

    assert best is None
