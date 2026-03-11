"""Tests for real-time data fetcher (mocked RPC)."""

from unittest.mock import MagicMock, patch

from eth_abi import encode


def _mock_rpc_response(result):
    """Create a mock HTTP response."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {"jsonrpc": "2.0", "id": 1, "result": result}
    mock.raise_for_status = MagicMock()
    return mock


def _mock_rpc_batch_response(results):
    """Create a mock batch HTTP response."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = [
        {"jsonrpc": "2.0", "id": i + 1, "result": r}
        for i, r in enumerate(results)
    ]
    mock.raise_for_status = MagicMock()
    return mock


def test_eth_call_success():
    """eth_call returns hex result on success."""
    from defi_cli.fetcher import eth_call

    with patch("defi_cli.fetcher.httpx.post", return_value=_mock_rpc_response("0xdeadbeef")):
        result = eth_call("arbitrum", {"to": "0x" + "ab" * 20, "data": "0x1234"})

    assert result["success"] is True
    assert result["result"] == "0xdeadbeef"


def test_eth_call_error():
    """eth_call returns error on RPC error."""
    from defi_cli.fetcher import eth_call

    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {
        "jsonrpc": "2.0", "id": 1,
        "error": {"message": "execution reverted"},
    }
    mock.raise_for_status = MagicMock()

    with patch("defi_cli.fetcher.httpx.post", return_value=mock):
        result = eth_call("arbitrum", {"to": "0x" + "ab" * 20, "data": "0x1234"})

    assert result["success"] is False
    assert "reverted" in result["error"]


def test_eth_call_batch():
    """Batch eth_call returns ordered results."""
    from defi_cli.fetcher import eth_call_batch

    calls = [
        {"to": "0x" + "ab" * 20, "data": "0x1111"},
        {"to": "0x" + "cd" * 20, "data": "0x2222"},
    ]

    results_hex = ["0xaaaa", "0xbbbb"]
    with patch("defi_cli.fetcher.httpx.post",
               return_value=_mock_rpc_batch_response(results_hex)):
        results = eth_call_batch("arbitrum", calls)

    assert len(results) == 2
    assert results[0]["success"] is True
    assert results[0]["result"] == "0xaaaa"
    assert results[1]["result"] == "0xbbbb"


def test_fetch_balance():
    """fetch_balance returns wei and ETH values."""
    from defi_cli.fetcher import fetch_balance

    # 1.5 ETH = 1.5 * 10^18 wei
    hex_val = hex(int(1.5 * 10**18))
    with patch("defi_cli.fetcher.httpx.post", return_value=_mock_rpc_response(hex_val)):
        result = fetch_balance("arbitrum", "0x" + "ab" * 20)

    assert result["success"] is True
    assert result["balance_wei"] == int(1.5 * 10**18)
    assert abs(result["balance_eth"] - 1.5) < 0.001


def test_fetch_token_balance():
    """fetch_token_balance decodes uint256 balance."""
    from defi_cli.fetcher import fetch_token_balance

    # 1000 USDC = 1000 * 10^6
    balance = 1000 * 10**6
    encoded = encode(["uint256"], [balance])
    hex_result = "0x" + encoded.hex()

    with patch("defi_cli.fetcher.httpx.post", return_value=_mock_rpc_response(hex_result)):
        result = fetch_token_balance("arbitrum", "USDC", "0x" + "ab" * 20)

    assert result["success"] is True
    assert result["balance_raw"] == balance
    assert result["token"] == "USDC"


def test_fetch_asset_price():
    """fetch_asset_price returns USD price."""
    from defi_cli.fetcher import fetch_asset_price

    # ETH = $3000, oracle returns 8 decimals
    price = 3000 * 10**8
    encoded = encode(["uint256"], [price])
    hex_result = "0x" + encoded.hex()

    with patch("defi_cli.fetcher.httpx.post", return_value=_mock_rpc_response(hex_result)):
        result = fetch_asset_price("aave_v3", "arbitrum", "WETH")

    assert result["success"] is True
    assert result["price_raw"] == price
    assert result["price_usd"] == 3000.0


def test_fetch_user_position():
    """fetch_user_position returns health assessment."""
    from defi_cli.fetcher import fetch_user_position

    # Simulate: $10000 collateral, $5000 debt, HF=1.7
    data = encode(
        ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [10000 * 10**8, 5000 * 10**8, 3000 * 10**8, 8500, 8000, 17 * 10**17],
    )
    hex_result = "0x" + data.hex()

    with patch("defi_cli.fetcher.httpx.post", return_value=_mock_rpc_response(hex_result)):
        result = fetch_user_position("aave_v3", "arbitrum", "0x" + "ab" * 20)

    assert result["success"] is True
    assert result["health_status"] in ("healthy", "moderate")
    assert result["total_collateral_usd"] == 10000.0
    assert result["total_debt_usd"] == 5000.0
