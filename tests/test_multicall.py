"""Tests for Multicall3 batching."""

from eth_abi import decode, encode

from prepare import SELECTORS, TOKENS


def test_build_multicall_structure():
    """Multicall tx targets Multicall3 with aggregate3 selector."""
    from defi_cli.multicall import AGGREGATE3_SELECTOR, MULTICALL3_ADDRESS, build_multicall

    calls = [
        {"to": "0x" + "ab" * 20, "data": "0xdeadbeef"},
        {"to": "0x" + "cd" * 20, "data": "0xcafebabe"},
    ]
    tx = build_multicall(calls, chain_id=42161)

    assert tx["to"] == MULTICALL3_ADDRESS
    assert tx["data"][:10] == "0x" + AGGREGATE3_SELECTOR
    assert tx["chainId"] == 42161
    assert tx["value"] == 0


def test_build_multicall_encodes_calls():
    """Multicall encodes the correct number of calls in calldata."""
    from defi_cli.multicall import build_multicall

    calls = [
        {"to": "0x" + "ab" * 20, "data": "0x70a08231" + "00" * 32},
    ]
    tx = build_multicall(calls, chain_id=8453)

    # Data should be selector + ABI encoded array
    data_hex = tx["data"][10:]  # strip 0x + selector
    raw = bytes.fromhex(data_hex)
    decoded = decode(["(address,bool,bytes)[]"], raw)[0]
    assert len(decoded) == 1
    assert decoded[0][1] is True  # allowFailure


def test_decode_multicall_result():
    """Decode Multicall3 result into success/data pairs."""
    from defi_cli.multicall import decode_multicall_result

    # Simulate result: two calls, both successful, each returning uint256
    result1 = encode(["uint256"], [1000000])
    result2 = encode(["uint256"], [2000000])
    # Encode as (bool, bytes)[]
    encoded = encode(
        ["(bool,bytes)[]"],
        [[(True, result1), (True, result2)]],
    )
    result_hex = "0x" + encoded.hex()

    decoded = decode_multicall_result(result_hex)
    assert len(decoded) == 2
    assert decoded[0]["success"] is True
    assert decoded[1]["success"] is True

    # Verify returned data
    val1 = decode(["uint256"], decoded[0]["data"])[0]
    val2 = decode(["uint256"], decoded[1]["data"])[0]
    assert val1 == 1000000
    assert val2 == 2000000


def test_balance_multicall_targets_tokens():
    """Balance multicall queries the correct token contracts."""
    from defi_cli.multicall import build_balance_multicall

    tx = build_balance_multicall(
        chain="arbitrum",
        tokens=["USDC", "WETH"],
        address="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    )

    assert tx["chainId"] == 42161
    # Decode the calls inside multicall
    data_hex = tx["data"][10:]
    raw = bytes.fromhex(data_hex)
    decoded = decode(["(address,bool,bytes)[]"], raw)[0]
    assert len(decoded) == 2

    # First call targets USDC
    assert decoded[0][0].lower() == TOKENS["arbitrum"]["USDC"].lower()
    # Second call targets WETH
    assert decoded[1][0].lower() == TOKENS["arbitrum"]["WETH"].lower()
    # Both use balanceOf selector
    for call in decoded:
        assert call[2][:4].hex() == SELECTORS["erc20_balanceOf"]


def test_allowance_multicall():
    """Allowance multicall queries multiple tokens."""
    from defi_cli.multicall import build_allowance_multicall

    tx = build_allowance_multicall(
        chain="arbitrum",
        tokens=["USDC", "USDT"],
        owner="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        spender="0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    )

    assert tx["chainId"] == 42161
    data_hex = tx["data"][10:]
    raw = bytes.fromhex(data_hex)
    decoded = decode(["(address,bool,bytes)[]"], raw)[0]
    assert len(decoded) == 2
    # Each uses allowance selector dd62ed3e
    for call in decoded:
        assert call[2][:4].hex() == "dd62ed3e"
