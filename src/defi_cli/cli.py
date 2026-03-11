"""Core CLI entry point."""

import click

from defi_cli import __version__


@click.group()
@click.version_option(version=__version__, prog_name="defi-cli")
def cli():
    """Multi-DEX DeFi CLI for perpetual trading, arbitrage, and position management."""
    pass


if __name__ == "__main__":
    cli()
