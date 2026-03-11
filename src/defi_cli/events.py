"""DeFi event log decoder — parse Transfer, Swap, Deposit, and other events."""

from web3 import Web3

# Event topic0 hashes for common DeFi events
EVENT_SIGNATURES = {
    "Transfer": "0x" + Web3.keccak(text="Transfer(address,address,uint256)").hex(),
    "Approval": "0x" + Web3.keccak(text="Approval(address,address,uint256)").hex(),
    "Swap": "0x" + Web3.keccak(
        text="Swap(address,address,int256,int256,uint160,uint128,int24)"
    ).hex(),
    "Deposit": "0x" + Web3.keccak(text="Deposit(address,uint256)").hex(),
    "Withdrawal": "0x" + Web3.keccak(text="Withdrawal(address,uint256)").hex(),
    "Supply": "0x" + Web3.keccak(
        text="Supply(address,address,uint256,uint16)"
    ).hex(),
    "Borrow": "0x" + Web3.keccak(
        text="Borrow(address,address,address,uint256,uint8,uint256,uint16)"
    ).hex(),
    "Repay": "0x" + Web3.keccak(
        text="Repay(address,address,address,uint256,bool)"
    ).hex(),
}

# Reverse lookup: topic0 -> event name
TOPIC_TO_EVENT = {v: k for k, v in EVENT_SIGNATURES.items()}


def identify_event(topic0: str) -> str | None:
    """Identify event name from topic0 hash.

    Args:
        topic0: hex string of the first topic (event signature hash).

    Returns:
        Event name or None if unknown.
    """
    # Normalize
    if not topic0.startswith("0x"):
        topic0 = "0x" + topic0
    return TOPIC_TO_EVENT.get(topic0)


def decode_transfer_log(log: dict) -> dict | None:
    """Decode a Transfer(address,address,uint256) event log.

    Args:
        log: Log dict with "topics" and "data" keys.

    Returns:
        {"event": "Transfer", "from": addr, "to": addr, "value": int}
    """
    topics = log.get("topics", [])
    if len(topics) < 3:
        return None

    from_addr = "0x" + topics[1][-40:]
    to_addr = "0x" + topics[2][-40:]
    value = int(log.get("data", "0x0"), 16)

    return {
        "event": "Transfer",
        "from": from_addr,
        "to": to_addr,
        "value": value,
    }


def decode_approval_log(log: dict) -> dict | None:
    """Decode an Approval(address,address,uint256) event log."""
    topics = log.get("topics", [])
    if len(topics) < 3:
        return None

    owner = "0x" + topics[1][-40:]
    spender = "0x" + topics[2][-40:]
    value = int(log.get("data", "0x0"), 16)

    return {
        "event": "Approval",
        "owner": owner,
        "spender": spender,
        "value": value,
    }


def decode_logs(logs: list[dict]) -> list[dict]:
    """Decode a list of event logs.

    Args:
        logs: List of log dicts from tx receipt.

    Returns:
        List of decoded events (unknown events included as-is with type="unknown").
    """
    decoded = []
    for log in logs:
        topics = log.get("topics", [])
        if not topics:
            decoded.append({"event": "unknown", "raw": log})
            continue

        topic0 = topics[0]
        event_name = identify_event(topic0)

        if event_name == "Transfer":
            result = decode_transfer_log(log)
        elif event_name == "Approval":
            result = decode_approval_log(log)
        else:
            result = {
                "event": event_name or "unknown",
                "topic0": topic0,
                "topics": topics[1:],
                "data": log.get("data", "0x"),
                "address": log.get("address", ""),
            }

        if result:
            result["contract"] = log.get("address", "")
            decoded.append(result)

    return decoded


def filter_events(logs: list[dict], event_name: str) -> list[dict]:
    """Filter decoded logs by event name.

    Args:
        logs: Raw log dicts.
        event_name: Event name to filter (e.g. "Transfer").

    Returns:
        List of decoded matching events.
    """
    decoded = decode_logs(logs)
    return [e for e in decoded if e.get("event") == event_name]
