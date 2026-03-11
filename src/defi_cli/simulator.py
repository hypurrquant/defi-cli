"""Transaction simulation — preview effects before execution."""


def simulate_swap(
    protocol: str,
    chain: str,
    token_in: str,
    token_out: str,
    amount_in: int,
    fee: int = 3000,
) -> dict:
    """Simulate a swap and return expected output.

    Uses QuoterV2 to get expected output without executing.

    Returns:
        {"success": bool, "amount_out": int, "price_impact": float, ...}
    """
    from defi_cli.fetcher import eth_call
    from defi_cli.quote import build_quote_call

    call = build_quote_call(protocol, chain, token_in, token_out, amount_in, fee)
    result = eth_call(chain, call)

    if not result["success"]:
        return {"success": False, "error": result.get("error", "")}

    try:
        from eth_abi import decode

        raw = bytes.fromhex(result["result"][2:])
        # QuoterV2 returns (amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate)
        decoded = decode(["uint256", "uint160", "uint32", "uint256"], raw)
        amount_out = decoded[0]
        gas_estimate = decoded[3]

        return {
            "success": True,
            "amount_in": amount_in,
            "amount_out": amount_out,
            "gas_estimate": gas_estimate,
            "protocol": protocol,
            "chain": chain,
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to decode quote: {e}"}


def simulate_supply(
    protocol: str,
    chain: str,
    token: str,
    amount: int,
    sender: str,
) -> dict:
    """Simulate a supply transaction via dry-run.

    Returns:
        {"success": bool, "will_succeed": bool, "gas_estimate": int}
    """
    from defi_cli.executor import dry_run
    from defi_cli.lending import build_supply_tx

    tx = build_supply_tx(protocol, chain, token, amount, sender)
    result = dry_run(tx)

    return {
        "success": True,
        "will_succeed": result["success"],
        "result_hex": result["result"][:40] if result["success"] else None,
        "error": result["result"] if not result["success"] else None,
        "tx_preview": {
            "to": tx["to"],
            "chainId": tx["chainId"],
            "data_length": len(tx["data"]),
        },
    }


def simulate_batch(actions: list[dict]) -> list[dict]:
    """Simulate multiple actions and return expected results.

    Each action should have a "type" field matching the agent action types.

    Returns:
        List of simulation results for each action.
    """
    results = []
    for action in actions:
        action_type = action.get("type", "")

        if action_type == "swap":
            result = simulate_swap(
                protocol=action["protocol"],
                chain=action["chain"],
                token_in=action["token_in"],
                token_out=action["token_out"],
                amount_in=action["amount_in"],
                fee=action.get("fee", 3000),
            )
        elif action_type == "supply":
            result = simulate_supply(
                protocol=action["protocol"],
                chain=action["chain"],
                token=action["token"],
                amount=action["amount"],
                sender=action["sender"],
            )
        else:
            # For other types, just do a generic dry-run
            from defi_cli.agent import process_action

            built = process_action(action)
            if built["success"]:
                tx = built.get("tx")
                if tx:
                    from defi_cli.executor import dry_run

                    dr = dry_run(tx)
                    result = {
                        "success": True,
                        "will_succeed": dr["success"],
                        "result": dr["result"][:40] if dr["success"] else dr["result"],
                    }
                else:
                    result = {"success": True, "note": "Multi-tx action, simulate individually"}
            else:
                result = {"success": False, "error": built["error"]}

        result["action_type"] = action_type
        results.append(result)

    return results


def estimate_total_gas(actions: list[dict]) -> dict:
    """Estimate total gas for a batch of actions.

    Returns:
        {"total_gas": int, "per_action": list[int]}
    """
    from defi_cli.agent import process_action

    per_action = []
    for action in actions:
        built = process_action(action)
        if built["success"] and "tx" in built:
            # Default gas estimates by action type
            gas = _estimate_gas_for_type(action.get("type", ""))
            per_action.append(gas)
        else:
            per_action.append(0)

    return {
        "total_gas": sum(per_action),
        "per_action": per_action,
    }


def _estimate_gas_for_type(action_type: str) -> int:
    """Conservative gas estimates by action type."""
    estimates = {
        "swap": 250_000,
        "supply": 300_000,
        "borrow": 350_000,
        "repay": 300_000,
        "withdraw": 300_000,
        "approve": 50_000,
        "transfer": 65_000,
        "native_transfer": 21_000,
        "flash_loan": 500_000,
        "bridge_cctp": 200_000,
        "wrap": 50_000,
        "unwrap": 50_000,
    }
    return estimates.get(action_type, 200_000)
