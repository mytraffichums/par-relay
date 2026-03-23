"""Onion relay server — decrypt one layer, forward to next hop or exit.

Deployable standalone (Railway/Fly) or locally. All config via env vars:
  RELAY_NAME            — identifier (default: "relay")
  RELAY_PRIVATE_KEY     — hex-encoded 32-byte NaCl private key (generated if absent)
  PORT                  — listen port (Railway sets this automatically)
  RELAY_WALLET_ADDRESS  — address to receive x402 USDC payments
  RELAY_PRICE_PER_HOP   — price in USDC base units (default: 10000 = 0.01 USDC)
  X402_FACILITATOR_URL  — facilitator endpoint (default: https://x402.org/facilitator)
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from pathlib import Path

import httpx
import nacl.public
import nacl.utils
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Inline NaCl helpers (so relay deploys without the agent package)
# ---------------------------------------------------------------------------

def generate_keypair() -> tuple[bytes, bytes]:
    sk = nacl.public.PrivateKey.generate()
    return bytes(sk.public_key), bytes(sk)


def encrypt_layer(recipient_pub: bytes, plaintext: bytes) -> bytes:
    recipient_key = nacl.public.PublicKey(recipient_pub)
    ephemeral_sk = nacl.public.PrivateKey.generate()
    box = nacl.public.Box(ephemeral_sk, recipient_key)
    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
    ct = box.encrypt(plaintext, nonce)
    return bytes(ephemeral_sk.public_key) + nonce + ct.ciphertext


def decrypt_layer(my_private: bytes, blob: bytes) -> bytes:
    ephemeral_pub = nacl.public.PublicKey(blob[:32])
    nonce = blob[32:56]
    ciphertext = blob[56:]
    sk = nacl.public.PrivateKey(my_private)
    box = nacl.public.Box(sk, ephemeral_pub)
    return box.decrypt(ciphertext, nonce)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["X-PAYMENT-REQUIRED"],
)

PRIVATE_KEY: bytes = b""
PUBLIC_KEY: bytes = b""
RELAY_NAME: str = os.environ.get("RELAY_NAME", "relay")
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"

# x402 payment config
WALLET_ADDRESS: str = os.environ.get("RELAY_WALLET_ADDRESS", "")
PRICE_PER_HOP: str = os.environ.get("RELAY_PRICE_PER_HOP", "10000")  # 0.01 USDC
FACILITATOR_URL: str = os.environ.get("X402_FACILITATOR_URL", "https://x402.org/facilitator")
USDC_BASE_SEPOLIA: str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
BASE_SEPOLIA_CHAIN: str = "eip155:84532"


@app.on_event("startup")
async def startup():
    global PRIVATE_KEY, PUBLIC_KEY
    env_key = os.environ.get("RELAY_PRIVATE_KEY")
    if env_key:
        PRIVATE_KEY = bytes.fromhex(env_key)
        sk = nacl.public.PrivateKey(PRIVATE_KEY)
        PUBLIC_KEY = bytes(sk.public_key)
    else:
        PUBLIC_KEY, PRIVATE_KEY = generate_keypair()

    # In local mode, update config.json so the agent can discover our key.
    # In remote mode (Railway), the agent fetches /pubkey instead.
    if CONFIG_PATH.exists():
        _update_config(RELAY_NAME, PUBLIC_KEY.hex())

    print(f"[{RELAY_NAME}] public_key={PUBLIC_KEY.hex()[:16]}...")


def _update_config(relay_name: str, pubkey_hex: str):
    try:
        cfg = json.loads(CONFIG_PATH.read_text())
        for r in cfg["relays"]:
            if r["name"] == relay_name:
                r["public_key"] = pubkey_hex
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    except Exception as exc:
        print(f"[{relay_name}] config update failed: {exc}")


@app.get("/health")
async def health():
    return {"status": "ok", "relay": RELAY_NAME}


@app.get("/pubkey")
async def get_pubkey():
    return {"public_key": PUBLIC_KEY.hex(), "name": RELAY_NAME}


def _build_payment_required() -> dict:
    """Build the x402 payment requirement payload."""
    return {
        "x402Version": 1,
        "scheme": "exact",
        "network": BASE_SEPOLIA_CHAIN,
        "maxAmountRequired": PRICE_PER_HOP,
        "asset": USDC_BASE_SEPOLIA,
        "payTo": WALLET_ADDRESS,
        "resource": "/forward",
        "description": f"Onion relay hop via {RELAY_NAME}",
        "mimeType": "application/json",
        "maxTimeoutSeconds": 60,
        "nonce": uuid.uuid4().hex,
    }


async def _verify_payment(payment_header: str) -> tuple[bool, str]:
    """Verify x402 payment via the facilitator. Returns (valid, detail)."""
    if not WALLET_ADDRESS:
        return True, "no wallet configured"

    try:
        payment_payload = json.loads(base64.b64decode(payment_header))

        # Build requirement matching what the client signed — use the nonce
        # from the client's payment so the facilitator sees a consistent pair.
        requirement = _build_payment_required()
        client_nonce = payment_payload.get("payload", {}).get("authorization", {}).get("nonce", "")
        if client_nonce:
            requirement["nonce"] = client_nonce

        verify_body = {
            "paymentPayload": payment_payload,
            "paymentRequirements": requirement,
        }
        print(f"[{RELAY_NAME}] x402 verify request: {json.dumps(verify_body, indent=2)[:500]}")

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.post(
                f"{FACILITATOR_URL}/verify",
                json=verify_body,
            )
        resp_body = resp.text
        print(f"[{RELAY_NAME}] x402 verify response: {resp.status_code} {resp_body[:300]}")

        if resp.status_code == 200:
            result = resp.json()
            if result.get("isValid", False):
                return True, "valid"
            return False, result.get("invalidReason", "unknown")
        return False, f"facilitator returned {resp.status_code}: {resp_body[:200]}"
    except Exception as exc:
        import traceback
        print(f"[{RELAY_NAME}] x402 verify failed: {exc}")
        traceback.print_exc()
        return False, str(exc)


@app.post("/forward")
async def forward(request: Request):
    # x402 payment gate
    if WALLET_ADDRESS:
        payment_header = request.headers.get("x-payment")
        if not payment_header:
            req = _build_payment_required()
            encoded = base64.b64encode(json.dumps(req).encode()).decode()
            return JSONResponse(
                {"error": "payment required", "x402": True},
                status_code=402,
                headers={"X-PAYMENT-REQUIRED": encoded},
            )

        verified, verify_detail = await _verify_payment(payment_header)
        if not verified:
            return JSONResponse(
                {"error": f"payment verification failed: {verify_detail}"},
                status_code=402,
            )

    body = await request.json()
    blob = bytes.fromhex(body["payload"])

    try:
        plaintext = decrypt_layer(PRIVATE_KEY, blob)
        layer = json.loads(plaintext)
    except Exception as exc:
        return JSONResponse({"error": f"decrypt failed: {exc}"}, status_code=400)

    response_pubkey = layer.get("response_pubkey")

    if layer.get("exit"):
        return await _handle_exit(layer, response_pubkey)

    # Forward to next relay
    next_hop = layer.get("next_hop")
    inner_payload = layer.get("payload", "")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{next_hop}/forward",
                json={"payload": inner_payload},
            )
        resp_data = resp.json()

        if response_pubkey and "response" in resp_data:
            response_blob = bytes.fromhex(resp_data["response"])
            encrypted_back = encrypt_layer(bytes.fromhex(response_pubkey), response_blob)
            resp_data["response"] = encrypted_back.hex()

        return JSONResponse(resp_data)
    except Exception as exc:
        return JSONResponse({"error": f"forward failed: {exc}"}, status_code=502)


async def _handle_exit(layer: dict, response_pubkey: str | None) -> JSONResponse:
    method = layer.get("method", "GET").upper()
    url = layer["url"]
    headers = layer.get("headers", {})
    req_body = layer.get("body")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(
                method, url, headers=headers, json=req_body if req_body else None
            )

        result = {
            "status": resp.status_code,
            "body": resp.text,
            "headers": dict(resp.headers),
        }
        result_bytes = json.dumps(result).encode()

        if response_pubkey:
            encrypted = encrypt_layer(bytes.fromhex(response_pubkey), result_bytes)
            return JSONResponse({"response": encrypted.hex(), "exit": True})

        return JSONResponse({"response": result_bytes.hex(), "exit": True})
    except Exception as exc:
        return JSONResponse({"error": f"exit request failed: {exc}"}, status_code=502)
