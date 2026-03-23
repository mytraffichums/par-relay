"""x402 payment handling for PAR agent SDK.

Signs USDC transferWithAuthorization (EIP-3009) for relay hop payments
on Base Sepolia.
"""

from __future__ import annotations

import base64
import json
import time
import os

from eth_account import Account
from eth_account.messages import encode_typed_data

# Base Sepolia USDC (Circle testnet)
USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
CHAIN_ID = 84532


def parse_payment_required(header_value: str) -> dict:
    """Decode the base64 X-PAYMENT-REQUIRED header."""
    return json.loads(base64.b64decode(header_value))


def sign_payment(requirement: dict, private_key: str) -> str:
    """Sign a USDC transferWithAuthorization (EIP-3009) and return
    a base64-encoded X-PAYMENT header value.

    Args:
        requirement: decoded payment requirement from relay
        private_key: hex private key (no 0x prefix ok)
    """
    if not private_key.startswith("0x"):
        private_key = "0x" + private_key

    account = Account.from_key(private_key)
    pay_to = requirement["payTo"]
    amount = int(requirement["maxAmountRequired"])
    nonce_hex = requirement.get("nonce", os.urandom(32).hex())

    # Ensure nonce is bytes32
    if len(nonce_hex) < 64:
        nonce_hex = nonce_hex.ljust(64, "0")
    nonce_bytes32 = "0x" + nonce_hex[:64]

    now = int(time.time())
    valid_after = now - 60       # 1 minute ago
    valid_before = now + 3600    # 1 hour from now

    # EIP-712 typed data for transferWithAuthorization (EIP-3009)
    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"},
            ],
        },
        "primaryType": "TransferWithAuthorization",
        "domain": {
            "name": "USD Coin",
            "version": "2",
            "chainId": CHAIN_ID,
            "verifyingContract": USDC_ADDRESS,
        },
        "message": {
            "from": account.address,
            "to": pay_to,
            "value": amount,
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": nonce_bytes32,
        },
    }

    signed = account.sign_typed_data(
        typed_data["domain"],
        {"TransferWithAuthorization": typed_data["types"]["TransferWithAuthorization"]},
        typed_data["message"],
    )

    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "eip155:84532",
        "payload": {
            "signature": signed.signature.hex(),
            "authorization": {
                "from": account.address,
                "to": pay_to,
                "value": str(amount),
                "validAfter": str(valid_after),
                "validBefore": str(valid_before),
                "nonce": nonce_bytes32,
            },
        },
    }

    return base64.b64encode(json.dumps(payload).encode()).decode()
