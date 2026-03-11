"""Core CLI entry point."""

import json

import click
from rich.console import Console
from rich.table import Table

from defi_cli import __version__

console = Console()


@click.group()
@click.version_option(version=__version__, prog_name="defi-cli")
def cli():
    """Multi-chain DeFi CLI for swaps, lending, bridges, and yield optimization."""
    pass


# ─── Info Commands ────────────────────────────────────────────────────────────


@cli.command()
def status():
    """Show supported chains, protocols, and capabilities."""
    from defi_cli.registry import CHAINS, PROTOCOLS, TOKENS

    console.print(f"[bold]defi-cli v{__version__}[/bold]\n")

    # Chains
    console.print(f"[cyan]Chains:[/cyan] {', '.join(CHAINS.keys())}")

    # Protocols by type
    by_type = {}
    for name, info in PROTOCOLS.items():
        by_type.setdefault(info["type"], []).append(name)
    for ptype, names in by_type.items():
        console.print(f"[cyan]{ptype.upper()}:[/cyan] {', '.join(names)}")

    # Tokens
    total_tokens = sum(len(t) for t in TOKENS.values())
    console.print(f"[cyan]Tokens:[/cyan] {total_tokens} across {len(TOKENS)} chains")

    # Capabilities
    capabilities = [
        "wallet (create/import/balance)",
        "dex (swap/quote/compare/liquidity)",
        "lending (supply/borrow/repay/withdraw/rates/positions)",
        "cdp (open/adjust/close/info)",
        "bridge (lifi/across/cctp/debridge)",
        "yield (compare/optimize/rebalance)",
        "gas (price/nonce/estimate)",
        "approve (build/check)",
        "transfer (erc20/native)",
        "wrap (deposit/withdraw)",
        "pipeline (supply/swap/repay)",
        "multicall (batch queries)",
        "flash loan (single/multi-asset)",
        "agent (JSON batch interface)",
    ]
    console.print(f"\n[green]Capabilities ({len(capabilities)}):[/green]")
    for cap in capabilities:
        console.print(f"  - {cap}")


@cli.command()
def chains():
    """List all supported chains."""
    from defi_cli.registry import CHAINS

    table = Table(title="Supported Chains")
    table.add_column("Chain", style="cyan")
    table.add_column("Chain ID", style="green")
    table.add_column("Native Token", style="yellow")
    table.add_column("RPC URL", style="dim")

    for name, info in CHAINS.items():
        table.add_row(name, str(info["chain_id"]), info["native_token"], info["rpc_url"])

    console.print(table)


@cli.command()
@click.argument("chain")
def tokens(chain):
    """List tokens available on a chain."""
    from defi_cli.registry import TOKENS

    if chain not in TOKENS:
        console.print(f"[red]Unknown chain: {chain}[/red]")
        raise SystemExit(1)

    table = Table(title=f"Tokens on {chain}")
    table.add_column("Symbol", style="cyan")
    table.add_column("Address", style="dim")

    for symbol, addr in TOKENS[chain].items():
        table.add_row(symbol, addr)

    console.print(table)


@cli.command()
def protocols():
    """List all supported protocols."""
    from defi_cli.registry import PROTOCOLS

    table = Table(title="Supported Protocols")
    table.add_column("Protocol", style="cyan")
    table.add_column("Type", style="green")
    table.add_column("Interface", style="yellow")
    table.add_column("Chains", style="dim")

    for name, info in PROTOCOLS.items():
        chains_list = ", ".join(info.get("chains", {}).keys()) or "API-based"
        table.add_row(name, info["type"], info["interface"], chains_list)

    console.print(table)


# ─── Wallet Commands ──────────────────────────────────────────────────────────


@cli.group()
def wallet():
    """Wallet management commands."""
    pass


@wallet.command("create")
def wallet_create():
    """Create a new wallet."""
    from defi_cli.wallet import create_wallet

    w = create_wallet()
    console.print(f"[green]Address:[/green]     {w['address']}")
    console.print(f"[yellow]Private Key:[/yellow] {w['private_key']}")
    console.print("[red]Save your private key securely![/red]")


@wallet.command("import")
@click.argument("private_key")
def wallet_import(private_key):
    """Import wallet from a private key."""
    from defi_cli.wallet import import_wallet

    w = import_wallet(private_key)
    console.print(f"[green]Imported:[/green] {w['address']}")


@wallet.command("balance")
@click.argument("chain")
@click.argument("address")
@click.option("--token", default=None, help="ERC20 token symbol (omit for native)")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def wallet_balance(chain, address, token, json_output):
    """Check balance on a chain."""
    from defi_cli.wallet import build_native_balance_call, build_token_balance_call

    if token:
        call = build_token_balance_call(chain, token, address)
        if json_output:
            click.echo(json.dumps(call, indent=2))
        else:
            console.print(f"[dim]ERC20 balanceOf call for {token} on {chain}:[/dim]")
            console.print(f"  to:   {call['to']}")
            console.print(f"  data: {call['data'][:20]}...")
    else:
        call = build_native_balance_call(chain, address)
        if json_output:
            click.echo(json.dumps(call, indent=2))
        else:
            console.print(f"[dim]eth_getBalance call on {chain}:[/dim]")
            console.print(f"  method: {call['method']}")
            console.print(f"  params: {call['params']}")


# ─── Wrap Commands ────────────────────────────────────────────────────────


@cli.group()
def wrap():
    """Wrap/unwrap native tokens (ETH/HYPE <-> WETH/WHYPE)."""
    pass


@wrap.command("deposit")
@click.argument("chain")
@click.argument("amount_wei", type=int)
@click.option("--json-output", is_flag=True, help="Output as JSON")
def wrap_deposit(chain, amount_wei, json_output):
    """Wrap native token (ETH -> WETH, HYPE -> WHYPE)."""
    from defi_cli.wrap import build_wrap_tx

    tx = build_wrap_tx(chain, amount_wei)
    _print_tx(tx, "Wrap", json_output)


@wrap.command("withdraw")
@click.argument("chain")
@click.argument("amount_wei", type=int)
@click.option("--json-output", is_flag=True, help="Output as JSON")
def wrap_withdraw(chain, amount_wei, json_output):
    """Unwrap wrapped token (WETH -> ETH, WHYPE -> HYPE)."""
    from defi_cli.wrap import build_unwrap_tx

    tx = build_unwrap_tx(chain, amount_wei)
    _print_tx(tx, "Unwrap", json_output)


# ─── Transfer Commands ────────────────────────────────────────────────────


@cli.group()
def transfer():
    """Token transfer commands."""
    pass


@transfer.command("erc20")
@click.argument("chain")
@click.argument("token")
@click.argument("to_address")
@click.argument("amount", type=int)
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def transfer_erc20(chain, token, to_address, amount, dry_run, json_output):
    """Build an ERC20 transfer transaction."""
    from defi_cli.transfer import build_erc20_transfer_tx

    tx = build_erc20_transfer_tx(
        chain=chain, token=token, to=to_address, amount=amount,
    )
    _print_tx(tx, "ERC20 Transfer", json_output)
    if dry_run:
        _execute_dry_run(tx)


@transfer.command("native")
@click.argument("chain")
@click.argument("to_address")
@click.argument("amount_wei", type=int)
@click.option("--json-output", is_flag=True, help="Output as JSON")
def transfer_native(chain, to_address, amount_wei, json_output):
    """Build a native token transfer transaction."""
    from defi_cli.transfer import build_native_transfer_tx

    tx = build_native_transfer_tx(
        chain=chain, to=to_address, amount_wei=amount_wei,
    )
    if json_output:
        click.echo(json.dumps(tx, indent=2))
    else:
        console.print("[green]Native Transfer TX:[/green]")
        console.print(f"  to:      {tx['to']}")
        console.print(f"  value:   {tx['value']} wei")
        console.print(f"  chainId: {tx['chainId']}")


# ─── DEX Commands ─────────────────────────────────────────────────────────────


@cli.group()
def dex():
    """DEX swap and liquidity commands."""
    pass


@dex.command("swap")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token_in")
@click.argument("token_out")
@click.argument("amount_in", type=int)
@click.argument("recipient")
@click.option("--fee", default=3000, help="Pool fee tier (default: 3000)")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def dex_swap(protocol, chain, token_in, token_out, amount_in, recipient,
             fee, dry_run, json_output):
    """Build a swap transaction."""
    from defi_cli.dex import build_swap_tx
    from defi_cli.registry import resolve_token

    tx = build_swap_tx(
        protocol=protocol, chain=chain,
        token_in=resolve_token(chain, token_in),
        token_out=resolve_token(chain, token_out),
        amount_in=amount_in, recipient=recipient, fee=fee,
    )

    _print_tx(tx, "Swap", json_output)
    if dry_run:
        _execute_dry_run(tx)


@dex.command("quote")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token_in")
@click.argument("token_out")
@click.argument("amount_in", type=int)
@click.option("--fee", default=3000, help="Pool fee tier")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def dex_quote(protocol, chain, token_in, token_out, amount_in,
              fee, json_output):
    """Get a swap price quote via QuoterV2."""
    from defi_cli.quote import build_quote_call

    call = build_quote_call(
        protocol=protocol, chain=chain,
        token_in=token_in, token_out=token_out,
        amount_in=amount_in, fee=fee,
    )
    if json_output:
        click.echo(json.dumps(call, indent=2))
    else:
        console.print("[green]QuoterV2 call:[/green]")
        console.print(f"  to:   {call['to']}")
        console.print(f"  data: {call['data'][:20]}...")


@dex.command("compare")
@click.argument("chain")
@click.argument("token_in")
@click.argument("token_out")
@click.argument("amount_in", type=int)
@click.option("--fee", default=3000, help="Pool fee tier")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def dex_compare(chain, token_in, token_out, amount_in, fee, json_output):
    """Compare swap quotes across all DEXes on a chain."""
    from defi_cli.quote import build_multi_quote_calls

    results = build_multi_quote_calls(
        chain=chain, token_in=token_in, token_out=token_out,
        amount_in=amount_in, fee=fee,
    )
    if json_output:
        output = [
            {"protocol": r["protocol"], **r["call"]}
            for r in results
        ]
        click.echo(json.dumps(output, indent=2))
    else:
        console.print(f"[green]Found {len(results)} DEX(es) on {chain}:[/green]")
        for r in results:
            console.print(f"  [cyan]{r['protocol']}[/cyan]: {r['call']['to']}")


# ─── Lending Commands ─────────────────────────────────────────────────────────


@cli.group()
def lending():
    """Lending protocol commands."""
    pass


@lending.command("supply")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.argument("amount", type=int)
@click.argument("on_behalf_of")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_supply(protocol, chain, asset, amount, on_behalf_of,
                   dry_run, json_output):
    """Build a supply/deposit transaction."""
    from defi_cli.lending import build_supply_tx
    from defi_cli.registry import resolve_token

    tx = build_supply_tx(protocol=protocol, chain=chain,
                         asset=resolve_token(chain, asset),
                         amount=amount, on_behalf_of=on_behalf_of)
    _print_tx(tx, "Supply", json_output)
    if dry_run:
        _execute_dry_run(tx)


@lending.command("borrow")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.argument("amount", type=int)
@click.argument("on_behalf_of")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_borrow(protocol, chain, asset, amount, on_behalf_of,
                   dry_run, json_output):
    """Build a borrow transaction."""
    from defi_cli.lending import build_borrow_tx
    from defi_cli.registry import resolve_token

    tx = build_borrow_tx(protocol=protocol, chain=chain,
                         asset=resolve_token(chain, asset),
                         amount=amount, on_behalf_of=on_behalf_of)
    _print_tx(tx, "Borrow", json_output)
    if dry_run:
        _execute_dry_run(tx)


@lending.command("repay")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.argument("amount", type=int)
@click.argument("on_behalf_of")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_repay(protocol, chain, asset, amount, on_behalf_of,
                  dry_run, json_output):
    """Build a repay transaction."""
    from defi_cli.lending import build_repay_tx
    from defi_cli.registry import resolve_token

    tx = build_repay_tx(protocol=protocol, chain=chain,
                        asset=resolve_token(chain, asset),
                        amount=amount, on_behalf_of=on_behalf_of)
    _print_tx(tx, "Repay", json_output)
    if dry_run:
        _execute_dry_run(tx)


@lending.command("withdraw")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.argument("amount", type=int)
@click.argument("to_address")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_withdraw(protocol, chain, asset, amount, to_address,
                     dry_run, json_output):
    """Build a withdraw transaction."""
    from defi_cli.lending import build_withdraw_tx
    from defi_cli.registry import resolve_token

    tx = build_withdraw_tx(protocol=protocol, chain=chain,
                           asset=resolve_token(chain, asset),
                           amount=amount, to=to_address)
    _print_tx(tx, "Withdraw", json_output)
    if dry_run:
        _execute_dry_run(tx)


@lending.command("rates")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_rates(protocol, chain, asset, json_output):
    """Build a getReserveData query."""
    from defi_cli.lending import build_get_rates_call
    from defi_cli.registry import resolve_token

    call = build_get_rates_call(protocol=protocol, chain=chain,
                                asset=resolve_token(chain, asset))
    if json_output:
        click.echo(json.dumps(call, indent=2))
    else:
        console.print("[green]getReserveData call:[/green]")
        console.print(f"  to:   {call['to']}")
        console.print(f"  data: {call['data'][:20]}...")


@lending.command("position")
@click.argument("protocol")
@click.argument("chain")
@click.argument("user")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_position(protocol, chain, user, json_output):
    """Build getUserAccountData query for a lending position."""
    from defi_cli.positions import build_user_account_data_call

    call = build_user_account_data_call(
        protocol=protocol, chain=chain, user=user,
    )
    if json_output:
        click.echo(json.dumps(call, indent=2))
    else:
        console.print("[green]getUserAccountData call:[/green]")
        console.print(f"  to:   {call['to']}")
        console.print(f"  data: {call['data'][:20]}...")


@lending.command("positions-all")
@click.argument("user")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def lending_positions_all(user, json_output):
    """Query positions across all lending protocols."""
    from defi_cli.positions import build_multi_position_calls

    results = build_multi_position_calls(user=user)
    if json_output:
        output = [
            {"protocol": r["protocol"], "chain": r["chain"], **r["call"]}
            for r in results
        ]
        click.echo(json.dumps(output, indent=2))
    else:
        console.print(f"[green]Positions across {len(results)} pools:[/green]")
        for r in results:
            console.print(
                f"  [cyan]{r['protocol']}[/cyan] on {r['chain']}: "
                f"{r['call']['to']}"
            )


# ─── CDP Commands ─────────────────────────────────────────────────────────────


@cli.group()
def cdp():
    """CDP (Felix) commands."""
    pass


@cdp.command("open")
@click.argument("collateral")
@click.argument("coll_amount", type=int)
@click.argument("debt_amount", type=int)
@click.argument("owner")
@click.option("--chain", default="hyperevm", help="Chain (default: hyperevm)")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_open(collateral, coll_amount, debt_amount, owner, chain,
             dry_run, json_output):
    """Build an openTrove transaction."""
    from defi_cli.cdp import build_open_trove_tx

    tx = build_open_trove_tx(chain=chain, collateral=collateral,
                             coll_amount=coll_amount, debt_amount=debt_amount, owner=owner)
    _print_tx(tx, "Open Trove", json_output)
    if dry_run:
        _execute_dry_run(tx)


@cdp.command("adjust")
@click.argument("collateral")
@click.argument("trove_id", type=int)
@click.argument("owner")
@click.option("--coll-change", default=0, type=int, help="Collateral change amount")
@click.option("--debt-change", default=0, type=int, help="Debt change amount")
@click.option("--coll-increase/--coll-decrease", default=True)
@click.option("--debt-increase/--debt-decrease", default=True)
@click.option("--chain", default="hyperevm")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_adjust(collateral, trove_id, owner, coll_change, debt_change,
               coll_increase, debt_increase, chain, dry_run, json_output):
    """Build an adjustTrove transaction."""
    from defi_cli.cdp import build_adjust_trove_tx

    tx = build_adjust_trove_tx(
        chain=chain, collateral=collateral, trove_id=trove_id,
        coll_change=coll_change, debt_change=debt_change,
        is_coll_increase=coll_increase, is_debt_increase=debt_increase,
        owner=owner,
    )
    _print_tx(tx, "Adjust Trove", json_output)
    if dry_run:
        _execute_dry_run(tx)


@cdp.command("info")
@click.argument("collateral")
@click.argument("trove_id", type=int)
@click.option("--chain", default="hyperevm")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_info(collateral, trove_id, chain, json_output):
    """Query trove info (debt and collateral)."""
    from defi_cli.cdp import build_get_trove_coll_call, build_get_trove_debt_call

    debt_call = build_get_trove_debt_call(chain, collateral, trove_id)
    coll_call = build_get_trove_coll_call(chain, collateral, trove_id)

    result = {"debt_call": debt_call, "coll_call": coll_call}
    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        console.print("[green]Trove query calls:[/green]")
        console.print(f"  Debt: {debt_call['to']} | {debt_call['data'][:20]}...")
        console.print(f"  Coll: {coll_call['to']} | {coll_call['data'][:20]}...")


@cdp.command("sp-deposit")
@click.argument("collateral")
@click.argument("amount", type=int)
@click.option("--chain", default="hyperevm")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_sp_deposit(collateral, amount, chain, json_output):
    """Deposit feUSD to a stability pool."""
    from defi_cli.cdp import build_deposit_to_sp_tx

    tx = build_deposit_to_sp_tx(chain=chain, collateral=collateral, amount=amount)
    _print_tx(tx, "SP Deposit", json_output)


@cdp.command("sp-withdraw")
@click.argument("collateral")
@click.argument("amount", type=int)
@click.option("--chain", default="hyperevm")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_sp_withdraw(collateral, amount, chain, json_output):
    """Withdraw feUSD from a stability pool."""
    from defi_cli.cdp import build_withdraw_from_sp_tx

    tx = build_withdraw_from_sp_tx(chain=chain, collateral=collateral, amount=amount)
    _print_tx(tx, "SP Withdraw", json_output)


@cdp.command("close")
@click.argument("collateral")
@click.argument("trove_id", type=int)
@click.argument("owner")
@click.option("--chain", default="hyperevm")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def cdp_close(collateral, trove_id, owner, chain, dry_run, json_output):
    """Build a closeTrove transaction."""
    from defi_cli.cdp import build_close_trove_tx

    tx = build_close_trove_tx(chain=chain, collateral=collateral,
                              trove_id=trove_id, owner=owner)
    _print_tx(tx, "Close Trove", json_output)
    if dry_run:
        _execute_dry_run(tx)


# ─── Bridge Commands ──────────────────────────────────────────────────────────


@cli.group()
def bridge():
    """Cross-chain bridge commands."""
    pass


@bridge.command("quote")
@click.argument("provider", type=click.Choice(["lifi", "across", "cctp", "debridge"]))
@click.argument("from_chain")
@click.argument("to_chain")
@click.argument("token")
@click.argument("amount", type=int)
@click.argument("sender")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def bridge_quote(provider, from_chain, to_chain, token, amount, sender, json_output):
    """Get a bridge quote / build bridge tx."""
    from defi_cli.bridge import (
        build_across_quote_params,
        build_cctp_burn_tx,
        build_debridge_quote_params,
        build_lifi_quote_params,
    )

    if provider == "lifi":
        result = build_lifi_quote_params(from_chain, to_chain, token, token, amount, sender)
    elif provider == "across":
        result = build_across_quote_params(from_chain, to_chain, token, amount, sender)
    elif provider == "cctp":
        result = build_cctp_burn_tx(from_chain, to_chain, amount, sender)
    elif provider == "debridge":
        result = build_debridge_quote_params(
            from_chain, to_chain, token, token, amount, sender, sender
        )

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        console.print(f"[green]{provider} result:[/green]")
        for k, v in result.items():
            val = str(v)
            if len(val) > 60:
                val = val[:60] + "..."
            console.print(f"  {k}: {val}")


# ─── Yield Commands ───────────────────────────────────────────────────────────


@cli.group("yield")
def yield_cmd():
    """Yield comparison and optimization commands."""
    pass


@yield_cmd.command("compare")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def yield_compare(json_output):
    """Compare lending rates across protocols (placeholder data)."""
    from defi_cli.yield_optimizer import compare_rates

    # Placeholder — in Phase 3 this will fetch real rates
    mock = [
        {"protocol": "aave_v3", "chain": "arbitrum", "asset": "USDC",
         "supply_apy": 3.5, "borrow_apy": 5.2},
        {"protocol": "aave_v3", "chain": "base", "asset": "USDC",
         "supply_apy": 4.0, "borrow_apy": 5.5},
        {"protocol": "hyperlend", "chain": "hyperevm", "asset": "USDC",
         "supply_apy": 4.8, "borrow_apy": 6.1},
    ]

    results = compare_rates(mock)

    if json_output:
        click.echo(json.dumps(results, indent=2))
    else:
        table = Table(title="Yield Comparison (Supply APY)")
        table.add_column("Protocol", style="cyan")
        table.add_column("Chain", style="green")
        table.add_column("Supply APY", style="yellow")
        table.add_column("Borrow APY", style="red")
        for r in results:
            table.add_row(r["protocol"], r["chain"],
                          f"{r['supply_apy']:.1f}%", f"{r['borrow_apy']:.1f}%")
        console.print(table)


# ─── Pipeline Commands ────────────────────────────────────────────────────


@cli.group()
def pipeline():
    """Multi-step transaction pipelines (approve + execute)."""
    pass


@pipeline.command("supply")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token")
@click.argument("amount", type=int)
@click.argument("sender")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def pipeline_supply(protocol, chain, token, amount, sender, json_output):
    """Build approve + supply pipeline."""
    from defi_cli.pipeline import build_supply_pipeline

    steps = build_supply_pipeline(
        protocol=protocol, chain=chain, token=token,
        amount=amount, sender=sender,
    )
    _print_pipeline(steps, json_output)


@pipeline.command("swap")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token_in")
@click.argument("token_out")
@click.argument("amount_in", type=int)
@click.argument("recipient")
@click.option("--fee", default=3000, help="Pool fee tier")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def pipeline_swap(protocol, chain, token_in, token_out, amount_in,
                  recipient, fee, json_output):
    """Build approve + swap pipeline."""
    from defi_cli.pipeline import build_swap_pipeline

    steps = build_swap_pipeline(
        protocol=protocol, chain=chain, token_in=token_in,
        token_out=token_out, amount_in=amount_in,
        recipient=recipient, fee=fee,
    )
    _print_pipeline(steps, json_output)


@pipeline.command("repay")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token")
@click.argument("amount", type=int)
@click.argument("sender")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def pipeline_repay(protocol, chain, token, amount, sender, json_output):
    """Build approve + repay pipeline."""
    from defi_cli.pipeline import build_repay_pipeline

    steps = build_repay_pipeline(
        protocol=protocol, chain=chain, token=token,
        amount=amount, sender=sender,
    )
    _print_pipeline(steps, json_output)


# ─── Gas Commands ─────────────────────────────────────────────────────────


@cli.group()
def gas():
    """Gas estimation and fee commands."""
    pass


@gas.command("price")
@click.argument("chain")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def gas_price(chain, json_output):
    """Get current gas price on a chain."""
    from defi_cli.gas import get_gas_price

    result = get_gas_price(chain)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]Gas price on {chain}:[/green]")
        console.print(f"  {result['gas_price_gwei']:.4f} gwei")
        console.print(f"  {result['gas_price_wei']} wei")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@gas.command("nonce")
@click.argument("chain")
@click.argument("address")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def gas_nonce(chain, address, json_output):
    """Get transaction count (nonce) for an address."""
    from defi_cli.gas import get_nonce

    result = get_nonce(chain, address)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]Nonce:[/green] {result['nonce']}")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@gas.command("estimate")
@click.argument("to_address")
@click.argument("data")
@click.argument("chain_id", type=int)
@click.option("--value", default=0, type=int, help="ETH value in wei")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def gas_estimate(to_address, data, chain_id, value, json_output):
    """Estimate gas for a transaction."""
    from defi_cli.gas import estimate_gas

    tx = {"to": to_address, "data": data, "chainId": chain_id, "value": value}
    result = estimate_gas(tx)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]Estimated gas:[/green] {result['gas']}")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


# ─── Approve Commands ────────────────────────────────────────────────────────


@cli.group()
def approve():
    """ERC20 token approval commands."""
    pass


@approve.command("build")
@click.argument("chain")
@click.argument("token")
@click.argument("spender")
@click.option("--amount", default=None, type=int,
              help="Amount to approve (default: max uint256)")
@click.option("--dry-run", is_flag=True, help="Simulate via eth_call")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def approve_build(chain, token, spender, amount, dry_run, json_output):
    """Build an ERC20 approve transaction."""
    from defi_cli.approve import build_approve_tx

    kwargs = {"chain": chain, "token": token, "spender": spender}
    if amount is not None:
        kwargs["amount"] = amount
    tx = build_approve_tx(**kwargs)
    _print_tx(tx, "Approve", json_output)
    if dry_run:
        _execute_dry_run(tx)


@approve.command("check")
@click.argument("chain")
@click.argument("token")
@click.argument("owner")
@click.argument("spender")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def approve_check(chain, token, owner, spender, json_output):
    """Check ERC20 allowance."""
    from defi_cli.approve import build_check_allowance_call

    call = build_check_allowance_call(
        chain=chain, token=token, owner=owner, spender=spender,
    )
    if json_output:
        click.echo(json.dumps(call, indent=2))
    else:
        console.print("[green]Allowance call:[/green]")
        console.print(f"  to:   {call['to']}")
        console.print(f"  data: {call['data'][:20]}...")


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _print_tx(tx: dict, label: str, json_output: bool) -> None:
    """Print transaction details."""
    if json_output:
        click.echo(json.dumps(tx, indent=2))
    else:
        console.print(f"[green]{label} TX built:[/green]")
        console.print(f"  to:      {tx['to']}")
        console.print(f"  chainId: {tx['chainId']}")
        console.print(f"  data:    {tx['data'][:20]}...({len(tx['data'])} chars)")
        if tx.get("value", 0) > 0:
            console.print(f"  value:   {tx['value']}")


# ─── Fetch Commands (live RPC) ────────────────────────────────────────────


@cli.group()
def fetch():
    """Live on-chain data queries via RPC."""
    pass


@fetch.command("balance")
@click.argument("chain")
@click.argument("address")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_balance_cmd(chain, address, json_output):
    """Fetch native token balance (live RPC call)."""
    from defi_cli.fetcher import fetch_balance

    result = fetch_balance(chain, address)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        from defi_cli.registry import CHAINS as CHAIN_DATA
        native = CHAIN_DATA[chain]["native_token"] if chain in CHAIN_DATA else "?"
        console.print(
            f"[green]{result['balance_eth']:.6f} {native}[/green]"
            f" ({result['balance_wei']} wei)"
        )
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@fetch.command("token-balance")
@click.argument("chain")
@click.argument("token")
@click.argument("address")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_token_balance_cmd(chain, token, address, json_output):
    """Fetch ERC20 token balance (live RPC call)."""
    from defi_cli.decimals import format_amount
    from defi_cli.fetcher import fetch_token_balance

    result = fetch_token_balance(chain, token, address)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        try:
            formatted = format_amount(result["balance_raw"], token)
            console.print(f"[green]{formatted}[/green]")
        except ValueError:
            console.print(f"[green]{result['balance_raw']} {token}[/green]")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@fetch.command("price")
@click.argument("protocol")
@click.argument("chain")
@click.argument("asset")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_price_cmd(protocol, chain, asset, json_output):
    """Fetch asset price from oracle (live RPC call)."""
    from defi_cli.fetcher import fetch_asset_price

    result = fetch_asset_price(protocol, chain, asset)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]{asset}: ${result['price_usd']:,.2f}[/green]")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@fetch.command("rates")
@click.argument("asset")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_rates_cmd(asset, json_output):
    """Fetch and compare lending rates across all protocols (live RPC)."""
    from defi_cli.fetcher import eth_call
    from defi_cli.rates import build_rate_comparison_calls, parse_reserve_data

    calls = build_rate_comparison_calls(asset)
    results = []

    for entry in calls:
        rpc_result = eth_call(entry["chain"], entry["call"])
        if rpc_result["success"]:
            parsed = parse_reserve_data(rpc_result["result"])
            results.append({
                "protocol": entry["protocol"],
                "chain": entry["chain"],
                "asset": asset,
                "supply_apy": round(parsed["supply_apy"], 4),
                "borrow_apy": round(parsed["borrow_apy"], 4),
            })
        else:
            results.append({
                "protocol": entry["protocol"],
                "chain": entry["chain"],
                "asset": asset,
                "error": rpc_result.get("error", "unknown"),
            })

    # Sort by supply_apy descending
    results.sort(
        key=lambda r: r.get("supply_apy", -1), reverse=True,
    )

    if json_output:
        click.echo(json.dumps(results, indent=2))
    else:
        table = Table(title=f"Live Lending Rates - {asset}")
        table.add_column("Protocol", style="cyan")
        table.add_column("Chain", style="green")
        table.add_column("Supply APY", style="yellow")
        table.add_column("Borrow APY", style="red")
        for r in results:
            if "error" in r:
                table.add_row(r["protocol"], r["chain"], "error", r["error"])
            else:
                table.add_row(
                    r["protocol"], r["chain"],
                    f"{r['supply_apy']:.4f}%",
                    f"{r['borrow_apy']:.4f}%",
                )
        console.print(table)


@fetch.command("position")
@click.argument("protocol")
@click.argument("chain")
@click.argument("user")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_position_cmd(protocol, chain, user, json_output):
    """Fetch lending position with health factor (live RPC call)."""
    from defi_cli.fetcher import fetch_user_position

    result = fetch_user_position(protocol, chain, user)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        status = result["health_status"]
        color = {
            "safe": "green", "healthy": "green",
            "moderate": "yellow", "at_risk": "red",
            "critical": "bold red",
        }.get(status, "white")
        console.print(f"[{color}]Status: {status}[/{color}]")
        console.print(
            f"  Collateral: ${result['total_collateral_usd']:,.2f}"
        )
        console.print(f"  Debt:       ${result['total_debt_usd']:,.2f}")
        console.print(f"  Health:     {result['health_factor']:.4f}")
        for rec in result.get("recommendations", []):
            console.print(f"  [dim]> {rec}[/dim]")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@fetch.command("dashboard")
@click.option("--assets", "-a", multiple=True, help="Assets to query (default: USDC,WETH)")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_dashboard_cmd(assets, json_output):
    """Live yield dashboard — rates across all lending protocols."""
    from defi_cli.dashboard import fetch_all_rates

    asset_list = list(assets) if assets else None
    rates = fetch_all_rates(asset_list)

    if json_output:
        click.echo(json.dumps(rates, indent=2))
    else:
        table = Table(title="Yield Dashboard")
        table.add_column("Asset", style="bold")
        table.add_column("Protocol", style="cyan")
        table.add_column("Chain", style="green")
        table.add_column("Supply APY", style="yellow")
        table.add_column("Borrow APY", style="red")

        for r in rates:
            table.add_row(
                r["asset"], r["protocol"], r["chain"],
                f"{r['supply_apy']:.4f}%",
                f"{r['borrow_apy']:.4f}%",
            )

        if not rates:
            console.print("[yellow]No rates available[/yellow]")
        else:
            console.print(table)


@fetch.command("portfolio")
@click.argument("chain")
@click.argument("address")
@click.option("--tokens", "-t", multiple=True, help="Specific tokens to check")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def fetch_portfolio_cmd(chain, address, tokens, json_output):
    """Fetch portfolio overview — native + token balances."""
    from defi_cli.dashboard import fetch_portfolio

    token_list = list(tokens) if tokens else None
    portfolio = fetch_portfolio(chain, address, token_list)

    if json_output:
        click.echo(json.dumps(portfolio, indent=2, default=str))
    else:
        console.print(f"[bold]Portfolio on {chain}[/bold]\n")

        if portfolio["native"]["success"]:
            n = portfolio["native"]
            console.print(f"  [cyan]Native:[/cyan] {n['balance_eth']:.6f}")

        if portfolio["tokens"]:
            table = Table()
            table.add_column("Token", style="cyan")
            table.add_column("Balance", style="green")
            for t in portfolio["tokens"]:
                table.add_row(t["token"], f"{t['balance']}")
            console.print(table)
        else:
            console.print("  [dim]No token balances found[/dim]")


# ─── Execute Commands ─────────────────────────────────────────────────────


@cli.group()
def execute():
    """Transaction execution commands (sign + send)."""
    pass


@execute.command("dry-run")
@click.argument("tx_json")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def execute_dry_run(tx_json, json_output):
    """Dry-run a transaction via eth_call.

    TX_JSON: JSON string or file path with transaction dict.
    """
    import os

    from defi_cli.executor import dry_run

    if os.path.exists(tx_json):
        with open(tx_json) as f:
            tx = json.load(f)
    else:
        tx = json.loads(tx_json)

    result = dry_run(tx)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]SUCCESS[/green]: {result['result'][:80]}...")
    else:
        console.print(f"[red]FAILED[/red]: {result['result']}")


@execute.command("sign")
@click.argument("tx_json")
@click.argument("private_key")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def execute_sign(tx_json, private_key, json_output):
    """Sign a transaction and output raw signed hex.

    TX_JSON: JSON string or file with prepared transaction.
    """
    import os

    from defi_cli.executor import sign_tx

    if os.path.exists(tx_json):
        with open(tx_json) as f:
            tx = json.load(f)
    else:
        tx = json.loads(tx_json)

    raw = sign_tx(tx, private_key)
    if json_output:
        click.echo(json.dumps({"raw_tx": raw}, indent=2))
    else:
        console.print(f"[green]Signed TX:[/green] {raw[:40]}...({len(raw)} chars)")


@execute.command("send")
@click.argument("raw_tx")
@click.argument("chain")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def execute_send(raw_tx, chain, json_output):
    """Send a signed transaction to the network."""
    from defi_cli.executor import send_raw_tx
    from defi_cli.registry import CHAINS

    rpc_url = CHAINS[chain]["rpc_url"]
    result = send_raw_tx(raw_tx, rpc_url)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    elif result["success"]:
        console.print(f"[green]TX Hash:[/green] {result['tx_hash']}")
    else:
        console.print(f"[red]Error:[/red] {result['error']}")


@execute.command("receipt")
@click.argument("tx_hash")
@click.argument("chain")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def execute_receipt(tx_hash, chain, json_output):
    """Get transaction receipt."""
    from defi_cli.executor import get_tx_receipt
    from defi_cli.registry import CHAINS

    rpc_url = CHAINS[chain]["rpc_url"]
    receipt = get_tx_receipt(tx_hash, rpc_url)
    if json_output:
        click.echo(json.dumps(receipt, indent=2))
    elif receipt:
        status = "SUCCESS" if receipt.get("status") == "0x1" else "FAILED"
        color = "green" if status == "SUCCESS" else "red"
        console.print(f"[{color}]{status}[/{color}]")
        console.print(f"  Block:    {int(receipt.get('blockNumber', '0x0'), 16)}")
        console.print(f"  Gas Used: {int(receipt.get('gasUsed', '0x0'), 16)}")
    else:
        console.print("[yellow]Receipt not found (tx may be pending)[/yellow]")


# ─── Simulate Commands ────────────────────────────────────────────────────


@cli.group()
def simulate():
    """Simulate transactions before execution."""
    pass


@simulate.command("swap")
@click.argument("protocol")
@click.argument("chain")
@click.argument("token_in")
@click.argument("token_out")
@click.argument("amount_in", type=int)
@click.option("--fee", default=3000, help="Pool fee tier")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def simulate_swap_cmd(protocol, chain, token_in, token_out, amount_in, fee, json_output):
    """Simulate a swap and show expected output."""
    from defi_cli.simulator import simulate_swap

    result = simulate_swap(protocol, chain, token_in, token_out, amount_in, fee)
    if json_output:
        click.echo(json.dumps(result, indent=2, default=str))
    elif result["success"]:
        console.print(f"[green]Expected output:[/green] {result['amount_out']}")
        console.print(f"  Gas estimate: {result['gas_estimate']}")
    else:
        console.print(f"[red]Simulation failed:[/red] {result.get('error', '')}")


@simulate.command("gas")
@click.argument("actions_json")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def simulate_gas_cmd(actions_json, json_output):
    """Estimate total gas for a batch of actions.

    ACTIONS_JSON: JSON string or file path with list of actions.
    """
    import os

    from defi_cli.simulator import estimate_total_gas

    if os.path.exists(actions_json):
        with open(actions_json) as f:
            actions = json.load(f)
    else:
        actions = json.loads(actions_json)

    result = estimate_total_gas(actions)
    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        console.print(f"[green]Total gas estimate:[/green] {result['total_gas']:,}")
        for i, gas in enumerate(result["per_action"]):
            console.print(f"  Action {i + 1}: {gas:,}")


# ─── Transaction History ──────────────────────────────────────────────────


@cli.group()
def history():
    """Transaction history tracking."""
    pass


@history.command("list")
@click.option("--chain", help="Filter by chain")
@click.option("--action", help="Filter by action type")
@click.option("--limit", default=20, help="Max results")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def history_list(chain, action, limit, json_output):
    """List transaction history."""
    from defi_cli.tracker import get_history

    entries = get_history(chain=chain, action=action, limit=limit)
    if json_output:
        click.echo(json.dumps(entries, indent=2))
    elif not entries:
        console.print("[dim]No transactions recorded[/dim]")
    else:
        table = Table(title="Transaction History")
        table.add_column("Hash", style="cyan", max_width=16)
        table.add_column("Chain", style="green")
        table.add_column("Action", style="yellow")
        table.add_column("Status")
        table.add_column("Gas Used")

        for e in entries:
            status = e["status"]
            color = {"confirmed": "green", "failed": "red", "pending": "yellow"}.get(
                status, "white"
            )
            gas = str(e.get("gas_used", "-"))
            table.add_row(
                e["tx_hash"][:16] + "...",
                e["chain"], e["action"],
                f"[{color}]{status}[/{color}]",
                gas,
            )
        console.print(table)


@history.command("pending")
@click.option("--check", is_flag=True, help="Check pending txs against RPC")
@click.option("--json-output", is_flag=True, help="Output as JSON")
def history_pending(check, json_output):
    """Show or check pending transactions."""
    if check:
        from defi_cli.tracker import check_and_update_pending

        updated = check_and_update_pending()
        if json_output:
            click.echo(json.dumps(updated, indent=2))
        elif updated:
            for u in updated:
                color = "green" if u["status"] == "confirmed" else "red"
                console.print(
                    f"  [{color}]{u['status']}[/{color}] "
                    f"{u['tx_hash'][:16]}... ({u['chain']})"
                )
        else:
            console.print("[dim]No pending transactions updated[/dim]")
    else:
        from defi_cli.tracker import get_pending_txs

        pending = get_pending_txs()
        if json_output:
            click.echo(json.dumps(pending, indent=2))
        elif pending:
            for p in pending:
                console.print(f"  [yellow]pending[/yellow] {p['tx_hash'][:16]}... ({p['chain']})")
        else:
            console.print("[dim]No pending transactions[/dim]")


@cli.command("agent")
@click.argument("json_input")
def agent_execute(json_input):
    """Process a JSON action or batch for AI agents.

    JSON_INPUT: JSON string or path to JSON file with action(s).
    Single action: {"type": "swap", ...}
    Batch: [{"type": "approve", ...}, {"type": "supply", ...}]
    """
    import os

    from defi_cli.agent import process_action, process_batch

    # Try to read as file first
    if os.path.exists(json_input):
        with open(json_input) as f:
            data = json.load(f)
    else:
        data = json.loads(json_input)

    if isinstance(data, list):
        results = process_batch(data)
    else:
        results = [process_action(data)]

    click.echo(json.dumps(results, indent=2))


# ─── Helpers ──────────────────────────────────────────────────────────────


def _print_pipeline(steps: list[dict], json_output: bool) -> None:
    """Print a multi-step transaction pipeline."""
    if json_output:
        click.echo(json.dumps(steps, indent=2))
    else:
        console.print(f"[green]Pipeline ({len(steps)} steps):[/green]")
        for i, step in enumerate(steps):
            label = step.get("label", f"Step {i + 1}")
            console.print(f"\n  [cyan]Step {i + 1}:[/cyan] {label}")
            console.print(f"    to:      {step['to']}")
            console.print(f"    chainId: {step['chainId']}")
            data = step.get("data", "")
            console.print(f"    data:    {data[:20]}...({len(data)} chars)")


def _execute_dry_run(tx: dict) -> None:
    """Execute dry-run and print result."""
    from defi_cli.executor import dry_run

    console.print("[dim]Executing dry-run via eth_call...[/dim]")
    result = dry_run(tx)
    if result["success"]:
        console.print(f"[green]Dry-run SUCCESS[/green]: {result['result'][:40]}...")
    else:
        console.print(f"[red]Dry-run FAILED[/red]: {result['result']}")


if __name__ == "__main__":
    cli()
