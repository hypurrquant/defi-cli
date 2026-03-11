"""Tests for configuration management."""

from prepare import CHAINS


def test_default_chain_configs():
    """Config module knows about all supported chains with correct chain IDs."""
    from defi_cli.config import get_chain_config

    for chain_name, expected in CHAINS.items():
        config = get_chain_config(chain_name)
        assert config["chain_id"] == expected["chain_id"]


def test_config_save_load_roundtrip(tmp_path):
    """Config can be saved to file and loaded back."""
    from defi_cli.config import load_config, save_config

    config = {"active_chain": "arbitrum", "rpc_overrides": {}}
    config_path = str(tmp_path / "config.toml")
    save_config(config, config_path)

    loaded = load_config(config_path)
    assert loaded["active_chain"] == "arbitrum"


def test_config_get_rpc_url():
    """Can retrieve a valid RPC URL for each supported chain."""
    from defi_cli.config import get_rpc_url

    for chain_name in CHAINS:
        rpc = get_rpc_url(chain_name)
        assert rpc.startswith("http")
