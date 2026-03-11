"""Tests for the transaction executor (dry-run, sign, send)."""

from unittest.mock import MagicMock, patch

from prepare import CHAINS


def test_dry_run_builds_correct_rpc_payload():
    """dry_run sends correct eth_call JSON-RPC payload."""
    from defi_cli.executor import dry_run

    tx = {
        "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "data": "0x617ba037" + "00" * 128,
        "chainId": 42161,
        "value": 0,
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": "0x01"}
    mock_resp.raise_for_status = MagicMock()

    with patch("defi_cli.executor.httpx.post", return_value=mock_resp) as mock_post:
        result = dry_run(tx)

    assert result["success"] is True
    assert result["result"] == "0x01"

    # Verify the RPC call was made to the correct endpoint
    call_args = mock_post.call_args
    assert call_args[0][0] == CHAINS["arbitrum"]["rpc_url"]
    payload = call_args[1]["json"]
    assert payload["method"] == "eth_call"
    assert payload["params"][0]["to"] == tx["to"]


def test_dry_run_handles_rpc_error():
    """dry_run correctly handles RPC error responses."""
    from defi_cli.executor import dry_run

    tx = {
        "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "data": "0xdeadbeef",
        "chainId": 42161,
        "value": 0,
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "jsonrpc": "2.0",
        "id": 1,
        "error": {"code": -32000, "message": "execution reverted"},
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("defi_cli.executor.httpx.post", return_value=mock_resp):
        result = dry_run(tx)

    assert result["success"] is False
    assert "reverted" in result["result"]


def test_sign_tx_returns_hex(private_key):
    """sign_tx returns a valid hex-encoded signed transaction."""
    from defi_cli.executor import sign_tx

    tx = {
        "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "data": "0x617ba037" + "00" * 128,
        "chainId": 42161,
        "value": 0,
    }

    raw = sign_tx(tx, private_key)
    assert raw.startswith("0x")
    assert len(raw) > 100  # Signed tx is substantial


def test_dry_run_rpc_call_balance():
    """dry_run_rpc_call works for eth_getBalance."""
    from defi_cli.executor import dry_run_rpc_call

    call = {
        "method": "eth_getBalance",
        "params": ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "latest"],
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "jsonrpc": "2.0", "id": 1,
        "result": "0x0de0b6b3a7640000",  # 1 ETH
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("defi_cli.executor.httpx.post", return_value=mock_resp):
        result = dry_run_rpc_call(call, "arbitrum")

    assert result["success"] is True
    assert result["result"] == "0x0de0b6b3a7640000"
