"""Private Agent Client — sends requests through onion relays or directly."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from agent.crypto import decrypt_layer
from agent.db import init_db, log_request
from agent.router import build_circuit_onion, load_relay_config
from agent.x402 import parse_payment_required, sign_payment


class PrivateAgentClient:
    def __init__(self, private: bool = True, wallet_key: str | None = None):
        self.private = private
        self.wallet_key = wallet_key or os.environ.get("AGENT_WALLET_KEY", "")
        self._initialized = False

    async def _ensure_init(self):
        if not self._initialized:
            await init_db()
            self._initialized = True

    async def get(self, url: str, headers: dict | None = None) -> dict:
        return await self.request("GET", url, headers=headers)

    async def post(self, url: str, body: dict | None = None, headers: dict | None = None) -> dict:
        return await self.request("POST", url, headers=headers, body=body)

    async def request(
        self,
        method: str,
        url: str,
        headers: dict | None = None,
        body: dict | None = None,
    ) -> dict:
        await self._ensure_init()

        if self.private:
            return await self._request_private(method, url, headers, body)
        else:
            return await self._request_direct(method, url, headers, body)

    async def _request_private(
        self, method: str, url: str, headers: dict | None, body: dict | None
    ) -> dict:
        onion_blob, response_keys, circuit_urls = build_circuit_onion(
            method, url, headers, body
        )

        entry_url = circuit_urls[0]
        forward_json = {"payload": onion_blob.hex()}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{entry_url}/forward", json=forward_json)

            # x402 payment flow: if relay demands payment, sign and retry
            if resp.status_code == 402 and self.wallet_key:
                payment_req_header = resp.headers.get("x-payment-required", "")
                if payment_req_header:
                    requirement = parse_payment_required(payment_req_header)
                    payment_token = sign_payment(requirement, self.wallet_key)
                    resp = await client.post(
                        f"{entry_url}/forward",
                        json=forward_json,
                        headers={"X-PAYMENT": payment_token},
                    )

        resp_data = resp.json()

        if "error" in resp_data:
            await log_request(method, url, True, status_code=resp.status_code, circuit=circuit_urls,
                              response_summary=resp_data["error"])
            return {"error": resp_data["error"]}

        # Decrypt response through the circuit (reverse order)
        response_blob = bytes.fromhex(resp_data["response"])
        for key in response_keys:
            response_blob = decrypt_layer(key, response_blob)

        result = json.loads(response_blob)
        status_code = result.get("status", 200)
        result_body = result.get("body", "")

        # Parse the body if it's JSON
        try:
            parsed_body = json.loads(result_body)
        except (json.JSONDecodeError, TypeError):
            parsed_body = result_body

        await log_request(
            method, url, True,
            status_code=status_code,
            circuit=circuit_urls,
            response_summary=str(parsed_body)[:200],
        )
        return parsed_body

    async def _request_direct(
        self, method: str, url: str, headers: dict | None, body: dict | None
    ) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=headers, json=body)

        try:
            parsed = resp.json()
        except Exception:
            parsed = resp.text

        await log_request(
            method, url, False,
            status_code=resp.status_code,
            response_summary=str(parsed)[:200],
        )
        return parsed


# Audit API server (runs on port 8003)
def create_audit_app():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    audit_app = FastAPI()
    audit_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    )

    @audit_app.on_event("startup")
    async def _init():
        await init_db()

    @audit_app.get("/audit")
    async def audit():
        from agent.db import get_logs
        return await get_logs()

    return audit_app


audit_app = create_audit_app()
