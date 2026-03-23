"""Circuit selection and onion construction for agent requests."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from agent.crypto import encrypt_layer, generate_keypair

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


def load_relay_config() -> list[dict]:
    cfg = json.loads(CONFIG_PATH.read_text())
    return cfg["relays"]


def _fetch_pubkey(relay_url: str) -> str:
    """Fetch a relay's public key from its /pubkey endpoint."""
    resp = httpx.get(f"{relay_url}/pubkey", timeout=10)
    resp.raise_for_status()
    return resp.json()["public_key"]


def _ensure_pubkeys(relays: list[dict]) -> list[dict]:
    """Populate any missing public keys by hitting each relay's /pubkey endpoint."""
    updated = False
    for r in relays:
        if not r.get("public_key"):
            print(f"[router] Fetching pubkey from {r['url']}...")
            r["public_key"] = _fetch_pubkey(r["url"])
            updated = True
    if updated:
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            cfg["relays"] = relays
            CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
        except Exception:
            pass  # remote-only mode, no local config to update
    return relays


def build_circuit_onion(
    method: str,
    url: str,
    headers: dict | None = None,
    body: dict | None = None,
) -> tuple[bytes, list[bytes], list[str]]:
    """Build onion-routed request through all relays.

    Returns (onion_blob, response_decrypt_keys, circuit_urls).

    The circuit is: agent → relay_b (entry) → relay_a (exit) → destination.
    relay_b is the entry (outermost layer), relay_a is the exit.
    """
    relays = load_relay_config()
    assert len(relays) >= 2, "Need at least 2 relays in config"
    relays = _ensure_pubkeys(relays)

    # Circuit: entry=relays[1], exit=relays[0]
    exit_relay = relays[0]
    entry_relay = relays[1]

    circuit_urls = [entry_relay["url"], exit_relay["url"]]

    # Generate ephemeral keypairs for response encryption at each hop
    entry_resp_pub, entry_resp_priv = generate_keypair()
    exit_resp_pub, exit_resp_priv = generate_keypair()

    # Innermost layer (exit relay sees this) — the actual request
    exit_layer = {
        "exit": True,
        "method": method,
        "url": url,
        "headers": headers or {},
        "body": body,
        "response_pubkey": exit_resp_pub.hex(),
    }
    exit_layer_bytes = json.dumps(exit_layer).encode()
    exit_blob = encrypt_layer(bytes.fromhex(exit_relay["public_key"]), exit_layer_bytes)

    # Entry layer — forward to exit relay
    entry_layer = {
        "next_hop": exit_relay["url"],
        "payload": exit_blob.hex(),
        "response_pubkey": entry_resp_pub.hex(),
    }
    entry_layer_bytes = json.dumps(entry_layer).encode()
    entry_blob = encrypt_layer(bytes.fromhex(entry_relay["public_key"]), entry_layer_bytes)

    # Response keys: entry first (outermost response layer), then exit
    response_keys = [entry_resp_priv, exit_resp_priv]

    return entry_blob, response_keys, circuit_urls
