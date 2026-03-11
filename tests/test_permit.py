"""Tests for EIP-2612 permit and Permit2 utilities."""


SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
SPENDER = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"


def test_permit2_address():
    """Permit2 address is the canonical one."""
    from defi_cli.permit import PERMIT2_ADDRESS

    assert PERMIT2_ADDRESS == "0x000000000022D473030F116dDEE9F6B43aC78BA3"


def test_build_permit2_approve_tx():
    """Permit2 approve targets the Permit2 contract."""
    from defi_cli.permit import PERMIT2_ADDRESS, build_permit2_approve_tx

    tx = build_permit2_approve_tx("arbitrum", "USDC")
    assert tx["to"] != PERMIT2_ADDRESS  # should target token contract
    # The approve call targets the token, not Permit2
    assert tx["chainId"] == 42161
    assert tx["data"][:10] == "0x095ea7b3"  # approve selector


def test_build_permit2_transfer_from():
    """Permit2 transferFrom builds correct calldata."""
    from defi_cli.permit import build_permit2_transfer_from_call

    call = build_permit2_transfer_from_call(
        token="0x" + "ab" * 20,
        from_addr=SENDER,
        to_addr=SPENDER,
        amount=1_000_000,
    )

    assert call["to"] == "0x000000000022D473030F116dDEE9F6B43aC78BA3"
    assert call["data"][:10] == "0x36c78516"


def test_build_eip2612_permit_data():
    """EIP-712 permit data has correct structure."""
    from defi_cli.permit import build_eip2612_permit_data

    data = build_eip2612_permit_data(
        token="0x" + "cc" * 20,
        owner=SENDER,
        spender=SPENDER,
        value=1_000_000,
        nonce=0,
        deadline=2**32 - 1,
        chain_id=42161,
    )

    assert data["primaryType"] == "Permit"
    assert "EIP712Domain" in data["types"]
    assert "Permit" in data["types"]
    assert data["domain"]["chainId"] == 42161
    assert data["message"]["owner"] == SENDER
    assert data["message"]["value"] == 1_000_000


def test_build_permit_call():
    """Permit call has correct selector and encoding."""
    from defi_cli.permit import PERMIT_SELECTOR, build_permit_call

    tx = build_permit_call(
        token="0x" + "dd" * 20,
        owner=SENDER,
        spender=SPENDER,
        value=1_000_000,
        deadline=2**32 - 1,
        v=28,
        r=b"\x01" * 32,
        s=b"\x02" * 32,
        chain_id=42161,
    )

    assert tx["to"] == "0x" + "dd" * 20
    assert tx["data"][:10] == "0x" + PERMIT_SELECTOR
    assert tx["chainId"] == 42161
    assert tx["value"] == 0


def test_permit_data_types_structure():
    """EIP-712 types have all required fields."""
    from defi_cli.permit import build_eip2612_permit_data

    data = build_eip2612_permit_data(
        token="0x" + "cc" * 20,
        owner=SENDER,
        spender=SPENDER,
        value=0,
        nonce=0,
        deadline=0,
        chain_id=1,
    )

    domain_fields = {f["name"] for f in data["types"]["EIP712Domain"]}
    assert "name" in domain_fields
    assert "chainId" in domain_fields
    assert "verifyingContract" in domain_fields

    permit_fields = {f["name"] for f in data["types"]["Permit"]}
    assert permit_fields == {"owner", "spender", "value", "nonce", "deadline"}
