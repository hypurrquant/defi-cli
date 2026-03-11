"""Configuration management for defi-cli."""

import toml

from defi_cli.registry import CHAINS


def get_chain_config(chain_name: str) -> dict:
    """Get chain configuration by name."""
    if chain_name not in CHAINS:
        raise ValueError(f"Unknown chain: {chain_name}. Supported: {list(CHAINS.keys())}")
    return CHAINS[chain_name]


def get_rpc_url(chain_name: str) -> str:
    """Get RPC URL for a chain."""
    return get_chain_config(chain_name)["rpc_url"]


def save_config(config: dict, path: str) -> None:
    """Save configuration to a TOML file."""
    with open(path, "w") as f:
        toml.dump(config, f)


def load_config(path: str) -> dict:
    """Load configuration from a TOML file."""
    with open(path) as f:
        return toml.load(f)
