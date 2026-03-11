"""Tests for gas estimation and nonce management."""

from unittest.mock import MagicMock, patch


def _mock_rpc_response(result):
    """Create a mock HTTP response with given result."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": result}
    mock.raise_for_status = MagicMock()
    return mock


def test_estimate_gas():
    """estimate_gas returns gas as int."""
    from defi_cli.gas import estimate_gas

    tx = {
        "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "data": "0xdeadbeef",
        "chainId": 42161,
    }

    with patch("defi_cli.gas.httpx.post", return_value=_mock_rpc_response("0x5208")):
        result = estimate_gas(tx)

    assert result["success"] is True
    assert result["gas"] == 0x5208  # 21000


def test_get_gas_price():
    """get_gas_price returns wei and gwei."""
    from defi_cli.gas import get_gas_price

    # 10 gwei = 10 * 10^9 = 0x2540be400
    with patch("defi_cli.gas.httpx.post", return_value=_mock_rpc_response("0x2540be400")):
        result = get_gas_price("arbitrum")

    assert result["success"] is True
    assert result["gas_price_wei"] == 10 * 10**9
    assert abs(result["gas_price_gwei"] - 10.0) < 0.01


def test_get_nonce():
    """get_nonce returns correct transaction count."""
    from defi_cli.gas import get_nonce

    with patch("defi_cli.gas.httpx.post", return_value=_mock_rpc_response("0x05")):
        result = get_nonce("arbitrum", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")

    assert result["success"] is True
    assert result["nonce"] == 5


def test_prepare_tx_for_signing():
    """prepare_tx_for_signing adds gas, nonce, and fee fields."""
    from defi_cli.gas import prepare_tx_for_signing

    tx = {
        "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "data": "0xdeadbeef",
        "chainId": 42161,
        "value": 0,
    }

    def mock_post(url, **kwargs):
        payload = kwargs.get("json", {})
        method = payload.get("method")
        if method == "eth_getTransactionCount":
            return _mock_rpc_response("0x0a")  # nonce 10
        elif method == "eth_estimateGas":
            return _mock_rpc_response("0x30d40")  # 200000
        elif method == "eth_gasPrice":
            return _mock_rpc_response("0x2540be400")  # 10 gwei
        return _mock_rpc_response("0x0")

    with patch("defi_cli.gas.httpx.post", side_effect=mock_post):
        prepared = prepare_tx_for_signing(
            tx, sender="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        )

    assert prepared["nonce"] == 10
    assert prepared["gas"] == int(200000 * 1.2)
    assert prepared["maxFeePerGas"] > 0
    assert prepared["type"] == 2
    # Original fields preserved
    assert prepared["to"] == tx["to"]
    assert prepared["data"] == tx["data"]
