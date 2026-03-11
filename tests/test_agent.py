"""Tests for agent-friendly interface."""

from prepare import PROTOCOLS, SELECTORS, TOKENS

SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_agent_swap():
    """Agent swap action builds correct tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "swap",
        "protocol": "uniswap_v3",
        "chain": "arbitrum",
        "token_in": "USDC",
        "token_out": "WETH",
        "amount_in": 1_000_000,
        "recipient": SENDER,
    })

    assert result["success"] is True
    assert result["tx"]["data"][:10] == "0x" + SELECTORS["v3_02_exactInputSingle"]


def test_agent_supply():
    """Agent supply action builds correct tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "supply",
        "protocol": "aave_v3",
        "chain": "arbitrum",
        "token": "USDC",
        "amount": 1_000_000,
        "sender": SENDER,
    })

    assert result["success"] is True
    assert result["tx"]["data"][:10] == "0x" + SELECTORS["aave_supply"]


def test_agent_approve():
    """Agent approve action builds correct tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "approve",
        "chain": "arbitrum",
        "token": "USDC",
        "spender": PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"],
    })

    assert result["success"] is True
    assert result["tx"]["to"].lower() == TOKENS["arbitrum"]["USDC"].lower()


def test_agent_transfer():
    """Agent transfer action builds correct tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "transfer",
        "chain": "arbitrum",
        "token": "USDC",
        "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "amount": 500_000,
    })

    assert result["success"] is True
    assert result["tx"]["data"][:10] == "0x" + SELECTORS["erc20_transfer"]


def test_agent_batch():
    """Agent batch processes multiple actions."""
    from defi_cli.agent import process_batch

    actions = [
        {
            "type": "approve",
            "chain": "arbitrum",
            "token": "USDC",
            "spender": PROTOCOLS["aave_v3"]["chains"]["arbitrum"]["pool"],
        },
        {
            "type": "supply",
            "protocol": "aave_v3",
            "chain": "arbitrum",
            "token": "USDC",
            "amount": 1_000_000,
            "sender": SENDER,
        },
    ]

    results = process_batch(actions)
    assert len(results) == 2
    assert all(r["success"] for r in results)


def test_agent_unknown_action():
    """Unknown action type returns error."""
    from defi_cli.agent import process_action

    result = process_action({"type": "unknown_thing"})
    assert result["success"] is False
    assert "Unknown action" in result["error"]


def test_agent_missing_field():
    """Missing required field returns error."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "swap",
        "protocol": "uniswap_v3",
        # missing chain, token_in, etc.
    })
    assert result["success"] is False
    assert "Missing" in result["error"] or "required" in result["error"].lower()


def test_agent_native_transfer():
    """Agent native transfer action."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "native_transfer",
        "chain": "arbitrum",
        "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "amount_wei": 10**18,
    })

    assert result["success"] is True
    assert result["tx"]["value"] == 10**18


def test_agent_wrap():
    """Agent wrap action builds deposit tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "wrap",
        "chain": "arbitrum",
        "amount_wei": 10**18,
    })

    assert result["success"] is True
    assert result["tx"]["value"] == 10**18


def test_agent_unwrap():
    """Agent unwrap action builds withdraw tx."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "unwrap",
        "chain": "hyperevm",
        "amount_wei": 50 * 10**18,
    })

    assert result["success"] is True
    assert result["tx"]["value"] == 0


def test_agent_pipeline_supply():
    """Agent pipeline_supply returns multi-step txs."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "pipeline_supply",
        "protocol": "aave_v3",
        "chain": "arbitrum",
        "token": "USDC",
        "amount": 1_000_000,
        "sender": SENDER,
    })

    assert result["success"] is True
    assert "txs" in result
    assert len(result["txs"]) == 2  # approve + supply


def test_agent_pipeline_swap():
    """Agent pipeline_swap returns multi-step txs."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "pipeline_swap",
        "protocol": "uniswap_v3",
        "chain": "arbitrum",
        "token_in": "USDC",
        "token_out": "WETH",
        "amount_in": 1_000_000,
        "recipient": SENDER,
    })

    assert result["success"] is True
    assert len(result["txs"]) == 2


def test_agent_quote():
    """Agent quote action builds QuoterV2 call."""
    from defi_cli.agent import process_action

    result = process_action({
        "type": "quote",
        "protocol": "uniswap_v3",
        "chain": "arbitrum",
        "token_in": "USDC",
        "token_out": "WETH",
        "amount_in": 1_000_000,
    })

    assert result["success"] is True
    assert result["tx"]["data"][:10] == "0xc6a5026a"
