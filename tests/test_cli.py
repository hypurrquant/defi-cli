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


def test_cli_status_command():
    """CLI status command shows system overview."""
    runner = CliRunner()
    result = runner.invoke(cli, ["status"])
    assert result.exit_code == 0
    assert "defi-cli" in result.output
    assert "Chains" in result.output
    assert "Capabilities" in result.output


def test_cli_protocols_command():
    """CLI protocols command lists all protocols."""
    runner = CliRunner()
    result = runner.invoke(cli, ["protocols"])
    assert result.exit_code == 0
    assert "aave_v3" in result.output.lower() or "Aave" in result.output


def test_cli_tokens_command():
    """CLI tokens command lists tokens on a chain."""
    runner = CliRunner()
    result = runner.invoke(cli, ["tokens", "arbitrum"])
    assert result.exit_code == 0
    assert "USDC" in result.output
