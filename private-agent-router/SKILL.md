# Private Agent Router (PAR) — Agent Skill

> Privacy-as-a-Service for AI agents on Base. Route your API calls through an onion-encrypted relay network so no single party sees both who you are and what you're asking. Pay per hop with USDC via x402.

**Base URL:** Relays are discovered on-chain via the RelayRegistry contract on Base Sepolia.

---

## Quick Start

To use PAR, your agent needs to:

1. **Discover relays** — read the on-chain RelayRegistry
2. **Build an onion** — encrypt your request in layers, one per relay
3. **Pay per hop** — handle x402 USDC payments at each relay
4. **Send & unwrap** — POST to the entry relay, decrypt the layered response

No SDK installation required. You need: HTTP client, NaCl encryption (libsodium), and an EIP-3009 signer for USDC payments.

---

## 1. Discover Relays

Query the **RelayRegistry** contract on Base Sepolia to find active relays.

**Contract:** `0xa49a8a7e5727b0402e4590cb498b51da03a4d309`
**Chain:** Base Sepolia (chain ID 84532)
**RPC:** `https://sepolia.base.org`

### ABI (relevant functions)

```json
[
  {
    "name": "getActiveRelays",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "components": [
          { "name": "operator", "type": "address" },
          { "name": "url", "type": "string" },
          { "name": "pubkey", "type": "bytes32" },
          { "name": "pricePerHop", "type": "uint256" },
          { "name": "active", "type": "bool" }
        ]
      }
    ]
  },
  {
    "name": "relayCount",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }]
  }
]
```

Each relay entry gives you:
- `url` — the relay's HTTP endpoint (e.g., `https://par-relay-production.up.railway.app`)
- `pubkey` — NaCl public key (bytes32) for encryption
- `pricePerHop` — cost in USDC base units (6 decimals). `10000` = 0.01 USDC.

Alternatively, fetch a relay's current public key via HTTP:

```
GET {relay_url}/pubkey
→ { "public_key": "<hex>", "name": "relay_a" }
```

---

## 2. Build the Onion

PAR uses **NaCl authenticated encryption** (Curve25519-XSalsa20-Poly1305) with ephemeral keys per layer. A 2-hop circuit looks like:

```
Agent → Relay B (entry) → Relay A (exit) → Destination Service
```

### Layer Format

Each decrypted layer is a JSON object. There are two types:

**Intermediate layer** (for entry/middle relays):
```json
{
  "next_hop": "https://par-relay-production.up.railway.app",
  "payload": "<hex-encoded inner blob>",
  "response_pubkey": "<hex NaCl pubkey for encrypting response back>"
}
```

**Exit layer** (for the final relay):
```json
{
  "exit": true,
  "method": "GET",
  "url": "http://api.example.com/weather?city=Tokyo",
  "headers": {},
  "body": null,
  "response_pubkey": "<hex NaCl pubkey>"
}
```

### Encryption Algorithm

For each layer (innermost first):

1. Generate an **ephemeral NaCl keypair** (`eph_sk`, `eph_pk`)
2. Create a NaCl Box with `eph_sk` + relay's public key
3. Generate a random 24-byte nonce
4. Encrypt the JSON payload
5. Output: `eph_pk (32 bytes) || nonce (24 bytes) || ciphertext`

The result is a binary blob. Hex-encode it for JSON transport.

### Response Decryption

For each layer, generate a **response keypair**. Include the public key as `response_pubkey` in that layer. The relay encrypts its response back to this key.

Unwrap responses in **reverse circuit order**: decrypt with each response private key, innermost last.

### Pseudocode

```python
import nacl.public, nacl.utils, json

def encrypt_layer(relay_pubkey_bytes, plaintext_bytes):
    eph_sk = nacl.public.PrivateKey.generate()
    box = nacl.public.Box(eph_sk, nacl.public.PublicKey(relay_pubkey_bytes))
    nonce = nacl.utils.random(24)
    ct = box.encrypt(plaintext_bytes, nonce)
    return bytes(eph_sk.public_key) + nonce + ct.ciphertext

def decrypt_layer(my_private_bytes, blob):
    eph_pub = nacl.public.PublicKey(blob[:32])
    nonce = blob[32:56]
    ct = blob[56:]
    box = nacl.public.Box(nacl.public.PrivateKey(my_private_bytes), eph_pub)
    return box.decrypt(ct, nonce)

# Build 2-hop onion:
resp_key_a = nacl.public.PrivateKey.generate()  # for exit relay response
resp_key_b = nacl.public.PrivateKey.generate()  # for entry relay response

# Exit layer (Relay A decrypts this, makes the HTTP call)
exit_layer = json.dumps({
    "exit": True,
    "method": "GET",
    "url": "http://api.example.com/weather?city=Tokyo",
    "headers": {},
    "body": None,
    "response_pubkey": bytes(resp_key_a.public_key).hex(),
}).encode()
inner_blob = encrypt_layer(relay_a_pubkey, exit_layer)

# Entry layer (Relay B decrypts this, forwards to Relay A)
entry_layer = json.dumps({
    "next_hop": relay_a_url,
    "payload": inner_blob.hex(),
    "response_pubkey": bytes(resp_key_b.public_key).hex(),
}).encode()
onion = encrypt_layer(relay_b_pubkey, entry_layer)
```

---

## 3. Pay Per Hop (x402)

Each relay requires **USDC payment on Base Sepolia** via the x402 protocol.

**USDC contract:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
**Chain:** Base Sepolia (84532)
**Facilitator:** `https://x402.org/facilitator`

### Payment Flow

1. **POST** to `{relay_url}/forward` with your onion payload (no payment header)
2. Relay responds **HTTP 402** with `X-PAYMENT-REQUIRED` header (base64-encoded JSON):
   ```json
   {
     "x402Version": 1,
     "scheme": "exact",
     "network": "eip155:84532",
     "maxAmountRequired": "10000",
     "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
     "payTo": "0x...",
     "resource": "/forward",
     "nonce": "..."
   }
   ```
3. Sign a **USDC `transferWithAuthorization`** (EIP-3009) for the required amount
4. **Retry** the same POST with `X-PAYMENT: <base64 signed payload>` header
5. Relay verifies payment via the facilitator and processes your request

### EIP-3009 Signing (TransferWithAuthorization)

Sign EIP-712 typed data against the USDC contract:

```
Domain:
  name: "USD Coin"
  version: "2"
  chainId: 84532
  verifyingContract: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

Message (TransferWithAuthorization):
  from: <your wallet address>
  to: <relay's payTo address>
  value: <maxAmountRequired as uint256>
  validAfter: <now - 60>
  validBefore: <now + 3600>
  nonce: <bytes32 from requirement>
```

### X-PAYMENT Header Format

Base64-encoded JSON:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:84532",
  "payload": {
    "signature": "<hex EIP-712 signature>",
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "10000",
      "validAfter": "...",
      "validBefore": "...",
      "nonce": "0x..."
    }
  }
}
```

---

## 4. Send & Receive

### Send Request

```
POST {entry_relay_url}/forward
Content-Type: application/json
X-PAYMENT: <base64 payment token>

{ "payload": "<hex-encoded onion blob>" }
```

### Response

```json
{
  "response": "<hex-encoded encrypted response>",
  "exit": true
}
```

### Unwrap Response

Decrypt the `response` field through each layer in reverse order:

```python
response_blob = bytes.fromhex(resp_data["response"])
# Decrypt with entry relay's response key first, then exit relay's
response_blob = decrypt_layer(bytes(resp_key_b), response_blob)
response_blob = decrypt_layer(bytes(resp_key_a), response_blob)
result = json.loads(response_blob)
# result = { "status": 200, "body": "...", "headers": {...} }
```

---

## Relay API Reference

### GET /health

Returns relay status. No payment required.

```json
{ "status": "ok", "relay": "relay_a" }
```

### GET /pubkey

Returns the relay's NaCl public key. No payment required.

```json
{ "public_key": "a1b2c3...", "name": "relay_a" }
```

### POST /forward

Processes an onion-encrypted request. **Requires x402 payment.**

**Request:**
```json
{ "payload": "<hex onion blob>" }
```

**Response (success):**
```json
{ "response": "<hex encrypted response>", "exit": true }
```

**Response (402 — payment required):**
```
HTTP 402
X-PAYMENT-REQUIRED: <base64 payment requirement>
{ "error": "payment required", "x402": true }
```

---

## On-Chain Contracts (Base Sepolia)

| Contract | Address | Purpose |
|---|---|---|
| **RelayRegistry** | `0xa49a8a7e5727b0402e4590cb498b51da03a4d309` | Discover relays (URL, pubkey, price) |
| **SpendingPolicy** | `0x65133639e5d57b2de6703fa701e8cb7565754e6d` | Agent spending limits |
| **BlindTokenVault** | `0x1a78ef103b529c2a6fe8f3db97e1f7692a875092` | Anonymous payment tokens |
| **AuditLog** | `0x78f42b581f590a22ab42d26d35827586597b3dcc` | On-chain hop verification |

---

## What Each Party Sees

```
YOU (agent):      destination, request, response, cost, circuit path
ENTRY RELAY:      your IP, exit relay address, encrypted blob hash
EXIT RELAY:       entry relay address, destination URL, request content
SERVICE:          exit relay's IP, request content — NOT your identity
```

No single relay sees both who you are AND what you're requesting.

---

## Example: Full Private Weather Check

```python
# 1. Discover relays
relays = registry.getActiveRelays()
relay_b = relays[0]  # entry
relay_a = relays[1]  # exit

# 2. Fetch fresh pubkeys
relay_a_pub = bytes.fromhex(httpx.get(f"{relay_a.url}/pubkey").json()["public_key"])
relay_b_pub = bytes.fromhex(httpx.get(f"{relay_b.url}/pubkey").json()["public_key"])

# 3. Build onion (see section 2)
onion = build_two_hop_onion(
    method="GET",
    url="http://api.weather.com/tokyo",
    relay_a_url=relay_a.url, relay_a_pub=relay_a_pub,
    relay_b_url=relay_b.url, relay_b_pub=relay_b_pub,
)

# 4. Send with x402 payment
resp = httpx.post(f"{relay_b.url}/forward", json={"payload": onion.hex()})
if resp.status_code == 402:
    req = parse_x402_header(resp.headers["x-payment-required"])
    payment = sign_usdc_transfer(req, my_wallet_key)
    resp = httpx.post(
        f"{relay_b.url}/forward",
        json={"payload": onion.hex()},
        headers={"X-PAYMENT": payment},
    )

# 5. Unwrap response
result = unwrap_onion_response(resp.json()["response"], response_keys)
print(result)  # {"status": 200, "body": "{\"temp\": 22, ...}"}
```

---

## Requirements

Your agent needs these capabilities:
- **HTTP client** (any language)
- **NaCl/libsodium** for Curve25519-XSalsa20-Poly1305 encryption
- **EIP-712 signer** for USDC transferWithAuthorization (EIP-3009)
- **Base Sepolia USDC** in your wallet for relay payments

Python: `pip install pynacl httpx eth-account`
Node.js: `npm install tweetnacl axios ethers`

---

*PAR — because your agent shouldn't have to choose between utility and privacy.*
