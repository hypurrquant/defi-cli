"""Tests for transaction tracker."""

import json
import tempfile

from defi_cli.tracker import (
    get_history,
    get_pending_txs,
    record_tx,
    update_tx_status,
)


def test_record_tx():
    """record_tx stores a transaction entry."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    entry = record_tx("0xabc", "arbitrum", "swap", {"amount": "100"}, path=path)

    assert entry["tx_hash"] == "0xabc"
    assert entry["chain"] == "arbitrum"
    assert entry["action"] == "swap"
    assert entry["status"] == "pending"
    assert entry["details"]["amount"] == "100"
    assert "timestamp" in entry

    # Verify persisted
    with open(path) as f:
        stored = json.load(f)
    assert len(stored) == 1


def test_update_tx_status():
    """update_tx_status modifies an existing entry."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    record_tx("0x111", "arbitrum", "supply", path=path)
    result = update_tx_status("0x111", "confirmed", gas_used=21000, path=path)

    assert result is not None
    assert result["status"] == "confirmed"
    assert result["gas_used"] == 21000


def test_update_tx_not_found():
    """update_tx_status returns None for unknown hash."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    result = update_tx_status("0xdead", "confirmed", path=path)
    assert result is None


def test_get_history():
    """get_history returns entries sorted newest first."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    record_tx("0x1", "arbitrum", "swap", path=path)
    record_tx("0x2", "base", "supply", path=path)
    record_tx("0x3", "arbitrum", "borrow", path=path)

    # All
    history = get_history(path=path)
    assert len(history) == 3

    # Filter by chain
    arb_only = get_history(chain="arbitrum", path=path)
    assert len(arb_only) == 2
    assert all(h["chain"] == "arbitrum" for h in arb_only)

    # Filter by action
    swaps = get_history(action="swap", path=path)
    assert len(swaps) == 1
    assert swaps[0]["action"] == "swap"


def test_get_history_limit():
    """get_history respects limit parameter."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    for i in range(10):
        record_tx(f"0x{i:04x}", "arbitrum", "swap", path=path)

    limited = get_history(limit=3, path=path)
    assert len(limited) == 3


def test_get_pending_txs():
    """get_pending_txs returns only pending transactions."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    record_tx("0x1", "arbitrum", "swap", path=path)
    record_tx("0x2", "arbitrum", "supply", path=path)
    update_tx_status("0x1", "confirmed", path=path)

    pending = get_pending_txs(path=path)
    assert len(pending) == 1
    assert pending[0]["tx_hash"] == "0x2"


def test_empty_history():
    """Empty history file returns empty list."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
        f.write(b"[]")

    assert get_history(path=path) == []
    assert get_pending_txs(path=path) == []
