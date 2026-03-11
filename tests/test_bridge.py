"""Tests for bridge operations (LI.FI, Across, CCTP, deBridge)."""

from prepare import CHAINS, PROTOCOLS, SELECTORS, TOKENS


def test_lifi_quote_params(sender):
    """Build correct LI.FI quote request: all required fields present."""
    from defi_cli.bridge import build_lifi_quote_params

    params = build_lifi_quote_params(
        from_chain="arbitrum",
        to_chain="base",
        from_token="USDC",
        to_token="USDC",
        amount=1000 * 10**6,
        sender=sender,
    )

    assert params["fromChain"] == str(CHAINS["arbitrum"]["chain_id"])
    assert params["toChain"] == str(CHAINS["base"]["chain_id"])
    assert params["fromToken"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert params["toToken"].lower() == TOKENS["base"]["USDC"].lower()
    assert params["fromAmount"] == str(1000 * 10**6)
    assert params["fromAddress"] == sender


def test_across_quote_params(sender):
    """Build correct Across suggested-fees request params."""
    from defi_cli.bridge import build_across_quote_params

    params = build_across_quote_params(
        from_chain="arbitrum",
        to_chain="base",
        token="USDC",
        amount=1000 * 10**6,
        sender=sender,
    )

    assert params["originChainId"] == CHAINS["arbitrum"]["chain_id"]
    assert params["destinationChainId"] == CHAINS["base"]["chain_id"]
    assert params["inputToken"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert params["amount"] == str(1000 * 10**6)


def test_cctp_burn_tx(sender):
    """Build CCTP depositForBurn tx: correct TokenMessenger + selector."""
    from defi_cli.bridge import build_cctp_burn_tx

    tx = build_cctp_burn_tx(
        from_chain="arbitrum",
        to_chain="base",
        amount=1000 * 10**6,
        recipient=sender,
    )

    expected_messenger = PROTOCOLS["cctp"]["contracts"]["token_messenger"]
    assert tx["to"].lower() == expected_messenger.lower()
    assert tx["data"][:10] == "0x" + SELECTORS["cctp_depositForBurn"]
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]


def test_debridge_quote_params(sender):
    """Build correct deBridge order creation params with correct chain IDs."""
    from defi_cli.bridge import build_debridge_quote_params

    params = build_debridge_quote_params(
        from_chain="arbitrum",
        to_chain="hyperevm",
        from_token="USDC",
        to_token="USDC",
        amount=1000 * 10**6,
        sender=sender,
        recipient=sender,
    )

    # deBridge uses its own internal chain IDs
    debridge_chain_ids = PROTOCOLS["debridge"]["chain_ids"]
    assert params["srcChainId"] == str(debridge_chain_ids["arbitrum"])
    assert params["dstChainId"] == str(debridge_chain_ids["hyperevm"])
    assert params["srcChainTokenIn"].lower() == TOKENS["arbitrum"]["USDC"].lower()
    assert params["srcChainTokenInAmount"] == str(1000 * 10**6)


def test_across_deposit_tx(sender):
    """Build Across depositV3 on-chain tx."""
    from defi_cli.bridge import build_across_deposit_tx

    tx = build_across_deposit_tx(
        from_chain="arbitrum",
        to_chain="base",
        token="USDC",
        amount=1000 * 10**6,
        recipient=sender,
    )

    spoke_pool = PROTOCOLS["across"]["chains"]["arbitrum"]["spoke_pool"]
    assert tx["to"].lower() == spoke_pool.lower()
    assert tx["data"][:10] == "0xe7a7ed02"
    assert tx["chainId"] == CHAINS["arbitrum"]["chain_id"]
    assert tx["value"] == 0
