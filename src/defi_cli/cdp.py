"""CDP operations for Felix (Liquity V2 fork) on HyperEVM."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS


def _get_felix_branch(chain: str, collateral: str) -> dict:
    """Get Felix branch config for a collateral type."""
    felix = PROTOCOLS["felix"]
    if chain not in felix.get("chains", {}):
        raise ValueError(f"Felix not available on {chain}")
    branches = felix["chains"][chain]["branches"]
    if collateral not in branches:
        raise ValueError(f"Unknown Felix collateral: {collateral}")
    return branches[collateral]


def build_open_trove_tx(
    chain: str,
    collateral: str,
    coll_amount: int,
    debt_amount: int,
    owner: str,
    max_upfront_fee: int = 10**18,
    annual_interest_rate: int = 5 * 10**16,  # 5%
) -> dict:
    """Build Felix openTrove tx on BorrowerOperations."""
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    # Liquity V2 openTrove signature (11 params):
    # openTrove(address,uint256,...,address,address,address)
    zero_addr = "0x" + "00" * 20
    params = encode(
        [
            "address", "uint256", "uint256", "uint256",
            "uint256", "uint256", "uint256", "uint256",
            "address", "address", "address",
        ],
        [
            owner,                  # _owner
            0,                      # _ownerIndex
            coll_amount,            # _collAmount
            debt_amount,            # _boldAmount
            0,                      # _upperHint
            0,                      # _lowerHint
            annual_interest_rate,   # _annualInterestRate
            max_upfront_fee,        # _maxUpfrontFee
            zero_addr,              # _addManager
            zero_addr,              # _removeManager
            zero_addr,              # _receiver
        ],
    )

    from web3 import Web3

    selector = Web3.keccak(
        text="openTrove(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address,address)"
    )[:4].hex()

    return {
        "to": branch["borrower_operations"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": coll_amount if collateral == "WHYPE" else 0,
    }


def build_adjust_trove_tx(
    chain: str,
    collateral: str,
    trove_id: int,
    coll_change: int,
    debt_change: int,
    is_coll_increase: bool,
    is_debt_increase: bool,
    owner: str,
    max_upfront_fee: int = 10**18,
) -> dict:
    """Build Felix adjustTrove tx."""
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    # adjustTrove(uint256,uint256,bool,uint256,bool,uint256)
    params = encode(
        ["uint256", "uint256", "bool", "uint256", "bool", "uint256"],
        [trove_id, coll_change, is_coll_increase, debt_change, is_debt_increase, max_upfront_fee],
    )

    from web3 import Web3

    selector = Web3.keccak(
        text="adjustTrove(uint256,uint256,bool,uint256,bool,uint256)"
    )[:4].hex()

    return {
        "to": branch["borrower_operations"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": coll_change if (collateral == "WHYPE" and is_coll_increase) else 0,
    }


def build_close_trove_tx(
    chain: str,
    collateral: str,
    trove_id: int,
    owner: str,
) -> dict:
    """Build Felix closeTrove tx."""
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    # closeTrove(uint256)
    params = encode(["uint256"], [trove_id])

    from web3 import Web3

    selector = Web3.keccak(text="closeTrove(uint256)")[:4].hex()

    return {
        "to": branch["borrower_operations"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }
