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


def build_get_trove_info_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.Troves(uint256) eth_call to get trove info.

    Returns call dict for querying trove state.
    """
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    # Troves(uint256) — public mapping getter
    from web3 import Web3

    selector = Web3.keccak(text="Troves(uint256)")[:4].hex()
    params = encode(["uint256"], [trove_id])

    return {
        "to": branch["trove_manager"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "Troves(uint256)",
    }


def build_get_trove_debt_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.getTroveDebt(uint256) eth_call."""
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    from web3 import Web3

    selector = Web3.keccak(text="getTroveDebt(uint256)")[:4].hex()
    params = encode(["uint256"], [trove_id])

    return {
        "to": branch["trove_manager"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getTroveDebt(uint256)",
    }


def build_deposit_to_sp_tx(
    chain: str,
    collateral: str,
    amount: int,
) -> dict:
    """Build StabilityPool provideToSP(uint256, bool) tx.

    Deposits feUSD to a stability pool for a specific collateral branch.
    """
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    if "stability_pool" not in branch:
        raise ValueError(f"No stability pool for {collateral} on {chain}")

    from web3 import Web3

    # provideToSP(uint256 _amount, bool _doClaim)
    selector = Web3.keccak(text="provideToSP(uint256,bool)")[:4].hex()
    params = encode(["uint256", "bool"], [amount, True])

    return {
        "to": branch["stability_pool"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_withdraw_from_sp_tx(
    chain: str,
    collateral: str,
    amount: int,
) -> dict:
    """Build StabilityPool withdrawFromSP(uint256, bool) tx.

    Withdraws feUSD from a stability pool.
    """
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    if "stability_pool" not in branch:
        raise ValueError(f"No stability pool for {collateral} on {chain}")

    from web3 import Web3

    selector = Web3.keccak(text="withdrawFromSP(uint256,bool)")[:4].hex()
    params = encode(["uint256", "bool"], [amount, True])

    return {
        "to": branch["stability_pool"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_get_trove_coll_call(
    chain: str,
    collateral: str,
    trove_id: int,
) -> dict:
    """Build TroveManager.getTroveColl(uint256) eth_call."""
    branch = _get_felix_branch(chain, collateral)
    chain_id = CHAINS[chain]["chain_id"]

    from web3 import Web3

    selector = Web3.keccak(text="getTroveColl(uint256)")[:4].hex()
    params = encode(["uint256"], [trove_id])

    return {
        "to": branch["trove_manager"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "method_info": "getTroveColl(uint256)",
    }
