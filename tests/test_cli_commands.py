"""Tests for extended CLI commands (gas, approve, CDP dry-run)."""

from click.testing import CliRunner

from defi_cli.cli import cli


def test_cli_gas_price_help():
    """gas price subcommand exists."""
    runner = CliRunner()
    result = runner.invoke(cli, ["gas", "price", "--help"])
    assert result.exit_code == 0
    assert "CHAIN" in result.output


def test_cli_gas_nonce_help():
    """gas nonce subcommand exists."""
    runner = CliRunner()
    result = runner.invoke(cli, ["gas", "nonce", "--help"])
    assert result.exit_code == 0
    assert "ADDRESS" in result.output


def test_cli_gas_estimate_help():
    """gas estimate subcommand exists."""
    runner = CliRunner()
    result = runner.invoke(cli, ["gas", "estimate", "--help"])
    assert result.exit_code == 0
    assert "TO_ADDRESS" in result.output


def test_cli_approve_build_help():
    """approve build subcommand exists."""
    runner = CliRunner()
    result = runner.invoke(cli, ["approve", "build", "--help"])
    assert result.exit_code == 0
    assert "SPENDER" in result.output


def test_cli_approve_check_help():
    """approve check subcommand exists."""
    runner = CliRunner()
    result = runner.invoke(cli, ["approve", "check", "--help"])
    assert result.exit_code == 0
    assert "OWNER" in result.output


def test_cli_approve_build_json():
    """approve build --json-output returns valid JSON."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "approve", "build", "arbitrum", "USDC",
        "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert "to" in data
    assert "data" in data
    assert data["chainId"] == 42161


def test_cli_cdp_open_has_dry_run():
    """CDP open command has --dry-run option."""
    runner = CliRunner()
    result = runner.invoke(cli, ["cdp", "open", "--help"])
    assert result.exit_code == 0
    assert "--dry-run" in result.output


def test_cli_cdp_close_has_dry_run():
    """CDP close command has --dry-run option."""
    runner = CliRunner()
    result = runner.invoke(cli, ["cdp", "close", "--help"])
    assert result.exit_code == 0
    assert "--dry-run" in result.output


def test_cli_dex_swap_json():
    """DEX swap --json-output returns valid JSON."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "dex", "swap", "uniswap_v3", "arbitrum",
        "USDC", "WETH", "1000000",
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert data["chainId"] == 42161


def test_cli_lending_supply_json():
    """Lending supply --json-output returns valid JSON."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "lending", "supply", "aave_v3", "arbitrum",
        "USDC", "1000000",
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert data["chainId"] == 42161


def test_cli_bridge_quote_json():
    """Bridge quote --json-output returns valid JSON."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "bridge", "quote", "lifi",
        "arbitrum", "base", "USDC", "1000000",
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert "fromChainId" in data or "fromChain" in data


def test_cli_pipeline_supply_json():
    """Pipeline supply --json-output returns list of tx dicts."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "pipeline", "supply", "aave_v3", "arbitrum",
        "USDC", "1000000",
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert isinstance(data, list)
    assert len(data) == 2
    assert "label" in data[0]


def test_cli_pipeline_swap_json():
    """Pipeline swap --json-output returns list of tx dicts."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "pipeline", "swap", "uniswap_v3", "arbitrum",
        "USDC", "WETH", "1000000",
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert isinstance(data, list)
    assert len(data) == 2


def test_cli_yield_compare_json():
    """Yield compare --json-output returns valid JSON."""
    runner = CliRunner()
    result = runner.invoke(cli, [
        "yield", "compare", "--json-output",
    ])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert isinstance(data, list)
    assert len(data) > 0
