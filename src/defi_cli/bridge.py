"""Bridge operations: LI.FI, Across, CCTP, deBridge."""

from eth_abi import encode

from defi_cli.registry import CHAINS, PROTOCOLS, SELECTORS, TOKENS


def build_lifi_quote_params(
    from_chain: str,
    to_chain: str,
    from_token: str,
    to_token: str,
    amount: int,
    sender: str,
) -> dict:
    """Build LI.FI /quote request parameters."""
    from_token_addr = TOKENS[from_chain].get(from_token, from_token)
    to_token_addr = TOKENS[to_chain].get(to_token, to_token)

    return {
        "fromChain": str(CHAINS[from_chain]["chain_id"]),
        "toChain": str(CHAINS[to_chain]["chain_id"]),
        "fromToken": from_token_addr,
        "toToken": to_token_addr,
        "fromAmount": str(amount),
        "fromAddress": sender,
    }


def build_across_quote_params(
    from_chain: str,
    to_chain: str,
    token: str,
    amount: int,
    sender: str,
) -> dict:
    """Build Across /suggested-fees request parameters."""
    token_addr = TOKENS[from_chain].get(token, token)

    return {
        "originChainId": CHAINS[from_chain]["chain_id"],
        "destinationChainId": CHAINS[to_chain]["chain_id"],
        "inputToken": token_addr,
        "amount": str(amount),
        "recipient": sender,
    }


def build_cctp_burn_tx(
    from_chain: str,
    to_chain: str,
    amount: int,
    recipient: str,
) -> dict:
    """Build CCTP V2 depositForBurn(uint256,uint32,bytes32,address) tx."""
    cctp = PROTOCOLS["cctp"]
    chain_id = CHAINS[from_chain]["chain_id"]
    dest_domain = cctp["domains"][to_chain]
    usdc_address = TOKENS[from_chain]["USDC"]

    selector = SELECTORS["cctp_depositForBurn"]

    # Convert recipient address to bytes32 (left-padded)
    recipient_bytes32 = bytes.fromhex(recipient.replace("0x", "").zfill(64))

    params = encode(
        ["uint256", "uint32", "bytes32", "address"],
        [amount, dest_domain, recipient_bytes32, usdc_address],
    )

    return {
        "to": cctp["contracts"]["token_messenger"],
        "data": "0x" + selector + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_across_deposit_tx(
    from_chain: str,
    to_chain: str,
    token: str,
    amount: int,
    recipient: str,
    relayer_fee_pct: int = 0,
    quote_timestamp: int = 0,
    fill_deadline: int = 2**32 - 1,
    exclusivity_deadline: int = 0,
    message: bytes = b"",
) -> dict:
    """Build Across V3 SpokePool depositV3 transaction.

    depositV3(address depositor, address recipient,
              address inputToken, address outputToken,
              uint256 inputAmount, uint256 outputAmount,
              uint256 destinationChainId, address exclusiveRelayer,
              uint32 quoteTimestamp, uint32 fillDeadline,
              uint32 exclusivityDeadline, bytes message)
    selector: e7a7ed02
    """
    across = PROTOCOLS["across"]
    spoke_pool = across["chains"][from_chain]["spoke_pool"]
    chain_id = CHAINS[from_chain]["chain_id"]
    dest_chain_id = CHAINS[to_chain]["chain_id"]

    token_addr = TOKENS[from_chain].get(token, token)
    # Output token is same symbol on destination chain
    output_token = TOKENS[to_chain].get(token, token)

    zero_addr = "0x" + "00" * 20

    params = encode(
        [
            "address", "address", "address", "address",
            "uint256", "uint256", "uint256", "address",
            "uint32", "uint32", "uint32", "bytes",
        ],
        [
            recipient,          # depositor
            recipient,          # recipient
            token_addr,         # inputToken
            output_token,       # outputToken
            amount,             # inputAmount
            0,                  # outputAmount (0 = market)
            dest_chain_id,      # destinationChainId
            zero_addr,          # exclusiveRelayer
            quote_timestamp,    # quoteTimestamp
            fill_deadline,      # fillDeadline
            exclusivity_deadline,  # exclusivityDeadline
            message,            # message
        ],
    )

    return {
        "to": spoke_pool,
        "data": "0xe7a7ed02" + params.hex(),
        "chainId": chain_id,
        "value": 0,
    }


def build_debridge_quote_params(
    from_chain: str,
    to_chain: str,
    from_token: str,
    to_token: str,
    amount: int,
    sender: str,
    recipient: str,
) -> dict:
    """Build deBridge /dln/order/create-tx request parameters."""
    debridge = PROTOCOLS["debridge"]
    from_token_addr = TOKENS[from_chain].get(from_token, from_token)
    to_token_addr = TOKENS[to_chain].get(to_token, to_token)

    return {
        "srcChainId": str(debridge["chain_ids"][from_chain]),
        "dstChainId": str(debridge["chain_ids"][to_chain]),
        "srcChainTokenIn": from_token_addr,
        "dstChainTokenOut": to_token_addr,
        "srcChainTokenInAmount": str(amount),
        "dstChainTokenOutAmount": "auto",
        "dstChainTokenOutRecipient": recipient,
        "srcChainOrderAuthorityAddress": sender,
        "dstChainOrderAuthorityAddress": recipient,
    }
