"""Protocol registry — chain configs, tokens, protocol addresses, selectors.

This is the runtime registry used by the CLI. It mirrors the constants
in prepare.py (the evaluation harness) so that both tests and the CLI
reference identical data.
"""

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
        "USDH": "0x111111a1a0667d36bD57c0A9f569b98057111111",
        "UBTC": "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463",
        "UETH": "0xBe6727B535545C67d5cAa73dEa54865B92CF7907",
        "NEST": "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035",
    },
}

PROTOCOLS = {
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
        "interface": "uniswap_v3_router",
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
        "interface": "algebra_v3",
        "chains": {
            "hyperevm": {
                "factory": "0x5f95E92c338e6453111Fc55ee66D4AafccE661A7",
                "swap_router": "0x4e73E421480a7E0C24fB3c11019254edE194f736",
                "quoter_v2": "0xc58874216AFe47779ADED27B8AAd77E8Bd6eBEBb",
                "position_manager": "0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2",
            },
        },
    },
    "projectx": {
        "type": "dex",
        "interface": "uniswap_v3_router",
        "chains": {
            "hyperevm": {
                "factory": "0xFF7B3E8C00e57ea31477c32A5B52a58Eea47b072",
                "swap_router": "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",
                "position_manager": "0xeaD19AE861c29bBb2101E834922B2FEee69B9091",
            },
        },
    },
    "nest": {
        "type": "dex",
        "interface": "algebra_v3",
        "chains": {
            "hyperevm": {
                "pool_deployer": "0x3842CE04380b8655a3a47ed87ea0d311adca161f",
                "position_manager": "0xeaf58788a405f3253814b4559391a22be8616250",
                "voter": "0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901",
                "nest_token": "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035",
                "ve_nest": "0x2f2Ae07e3cc3391A2E27825652BA8DcdD5412074",
            },
        },
    },
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
        "interface": "aave_v3",
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
        "interface": "aave_v3",
        "chains": {
            "hyperevm": {
                "pool": "0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b",
                "pool_addresses_provider": "0xA73ff12D177D8F1Ec938c3ba0e87D33524dD5594",
                "oracle": "0x9BE2ac1ff80950DCeb816842834930887249d9A8",
                "ui_pool_data_provider": "0x7b883191011AEAe40581d3Fa1B112413808C9c00",
            },
        },
    },
    "felix": {
        "type": "cdp",
        "interface": "liquity_v2",
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
            "arbitrum": {"spoke_pool": "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A"},
            "base": {"spoke_pool": "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64"},
        },
    },
    "cctp": {
        "type": "bridge",
        "interface": "cctp_v2",
        "contracts": {
            "token_messenger": "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
            "message_transmitter": "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
        },
        "domains": {"arbitrum": 3, "base": 6, "hyperevm": 19},
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
        "chain_ids": {"arbitrum": 42161, "base": 8453, "hyperevm": 100000022},
    },
}

def resolve_token(chain: str, token: str) -> str:
    """Resolve a token symbol to its address. Pass-through if already 0x."""
    if token.startswith("0x"):
        return token
    if chain not in TOKENS or token not in TOKENS[chain]:
        raise ValueError(f"Unknown token {token} on {chain}")
    return TOKENS[chain][token]


SELECTORS = {
    "erc20_balanceOf": "70a08231",
    "erc20_approve": "095ea7b3",
    "erc20_transfer": "a9059cbb",
    "v3_exactInputSingle": "414bf389",
    "v3_02_exactInputSingle": "04e45aaf",
    "v3_mint": "88316456",
    "v3_decreaseLiquidity": "0c49ccbe",
    "v3_collect": "fc6f7865",
    "aave_supply": "617ba037",
    "aave_borrow": "a415bcad",
    "aave_repay": "573ade81",
    "aave_withdraw": "69328dec",
    "aave_getUserAccountData": "bf92857c",
    "aave_getReserveData": "35ea6a75",
    "cctp_depositForBurn": "6fd3504e",
}
