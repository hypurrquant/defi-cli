"""
prepare.py — Fixed infrastructure for defi-cli autonomous development.

DO NOT MODIFY. This file contains the evaluation harness, protocol registry,
and test utilities that remain stable throughout the development loop.

Protocol Registry:
- DEX: Uniswap V3 (Arbitrum, Base), HyperSwap (HyperEVM), KittenSwap (HyperEVM)
- Lending: Aave V3 (Arbitrum, Base), HyperLend (HyperEVM), HypurrFi (HyperEVM)
- CDP: Felix (HyperEVM)
- Bridge: LI.FI, Across, Circle CCTP, deBridge

Future additions (contract addresses pending):
- DEX: ProjectX (Uniswap V4 fork on HyperEVM), NEST (ve(3,3) MetaDEX on HyperEVM)

Adapted from Karpathy's autoresearch methodology.
"""

import subprocess
import sys
import re
from pathlib import Path

# ─── Project Constants ───────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent
SRC_DIR = PROJECT_ROOT / "src" / "defi_cli"
TESTS_DIR = PROJECT_ROOT / "tests"
RESULTS_FILE = PROJECT_ROOT / "results.tsv"

# ─── Chain Configurations ────────────────────────────────────────────────────

CHAINS = {
    "arbitrum": {
        "chain_id": 42161,
        "rpc_url": "https://arb1.arbitrum.io/rpc",
        "explorer": "https://arbiscan.io",
        "native_token": "ETH",
    },
    "base": {
        "chain_id": 8453,
        "rpc_url": "https://mainnet.base.org",
        "explorer": "https://basescan.org",
        "native_token": "ETH",
    },
    "hyperevm": {
        "chain_id": 999,
        "rpc_url": "https://api.hyperliquid.xyz/evm",
        "explorer": "https://hyperevmscan.io",
        "native_token": "HYPE",
    },
}

# ─── Token Addresses ─────────────────────────────────────────────────────────

TOKENS = {
    "arbitrum": {
        "WETH": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        "USDC": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        "USDT": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        "ARB": "0x912CE59144191C1204E64559FE8253a0e49E6548",
    },
    "base": {
        "WETH": "0x4200000000000000000000000000000000000006",
        "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    "hyperevm": {
        "WHYPE": "0x5555555555555555555555555555555555555555",
        "USDC": "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
        "USDT0": "0xB8CE59FC3717adA4c02EADF9682a9E934F625EBb",
        "feUSD": "0x02c6a2fa58cc01a18b8d9e00ea48d65e4df26c70",
    },
}

# ─── Protocol Registry ────────────────────────────────────────────────────────

PROTOCOLS = {
    # ── DEX ──────────────────────────────────────────────────────────────────
    "uniswap_v3": {
        "type": "dex",
        "interface": "uniswap_v3_router02",
        "chains": {
            "arbitrum": {
                "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
                "swap_router": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
                "position_manager": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                "quoter_v2": "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
            },
            "base": {
                "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
                "swap_router": "0x2626664c2603336E57B271c5C0b26F421741e481",
                "position_manager": "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
                "quoter_v2": "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
            },
        },
    },
    "hyperswap": {
        "type": "dex",
        "interface": "uniswap_v3_router",  # Original V3 SwapRouter (with deadline)
        "chains": {
            "hyperevm": {
                "factory": "0xB1c0fa0B789320044A6F623cFe5eBda9562602E3",
                "swap_router": "0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D",
                "v2_factory": "0x4df039804873717bff7d03694fb941cf0469b79e",
                "v2_router": "0xDa0f518d521e0dE83fAdC8500C2D21b6a6C39bF9",
            },
        },
    },
    "kittenswap": {
        "type": "dex",
        "interface": "algebra_v3",  # Algebra Integral, V3-compatible, no fee param
        "chains": {
            "hyperevm": {
                "factory": "0x5f95E92c338e6453111Fc55ee66D4AafccE661A7",
                "swap_router": "0x4e73E421480a7E0C24fB3c11019254edE194f736",
                "quoter_v2": "0xc58874216AFe47779ADED27B8AAd77E8Bd6eBEBb",
                "position_manager": "0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2",
            },
        },
    },

    # ── Lending ──────────────────────────────────────────────────────────────
    "aave_v3": {
        "type": "lending",
        "interface": "aave_v3",
        "chains": {
            "arbitrum": {
                "pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
                "pool_addresses_provider": "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
                "oracle": "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7",
            },
            "base": {
                "pool": "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
                "pool_addresses_provider": "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
                "oracle": "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
            },
        },
    },
    "hyperlend": {
        "type": "lending",
        "interface": "aave_v3",  # Aave V3.0.2 fork
        "chains": {
            "hyperevm": {
                "pool": "0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b",
                "pool_addresses_provider": "0x72c98246a98bFe64022a3190e7710E157497170C",
                "oracle": "0xC9Fb4fbE842d57EAc1dF3e641a281827493A630e",
                "ui_pool_data_provider": "0x3Bb92CF81E38484183cc96a4Fb8fBd2d73535807",
            },
        },
    },
    "hypurrfi": {
        "type": "lending",
        "interface": "aave_v3",  # Aave-style pooled markets
        "chains": {
            "hyperevm": {
                "pool": "0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b",
                "pool_addresses_provider": "0xA73ff12D177D8F1Ec938c3ba0e87D33524dD5594",
                "oracle": "0x9BE2ac1ff80950DCeb816842834930887249d9A8",
                "ui_pool_data_provider": "0x7b883191011AEAe40581d3Fa1B112413808C9c00",
            },
        },
    },

    # ── CDP ───────────────────────────────────────────────────────────────────
    "felix": {
        "type": "cdp",
        "interface": "liquity_v2",  # Liquity V2 fork
        "chains": {
            "hyperevm": {
                "feusd_token": "0x02c6a2fa58cc01a18b8d9e00ea48d65e4df26c70",
                "collateral_registry": "0x9de1e57049c475736289cb006212f3e1dce4711b",
                "hint_helpers": "0xa32e89c658f7fdcc0bdb2717f253bacd99f864d4",
                "branches": {
                    "WHYPE": {
                        "borrower_operations": "0x5b271dc20ba7beb8eee276eb4f1644b6a217f0a3",
                        "trove_manager": "0x3100f4e7bda2ed2452d9a57eb30260ab071bbe62",
                        "stability_pool": "0x576c9c501473e01ae23748de28415a74425efd6b",
                        "sorted_troves": "0xd1caa4218808eb94d36e1df7247f7406f43f2ef6",
                        "active_pool": "0x39ebba742b6917d49d4a9ac7cf5c70f84d34cc9e",
                        "zapper": "0x999876BC29Bc2251539C900a1bCfC6C934991F49",
                    },
                    "UBTC": {
                        "borrower_operations": "0x36b7bd65276eda7cdc5f730da5cdb7ee7736672e",
                        "trove_manager": "0xbbe5f227275f24b64bd290a91f55723a00214885",
                        "stability_pool": "0xabf0369530205ae56dd4c49629474c65d1168924",
                    },
                },
            },
        },
    },

    # ── Bridge ────────────────────────────────────────────────────────────────
    "lifi": {
        "type": "bridge",
        "interface": "rest_api",
        "api_base": "https://li.quest/v1",
        "endpoints": {
            "quote": "/quote",
            "status": "/status",
            "chains": "/chains",
            "tokens": "/tokens",
        },
    },
    "across": {
        "type": "bridge",
        "interface": "rest_api_and_contract",
        "api_base": "https://app.across.to/api",
        "endpoints": {
            "suggested_fees": "/suggested-fees",
            "limits": "/limits",
            "available_routes": "/available-routes",
        },
        "chains": {
            "arbitrum": {
                "spoke_pool": "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
            },
            "base": {
                "spoke_pool": "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
            },
        },
    },
    "cctp": {
        "type": "bridge",
        "interface": "cctp_v2",
        "contracts": {
            "token_messenger": "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
            "message_transmitter": "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
        },
        "domains": {
            "arbitrum": 3,
            "base": 6,
            "hyperevm": 19,
        },
        "attestation_api": "https://iris-api.circle.com/v2/attestations",
    },
    "debridge": {
        "type": "bridge",
        "interface": "rest_api",
        "api_base": "https://dln.debridge.finance/v1.0",
        "endpoints": {
            "create_tx": "/dln/order/create-tx",
            "order_status": "/dln/order/status",
        },
        "chain_ids": {
            "arbitrum": 42161,
            "base": 8453,
            "hyperevm": 100000022,  # deBridge internal chain ID for HyperEVM
        },
    },
}

# ─── Known Function Selectors ─────────────────────────────────────────────────
# 4-byte keccak256 of canonical function signature (hex, no 0x prefix).
# These serve as ground truth for dry-run calldata verification.

SELECTORS = {
    # ERC20 standard
    "erc20_balanceOf": "70a08231",           # balanceOf(address)
    "erc20_approve": "095ea7b3",             # approve(address,uint256)
    "erc20_transfer": "a9059cbb",            # transfer(address,uint256)

    # Uniswap V3 SwapRouter (original, with deadline in struct)
    # exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    "v3_exactInputSingle": "414bf389",

    # Uniswap V3 SwapRouter02 (no deadline in struct, deadline via multicall)
    # exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
    "v3_02_exactInputSingle": "04e45aaf",

    # NonfungiblePositionManager
    # mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))
    "v3_mint": "88316456",
    # decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))
    "v3_decreaseLiquidity": "0c49ccbe",
    # collect((uint256,address,uint128,uint128))
    "v3_collect": "fc6f7865",

    # Aave V3 Pool
    "aave_supply": "617ba037",              # supply(address,uint256,address,uint16)
    "aave_borrow": "a415bcad",              # borrow(address,uint256,uint256,uint16,address)
    "aave_repay": "573ade81",               # repay(address,uint256,uint256,address)
    "aave_withdraw": "69328dec",            # withdraw(address,uint256,address)
    "aave_getUserAccountData": "bf92857c",  # getUserAccountData(address)
    "aave_getReserveData": "35ea6a75",      # getReserveData(address)

    # Circle CCTP V2 TokenMessenger
    "cctp_depositForBurn": "6fd3504e",      # depositForBurn(uint256,uint32,bytes32,address)
}

# ─── Feature Checklist ────────────────────────────────────────────────────────

FEATURES = [
    # Core
    "cli_framework",        # CLI with help, version, chain listing
    "config_management",    # Config file loading/saving, RPC settings
    # Wallet
    "wallet_create",        # Create new wallet (keypair generation)
    "wallet_import",        # Import wallet from private key
    "wallet_balance",       # Native token balance query
    "token_balance",        # ERC20 token balance query
    # DEX
    "dex_swap",             # Token swap transaction building
    "dex_add_liquidity",    # Add concentrated liquidity
    "dex_remove_liquidity", # Remove liquidity
    # Lending
    "lending_supply",       # Supply/deposit to lending pool
    "lending_borrow",       # Borrow from lending pool
    "lending_repay",        # Repay lending debt
    "lending_withdraw",     # Withdraw from lending pool
    "lending_rates",        # Query lending/borrow APY
    # CDP
    "cdp_open_trove",       # Open CDP trove (Felix)
    "cdp_manage",           # Manage CDP (collateral + debt adjustments)
    # Bridge
    "bridge_quote",         # Get bridge quote (route + fees)
    "bridge_transfer",      # Build bridge transfer transaction
    # Yield
    "yield_compare",        # Compare yields across protocols/chains
    "yield_optimize",       # Suggest optimal yield strategy (cost-aware)
]


# ─── Evaluation Harness ──────────────────────────────────────────────────────

def run_tests() -> dict:
    """Run the test suite and return results."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--tb=short", "-q", str(TESTS_DIR)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    output = result.stdout + result.stderr
    passed = 0
    failed = 0
    errors = 0

    match = re.search(r"(\d+) passed", output)
    if match:
        passed = int(match.group(1))
    match = re.search(r"(\d+) failed", output)
    if match:
        failed = int(match.group(1))
    match = re.search(r"(\d+) error", output)
    if match:
        errors = int(match.group(1))

    total = passed + failed + errors

    return {
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "total": total,
        "output": output,
        "returncode": result.returncode,
    }


def run_lint() -> dict:
    """Run ruff linter and return results."""
    result = subprocess.run(
        [sys.executable, "-m", "ruff", "check", str(SRC_DIR)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    lint_errors = len([
        line for line in result.stdout.strip().split("\n")
        if line.strip() and not line.startswith("All checks passed")
    ])

    return {
        "errors": lint_errors,
        "output": result.stdout,
        "returncode": result.returncode,
    }


def compute_score(test_results: dict, lint_results: dict) -> float:
    """
    Compute the composite development score.

    score = (tests_passing / tests_total) * 100 - (lint_errors * 0.5)

    Higher is better. Target: 100.0
    """
    if test_results["total"] == 0:
        test_score = 0.0
    else:
        test_score = (test_results["passed"] / test_results["total"]) * 100

    lint_penalty = lint_results["errors"] * 0.5

    return max(0.0, test_score - lint_penalty)


def evaluate() -> dict:
    """Run full evaluation and return all metrics."""
    test_results = run_tests()
    lint_results = run_lint()
    score = compute_score(test_results, lint_results)

    return {
        "score": score,
        "tests": test_results,
        "lint": lint_results,
    }


def print_summary(results: dict) -> None:
    """Print evaluation summary in standard format."""
    t = results["tests"]
    ln = results["lint"]
    print("---")
    print(f"score:        {results['score']:.1f}")
    print(f"tests_passed: {t['passed']}/{t['total']}")
    print(f"tests_failed: {t['failed']}")
    print(f"lint_errors:  {ln['errors']}")
    print(f"features:     {len(FEATURES)} defined")


def init_results_tsv() -> None:
    """Initialize results.tsv with header row."""
    if not RESULTS_FILE.exists():
        RESULTS_FILE.write_text("commit\tscore\ttests_pass\tstatus\tdescription\n")


# ─── CLI for standalone evaluation ──────────────────────────────────────────

if __name__ == "__main__":
    results = evaluate()
    print_summary(results)
