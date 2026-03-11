"""Transaction tracking — store and query tx history."""

import json
import os

DEFAULT_HISTORY_FILE = os.path.expanduser("~/.defi-cli/tx_history.json")


def _load_history(path: str | None = None) -> list[dict]:
    """Load transaction history from disk."""
    path = path or DEFAULT_HISTORY_FILE
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def _save_history(history: list[dict], path: str | None = None) -> None:
    """Save transaction history to disk."""
    path = path or DEFAULT_HISTORY_FILE
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(history, f, indent=2)


def record_tx(
    tx_hash: str,
    chain: str,
    action: str,
    details: dict | None = None,
    path: str | None = None,
) -> dict:
    """Record a transaction in history.

    Args:
        tx_hash: Transaction hash.
        chain: Chain name.
        action: Action type (e.g. "swap", "supply", "bridge").
        details: Extra metadata.
        path: Custom history file path.

    Returns:
        The recorded entry.
    """
    import time

    entry = {
        "tx_hash": tx_hash,
        "chain": chain,
        "action": action,
        "timestamp": int(time.time()),
        "status": "pending",
        "details": details or {},
    }

    history = _load_history(path)
    history.append(entry)
    _save_history(history, path)
    return entry


def update_tx_status(
    tx_hash: str,
    status: str,
    gas_used: int | None = None,
    path: str | None = None,
) -> dict | None:
    """Update a transaction's status.

    Args:
        tx_hash: Transaction hash to update.
        status: New status ("confirmed", "failed", "pending").
        gas_used: Gas used (from receipt).
        path: Custom history file path.

    Returns:
        Updated entry or None if not found.
    """
    history = _load_history(path)
    for entry in history:
        if entry["tx_hash"] == tx_hash:
            entry["status"] = status
            if gas_used is not None:
                entry["gas_used"] = gas_used
            _save_history(history, path)
            return entry
    return None


def get_history(
    chain: str | None = None,
    action: str | None = None,
    limit: int = 50,
    path: str | None = None,
) -> list[dict]:
    """Query transaction history with optional filters.

    Args:
        chain: Filter by chain.
        action: Filter by action type.
        limit: Max number of results.
        path: Custom history file path.

    Returns:
        List of matching entries, newest first.
    """
    history = _load_history(path)

    if chain:
        history = [h for h in history if h["chain"] == chain]
    if action:
        history = [h for h in history if h["action"] == action]

    # Newest first
    history.sort(key=lambda h: h.get("timestamp", 0), reverse=True)
    return history[:limit]


def get_pending_txs(path: str | None = None) -> list[dict]:
    """Get all pending transactions."""
    history = _load_history(path)
    return [h for h in history if h["status"] == "pending"]


def check_and_update_pending(
    chain: str | None = None,
    path: str | None = None,
) -> list[dict]:
    """Check pending txs against RPC and update statuses.

    Returns:
        List of updated entries.
    """
    from defi_cli.executor import get_tx_receipt
    from defi_cli.registry import CHAINS

    pending = get_pending_txs(path)
    updated = []

    for entry in pending:
        if chain and entry["chain"] != chain:
            continue

        tx_chain = entry["chain"]
        if tx_chain not in CHAINS:
            continue

        rpc_url = CHAINS[tx_chain]["rpc_url"]
        receipt = get_tx_receipt(entry["tx_hash"], rpc_url)

        if receipt:
            status = "confirmed" if receipt.get("status") == "0x1" else "failed"
            gas_used = int(receipt.get("gasUsed", "0x0"), 16)
            result = update_tx_status(entry["tx_hash"], status, gas_used, path)
            if result:
                updated.append(result)

    return updated
