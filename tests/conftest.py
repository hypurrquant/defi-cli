"""Shared test fixtures for defi-cli test suite."""

import sys
from pathlib import Path

import pytest

# Ensure project root is importable (for `import prepare`)
sys.path.insert(0, str(Path(__file__).parent.parent))

# ─── Standard Test Addresses ─────────────────────────────────────────────────
# Hardhat account #0 — well-known test key, NEVER use on mainnet.
TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
TEST_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"


@pytest.fixture
def sender():
    """Standard test sender address."""
    return TEST_ADDRESS


@pytest.fixture
def recipient():
    """Standard test recipient address."""
    return TEST_RECIPIENT


@pytest.fixture
def private_key():
    """Standard test private key (Hardhat #0)."""
    return TEST_PRIVATE_KEY
