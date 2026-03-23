"""Onion encryption library using NaCl public-key boxes."""

from __future__ import annotations

import json
from typing import Any

import nacl.public
import nacl.utils


def generate_keypair() -> tuple[bytes, bytes]:
    """Return (public_key, private_key) as raw 32-byte values."""
    sk = nacl.public.PrivateKey.generate()
    return bytes(sk.public_key), bytes(sk)


def encrypt_layer(recipient_pub: bytes, plaintext: bytes) -> bytes:
    """Encrypt plaintext for *recipient_pub* using an ephemeral sender key.

    Returns: ephemeral_pub (32) || nonce (24) || ciphertext
    """
    recipient_key = nacl.public.PublicKey(recipient_pub)
    ephemeral_sk = nacl.public.PrivateKey.generate()
    box = nacl.public.Box(ephemeral_sk, recipient_key)
    nonce = nacl.utils.random(nacl.public.Box.NONCE_SIZE)
    ct = box.encrypt(plaintext, nonce)
    # ct already contains nonce prefix — but we store explicitly for clarity
    return bytes(ephemeral_sk.public_key) + nonce + ct.ciphertext


def decrypt_layer(my_private: bytes, blob: bytes) -> bytes:
    """Decrypt a blob produced by encrypt_layer."""
    ephemeral_pub = nacl.public.PublicKey(blob[:32])
    nonce = blob[32:56]
    ciphertext = blob[56:]
    sk = nacl.public.PrivateKey(my_private)
    box = nacl.public.Box(sk, ephemeral_pub)
    return box.decrypt(ciphertext, nonce)


def build_onion(layers: list[dict[str, Any]], relay_pubkeys: list[bytes]) -> bytes:
    """Build a nested onion blob.

    *layers* is a list of dicts from innermost to outermost, each containing
    routing instructions.  *relay_pubkeys* is the corresponding list of relay
    public keys (same order: innermost first).

    The result is encrypted for relay_pubkeys[-1] (the entry relay).
    """
    assert len(layers) == len(relay_pubkeys)

    # Start with the innermost layer
    payload = json.dumps(layers[0]).encode()
    payload = encrypt_layer(relay_pubkeys[0], payload)

    # Wrap each subsequent layer
    for i in range(1, len(layers)):
        wrapper = dict(layers[i])
        wrapper["payload"] = payload.hex()
        payload = encrypt_layer(relay_pubkeys[i], json.dumps(wrapper).encode())

    return payload


def unwrap_response(relay_privkeys: list[bytes], blob: bytes) -> bytes:
    """Unwrap a response that was encrypted through the circuit in reverse.

    *relay_privkeys* are the ephemeral response keys the agent generated,
    ordered entry-relay-first.
    """
    data = blob
    for sk in relay_privkeys:
        data = decrypt_layer(sk, data)
    return data
