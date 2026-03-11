"""Core CLI entry point."""

import click

from defi_cli import __version__


@click.group()
@click.version_option(version=__version__, prog_name="defi-cli")
def cli():
    """Multi-chain DeFi CLI for swaps, lending, bridges, and yield optimization."""
    pass


@cli.command()
def chains():
    """List all supported chains."""
    from prepare import CHAINS

    for name, info in CHAINS.items():
        click.echo(f"{name} (chain_id={info['chain_id']}) — {info['rpc_url']}")


if __name__ == "__main__":
    cli()
