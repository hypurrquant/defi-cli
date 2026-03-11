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
