"""Tests for core CLI framework."""

from click.testing import CliRunner

from defi_cli.cli import cli


def test_cli_help():
    """CLI should display help text with DeFi description."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "DeFi" in result.output


def test_cli_version():
    """CLI should display version."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_cli_chains_command():
    """CLI has a 'chains' command that lists all supported chains."""
    runner = CliRunner()
    result = runner.invoke(cli, ["chains"])
    assert result.exit_code == 0
    output = result.output.lower()
    assert "arbitrum" in output
    assert "base" in output
    assert "hyperevm" in output
