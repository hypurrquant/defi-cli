"""Integration tests for full agent workflows."""

from defi_cli.agent import process_action, process_batch

SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
VAULT = "0x" + "aa" * 20


def test_agent_full_supply_workflow():
    """Agent can build a full supply workflow: approve -> supply."""
    results = process_batch([
        {
            "type": "approve",
            "chain": "arbitrum",
            "token": "USDC",
            "spender": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        },
        {
            "type": "supply",
            "protocol": "aave_v3",
            "chain": "arbitrum",
            "token": "USDC",
            "amount": 1_000_000,
            "sender": SENDER,
        },
    ])

    assert len(results) == 2
    assert all(r["success"] for r in results)
    # Approve targets token contract
    assert results[0]["tx"]["data"][:10] == "0x095ea7b3"
    # Supply targets Aave pool
    assert results[1]["tx"]["data"][:10] == "0x617ba037"


def test_agent_full_swap_workflow():
    """Agent can build a full swap workflow: approve -> swap."""
    results = process_batch([
        {
            "type": "approve",
            "chain": "arbitrum",
            "token": "USDC",
            "spender": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        },
        {
            "type": "swap",
            "protocol": "uniswap_v3",
            "chain": "arbitrum",
            "token_in": "USDC",
            "token_out": "WETH",
            "amount_in": 1_000_000,
            "recipient": SENDER,
        },
    ])

    assert len(results) == 2
    assert all(r["success"] for r in results)
    # Different targets for approve vs swap
    assert results[0]["tx"]["to"] != results[1]["tx"]["to"]


def test_agent_vault_workflow():
    """Agent can build vault deposit and redeem."""
    results = process_batch([
        {
            "type": "vault_deposit",
            "chain": "arbitrum",
            "vault": VAULT,
            "amount": 1_000_000,
            "receiver": SENDER,
        },
        {
            "type": "vault_redeem",
            "chain": "arbitrum",
            "vault": VAULT,
            "shares": 500,
            "receiver": SENDER,
            "owner": SENDER,
        },
    ])

    assert len(results) == 2
    assert all(r["success"] for r in results)
    assert results[0]["tx"]["data"][:10] == "0x6e553f65"  # deposit
    assert results[1]["tx"]["data"][:10] == "0xba087652"  # redeem


def test_agent_cross_chain_workflow():
    """Agent can build cross-chain workflow: withdraw -> bridge -> supply."""
    results = process_batch([
        {
            "type": "withdraw",
            "protocol": "aave_v3",
            "chain": "arbitrum",
            "token": "USDC",
            "amount": 1_000_000,
            "to": SENDER,
        },
        {
            "type": "bridge_cctp",
            "from_chain": "arbitrum",
            "to_chain": "base",
            "amount": 1_000_000,
            "sender": SENDER,
        },
        {
            "type": "supply",
            "protocol": "aave_v3",
            "chain": "base",
            "token": "USDC",
            "amount": 1_000_000,
            "sender": SENDER,
        },
    ])

    assert len(results) == 3
    assert all(r["success"] for r in results)
    # First tx on Arbitrum
    assert results[0]["tx"]["chainId"] == 42161
    # Last tx on Base
    assert results[2]["tx"]["chainId"] == 8453


def test_agent_hyperevm_swap():
    """Agent can build swaps on HyperEVM protocols."""
    # ProjectX swap (Uniswap V3 fork)
    result = process_action({
        "type": "swap",
        "protocol": "projectx",
        "chain": "hyperevm",
        "token_in": "USDC",
        "token_out": "WHYPE",
        "amount_in": 1_000_000,
        "recipient": SENDER,
    })

    assert result["success"] is True
    assert result["tx"]["chainId"] == 999
    assert result["tx"]["to"] == "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B"


def test_agent_error_handling():
    """Agent handles errors gracefully."""
    # Unknown action type
    result = process_action({"type": "unknown_action"})
    assert result["success"] is False
    assert "Unknown action type" in result["error"]

    # Missing field
    result = process_action({"type": "swap"})
    assert result["success"] is False

    # Unknown protocol
    result = process_action({
        "type": "swap",
        "protocol": "nonexistent",
        "chain": "arbitrum",
        "token_in": "USDC",
        "token_out": "WETH",
        "amount_in": 1000,
        "recipient": SENDER,
    })
    assert result["success"] is False


def test_agent_all_action_types():
    """Verify all registered action types are handled."""
    from defi_cli.agent import _HANDLERS

    expected = {
        "swap", "supply", "borrow", "repay", "withdraw",
        "approve", "transfer", "native_transfer",
        "flash_loan", "bridge_cctp", "quote",
        "wrap", "unwrap",
        "pipeline_supply", "pipeline_swap",
        "fetch_rates", "fetch_portfolio", "fetch_position",
        "vault_deposit", "vault_withdraw", "vault_redeem",
    }

    assert set(_HANDLERS.keys()) == expected
