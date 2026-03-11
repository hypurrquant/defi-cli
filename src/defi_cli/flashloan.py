"""Flash loan transaction building for Aave V3."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, resolve_token

# flashLoan(address receiverAddress, address[] assets, uint256[] amounts,
#           uint256[] interestRateModes, address onBehalfOf,
#           bytes params, uint16 referralCode)
# selector: ab9c4b5d
FLASH_LOAN_SELECTOR = "ab9c4b5d"

# flashLoanSimple(address receiverAddress, address asset, uint256 amount,
#                 bytes params, uint16 referralCode)
# selector: 42b0b77c
FLASH_LOAN_SIMPLE_SELECTOR = "42b0b77c"


def build_flash_loan_tx(
    protocol: str,
    chain: str,
    receiver: str,
    assets: list[str],
    amounts: list[int],
    modes: list[int] | None = None,
    on_behalf_of: str | None = None,
    params: bytes = b"",
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 flashLoan transaction.

    Args:
        protocol: Lending protocol name.
        chain: Chain name.
        receiver: Flash loan receiver contract address.
        assets: List of token symbols or addresses.
        amounts: List of borrow amounts.
        modes: Interest rate modes (0=no debt, 1=stable, 2=variable).
        on_behalf_of: Address for debt if mode != 0.
        params: Arbitrary bytes passed to receiver.
        referral_code: Referral code.

    Returns:
        Transaction dict ready for signing.
    """
    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    chain_id = CHAINS[chain]["chain_id"]

    asset_addrs = [resolve_token(chain, a) for a in assets]

    if modes is None:
        modes = [0] * len(assets)  # No debt by default
    if on_behalf_of is None:
        on_behalf_of = receiver

    encoded = encode(
        ["address", "address[]", "uint256[]", "uint256[]",
         "address", "bytes", "uint16"],
        [receiver, asset_addrs, amounts, modes,
         on_behalf_of, params, referral_code],
    )

    return {
        "to": pool,
        "data": "0x" + FLASH_LOAN_SELECTOR + encoded.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_flash_loan_simple_tx(
    protocol: str,
    chain: str,
    receiver: str,
    asset: str,
    amount: int,
    params: bytes = b"",
    referral_code: int = 0,
) -> dict:
    """Build Aave V3 flashLoanSimple for a single asset.

    Simpler interface — always mode 0 (no debt incurred).
    """
    pool = PROTOCOLS[protocol]["chains"][chain]["pool"]
    chain_id = CHAINS[chain]["chain_id"]
    asset_addr = resolve_token(chain, asset)

    encoded = encode(
        ["address", "address", "uint256", "bytes", "uint16"],
        [receiver, asset_addr, amount, params, referral_code],
    )

    return {
        "to": pool,
        "data": "0x" + FLASH_LOAN_SIMPLE_SELECTOR + encoded.hex(),
        "chainId": chain_id,
        "value": 0,
    }
