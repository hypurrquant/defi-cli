"""Tests for DeFi event log decoder."""

from web3 import Web3


def test_identify_transfer():
    """Identify Transfer event from topic0."""
    from defi_cli.events import identify_event

    topic0 = "0x" + Web3.keccak(text="Transfer(address,address,uint256)").hex()
    assert identify_event(topic0) == "Transfer"


def test_identify_approval():
    """Identify Approval event from topic0."""
    from defi_cli.events import identify_event

    topic0 = "0x" + Web3.keccak(text="Approval(address,address,uint256)").hex()
    assert identify_event(topic0) == "Approval"


def test_identify_unknown():
    """Unknown topic returns None."""
    from defi_cli.events import identify_event

    assert identify_event("0x" + "ab" * 32) is None


def test_decode_transfer_log():
    """Decode Transfer event log."""
    from defi_cli.events import EVENT_SIGNATURES, decode_transfer_log

    from_addr = "0x" + "11" * 20
    to_addr = "0x" + "22" * 20

    log = {
        "topics": [
            EVENT_SIGNATURES["Transfer"],
            "0x" + "00" * 12 + "11" * 20,
            "0x" + "00" * 12 + "22" * 20,
        ],
        "data": hex(1000 * 10**6),
    }

    result = decode_transfer_log(log)
    assert result is not None
    assert result["event"] == "Transfer"
    assert result["from"] == from_addr
    assert result["to"] == to_addr
    assert result["value"] == 1000 * 10**6


def test_decode_approval_log():
    """Decode Approval event log."""
    from defi_cli.events import EVENT_SIGNATURES, decode_approval_log

    log = {
        "topics": [
            EVENT_SIGNATURES["Approval"],
            "0x" + "00" * 12 + "aa" * 20,
            "0x" + "00" * 12 + "bb" * 20,
        ],
        "data": hex(2**256 - 1),
    }

    result = decode_approval_log(log)
    assert result is not None
    assert result["event"] == "Approval"
    assert result["value"] == 2**256 - 1


def test_decode_logs_mixed():
    """decode_logs handles mixed event types."""
    from defi_cli.events import EVENT_SIGNATURES, decode_logs

    logs = [
        {
            "address": "0x" + "cc" * 20,
            "topics": [
                EVENT_SIGNATURES["Transfer"],
                "0x" + "00" * 12 + "11" * 20,
                "0x" + "00" * 12 + "22" * 20,
            ],
            "data": hex(500),
        },
        {
            "address": "0x" + "dd" * 20,
            "topics": [
                EVENT_SIGNATURES["Approval"],
                "0x" + "00" * 12 + "33" * 20,
                "0x" + "00" * 12 + "44" * 20,
            ],
            "data": hex(999),
        },
        {
            "address": "0x" + "ee" * 20,
            "topics": ["0x" + "ff" * 32],
            "data": "0x1234",
        },
    ]

    decoded = decode_logs(logs)
    assert len(decoded) == 3
    assert decoded[0]["event"] == "Transfer"
    assert decoded[1]["event"] == "Approval"
    assert decoded[2]["event"] == "unknown"


def test_filter_events():
    """filter_events returns only matching events."""
    from defi_cli.events import EVENT_SIGNATURES, filter_events

    logs = [
        {
            "address": "0x" + "cc" * 20,
            "topics": [
                EVENT_SIGNATURES["Transfer"],
                "0x" + "00" * 12 + "11" * 20,
                "0x" + "00" * 12 + "22" * 20,
            ],
            "data": hex(100),
        },
        {
            "address": "0x" + "dd" * 20,
            "topics": [
                EVENT_SIGNATURES["Approval"],
                "0x" + "00" * 12 + "33" * 20,
                "0x" + "00" * 12 + "44" * 20,
            ],
            "data": hex(200),
        },
    ]

    transfers = filter_events(logs, "Transfer")
    assert len(transfers) == 1
    assert transfers[0]["value"] == 100


def test_decode_logs_empty():
    """Empty topics handled gracefully."""
    from defi_cli.events import decode_logs

    logs = [{"topics": [], "data": "0x"}]
    decoded = decode_logs(logs)
    assert len(decoded) == 1
    assert decoded[0]["event"] == "unknown"


def test_event_signatures_populated():
    """Event signatures dict has known events."""
    from defi_cli.events import EVENT_SIGNATURES

    assert "Transfer" in EVENT_SIGNATURES
    assert "Approval" in EVENT_SIGNATURES
    assert "Swap" in EVENT_SIGNATURES
    assert "Supply" in EVENT_SIGNATURES
    assert all(sig.startswith("0x") for sig in EVENT_SIGNATURES.values())
