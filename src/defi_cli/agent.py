"""Agent-friendly interfaces for programmatic DeFi operations."""

from defi_cli.registry import resolve_token


def process_action(action: dict) -> dict:
    """Process a single DeFi action and return the built transaction(s).

    Accepts a structured action dict and dispatches to the correct builder.
    Designed for AI agent consumption — takes a uniform input format
    and returns uniform output.

    Args:
        action: Dict with "type" and type-specific parameters.

    Supported action types:
        - swap: {protocol, chain, token_in, token_out, amount_in, recipient}
        - supply: {protocol, chain, token, amount, sender}
        - borrow: {protocol, chain, token, amount, sender}
        - repay: {protocol, chain, token, amount, sender}
        - withdraw: {protocol, chain, token, amount, to}
        - approve: {chain, token, spender, amount?}
        - transfer: {chain, token, to, amount}
        - native_transfer: {chain, to, amount_wei}
        - flash_loan: {protocol, chain, receiver, assets, amounts}
        - bridge_cctp: {from_chain, to_chain, amount, sender}
        - quote: {protocol, chain, token_in, token_out, amount_in}

    Returns:
        {"success": True, "tx": dict} or {"success": True, "txs": list}
        or {"success": False, "error": str}
    """
    try:
        action_type = action["type"]
        handler = _HANDLERS.get(action_type)
        if handler is None:
            return {"success": False, "error": f"Unknown action type: {action_type}"}
        return handler(action)
    except KeyError as e:
        return {"success": False, "error": f"Missing required field: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def process_batch(actions: list[dict]) -> list[dict]:
    """Process a batch of DeFi actions.

    Returns list of results, one per action.
    """
    return [process_action(a) for a in actions]


# ─── Action handlers ─────────────────────────────────────────────────────


def _handle_swap(action: dict) -> dict:
    from defi_cli.dex import build_swap_tx
    chain = action["chain"]
    tx = build_swap_tx(
        protocol=action["protocol"], chain=chain,
        token_in=resolve_token(chain, action["token_in"]),
        token_out=resolve_token(chain, action["token_out"]),
        amount_in=action["amount_in"],
        recipient=action["recipient"],
        fee=action.get("fee", 3000),
    )
    return {"success": True, "tx": tx}


def _handle_supply(action: dict) -> dict:
    from defi_cli.lending import build_supply_tx
    chain = action["chain"]
    tx = build_supply_tx(
        protocol=action["protocol"], chain=chain,
        asset=resolve_token(chain, action["token"]),
        amount=action["amount"], on_behalf_of=action["sender"],
    )
    return {"success": True, "tx": tx}


def _handle_borrow(action: dict) -> dict:
    from defi_cli.lending import build_borrow_tx
    chain = action["chain"]
    tx = build_borrow_tx(
        protocol=action["protocol"], chain=chain,
        asset=resolve_token(chain, action["token"]),
        amount=action["amount"], on_behalf_of=action["sender"],
    )
    return {"success": True, "tx": tx}


def _handle_repay(action: dict) -> dict:
    from defi_cli.lending import build_repay_tx
    chain = action["chain"]
    tx = build_repay_tx(
        protocol=action["protocol"], chain=chain,
        asset=resolve_token(chain, action["token"]),
        amount=action["amount"], on_behalf_of=action["sender"],
    )
    return {"success": True, "tx": tx}


def _handle_withdraw(action: dict) -> dict:
    from defi_cli.lending import build_withdraw_tx
    chain = action["chain"]
    tx = build_withdraw_tx(
        protocol=action["protocol"], chain=chain,
        asset=resolve_token(chain, action["token"]),
        amount=action["amount"], to=action["to"],
    )
    return {"success": True, "tx": tx}


def _handle_approve(action: dict) -> dict:
    from defi_cli.approve import build_approve_tx
    kwargs = {
        "chain": action["chain"],
        "token": action["token"],
        "spender": action["spender"],
    }
    if "amount" in action:
        kwargs["amount"] = action["amount"]
    tx = build_approve_tx(**kwargs)
    return {"success": True, "tx": tx}


def _handle_transfer(action: dict) -> dict:
    from defi_cli.transfer import build_erc20_transfer_tx
    tx = build_erc20_transfer_tx(
        chain=action["chain"], token=action["token"],
        to=action["to"], amount=action["amount"],
    )
    return {"success": True, "tx": tx}


def _handle_native_transfer(action: dict) -> dict:
    from defi_cli.transfer import build_native_transfer_tx
    tx = build_native_transfer_tx(
        chain=action["chain"], to=action["to"],
        amount_wei=action["amount_wei"],
    )
    return {"success": True, "tx": tx}


def _handle_flash_loan(action: dict) -> dict:
    from defi_cli.flashloan import build_flash_loan_tx
    tx = build_flash_loan_tx(
        protocol=action["protocol"], chain=action["chain"],
        receiver=action["receiver"],
        assets=action["assets"], amounts=action["amounts"],
    )
    return {"success": True, "tx": tx}


def _handle_bridge_cctp(action: dict) -> dict:
    from defi_cli.bridge import build_cctp_burn_tx
    tx = build_cctp_burn_tx(
        from_chain=action["from_chain"], to_chain=action["to_chain"],
        amount=action["amount"], sender=action["sender"],
    )
    return {"success": True, "tx": tx}


def _handle_wrap(action: dict) -> dict:
    from defi_cli.wrap import build_wrap_tx
    tx = build_wrap_tx(chain=action["chain"], amount_wei=action["amount_wei"])
    return {"success": True, "tx": tx}


def _handle_unwrap(action: dict) -> dict:
    from defi_cli.wrap import build_unwrap_tx
    tx = build_unwrap_tx(chain=action["chain"], amount_wei=action["amount_wei"])
    return {"success": True, "tx": tx}


def _handle_pipeline_supply(action: dict) -> dict:
    from defi_cli.pipeline import build_supply_pipeline
    txs = build_supply_pipeline(
        protocol=action["protocol"], chain=action["chain"],
        token=action["token"], amount=action["amount"],
        sender=action["sender"],
    )
    return {"success": True, "txs": txs}


def _handle_pipeline_swap(action: dict) -> dict:
    from defi_cli.pipeline import build_swap_pipeline
    txs = build_swap_pipeline(
        protocol=action["protocol"], chain=action["chain"],
        token_in=action["token_in"], token_out=action["token_out"],
        amount_in=action["amount_in"], recipient=action["recipient"],
    )
    return {"success": True, "txs": txs}


def _handle_quote(action: dict) -> dict:
    from defi_cli.quote import build_quote_call
    call = build_quote_call(
        protocol=action["protocol"], chain=action["chain"],
        token_in=action["token_in"], token_out=action["token_out"],
        amount_in=action["amount_in"],
        fee=action.get("fee", 3000),
    )
    return {"success": True, "tx": call}


def _handle_fetch_rates(action: dict) -> dict:
    from defi_cli.dashboard import fetch_all_rates
    assets = action.get("assets", ["USDC", "WETH"])
    rates = fetch_all_rates(assets)
    return {"success": True, "data": rates}


def _handle_fetch_portfolio(action: dict) -> dict:
    from defi_cli.dashboard import fetch_portfolio
    result = fetch_portfolio(
        chain=action["chain"],
        address=action["address"],
        tokens=action.get("tokens"),
    )
    return {"success": True, "data": result}


def _handle_fetch_position(action: dict) -> dict:
    from defi_cli.fetcher import fetch_user_position
    result = fetch_user_position(
        protocol=action["protocol"],
        chain=action["chain"],
        user=action["address"],
    )
    return result


_HANDLERS = {
    "swap": _handle_swap,
    "supply": _handle_supply,
    "borrow": _handle_borrow,
    "repay": _handle_repay,
    "withdraw": _handle_withdraw,
    "approve": _handle_approve,
    "transfer": _handle_transfer,
    "native_transfer": _handle_native_transfer,
    "flash_loan": _handle_flash_loan,
    "bridge_cctp": _handle_bridge_cctp,
    "quote": _handle_quote,
    "wrap": _handle_wrap,
    "unwrap": _handle_unwrap,
    "pipeline_supply": _handle_pipeline_supply,
    "pipeline_swap": _handle_pipeline_swap,
    "fetch_rates": _handle_fetch_rates,
    "fetch_portfolio": _handle_fetch_portfolio,
    "fetch_position": _handle_fetch_position,
}
