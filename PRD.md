# PRD: Private Agent Router (PAR)

**Hackathon Project — March 2026**

---

## One-liner

An onion-routed privacy layer for AI agent API calls, with on-chain spending policies and blind payment tokens — so your agent can act on your behalf without leaking your identity to every service it touches.

---

## Problem

Every time an AI agent calls an API, the destination service learns who is calling, what they're asking, and how often. Over time, services build detailed behavioral profiles of users through their agents' metadata — spending patterns, preferences, contacts, timing. The agent isn't leaking its own data. It's leaking yours.

There is no existing product that provides network-level anonymity specifically for agent-to-service API calls with built-in financial controls.

---

## Solution

A relay network that sits between your agent and the services it calls. Requests are onion-encrypted through 2 relay hops so no single party sees both "who sent this" and "what it says." Payments happen via anonymous blind tokens minted on-chain. Spending is enforced by smart contract policies that the agent physically cannot exceed.

---

## Hackathon Scope

### What we WILL build

1. **Onion-routed relay network** (2 hops)
2. **Blind payment tokens** (on-chain mint/redeem)
3. **Spending policy smart contracts**
4. **Agent SDK wrapper** (drop-in Python client)
5. **Split-view demo dashboard**
6. **Mock destination service** (logs everything it sees)

### What we will NOT build

- Production mixnet (we run our own relays)
- Traffic padding / timing obfuscation
- Relay discovery or gossip protocol
- Real token economics
- Mobile or production UI

---

## Architecture

```
┌──────────────────┐
│    YOUR AGENT     │
│  (any LLM agent)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   PAR SDK         │    Wraps outgoing HTTP calls
│                   │    Builds onion layers
│   - circuit pick  │    Logs locally for your dashboard
│   - onion wrap    │    Attaches blind token for payment
│   - local audit   │
└────────┬─────────┘
         │ encrypted blob + blind token
         ▼
┌──────────────────┐
│   RELAY A         │    Peels layer 1
│   (entry node)    │    Knows: your IP, next hop
│                   │    Cannot see: request, destination
│   staked on-chain │
└────────┬─────────┘
         │ re-encrypted blob
         ▼
┌──────────────────┐
│   RELAY B         │    Peels layer 2
│   (exit node)     │    Knows: request, destination
│                   │    Cannot see: who sent it
│                   │    Redeems blind token for payment
│   staked on-chain │
└────────┬─────────┘
         │ raw API call + blind token
         ▼
┌──────────────────┐    ┌──────────────────────────┐
│   DESTINATION     │    │  SERVICE SEES:            │
│   SERVICE         │───▶│  IP: relay B's IP         │
│   (weather, etc)  │    │  auth: anonymous token    │
│                   │    │  user identity: nothing   │
└────────┬─────────┘    └──────────────────────────┘
         │
         │ response travels back: Service → B → A → SDK → Agent
         ▼

─────────────────────────────────────────────────────────
                   BLOCKCHAIN LAYER (local testnet)

┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
│ SpendingPolicy  │  │ BlindTokenVault │  │ AuditLog     │
│                 │  │                 │  │              │
│ - max_per_tx    │  │ - mint(amount)  │  │ - logHop(    │
│ - max_per_day   │  │ - redeem(token) │  │     hash,    │
│ - allowed_svcs  │  │ - verify(token) │  │     timestamp│
│ - agent_address │  │                 │  │   )          │
│ - owner         │  │ blind signature │  │              │
└─────────────────┘  │ scheme          │  └──────────────┘
                     └─────────────────┘
```

---

## Components — What to Build

### 1. Smart Contracts (Solidity + Foundry)

**Location:** `contracts/`

#### SpendingPolicy.sol
- Owner deploys with: `maxPerTx`, `maxPerDay`, `allowedServices[]`, `agentAddress`
- Agent calls `requestSpend(service, amount)` → reverts if policy violated
- Tracks cumulative daily spend via block timestamps
- Owner can update policy at any time; agent cannot

#### BlindTokenVault.sol
- Owner calls `mintTokens(amount)` → deposits ETH/stablecoin, receives N blind tokens
- Tokens are ERC-20s with blinded serial numbers (simplified blind signature for hackathon)
- Exit node calls `redeemToken(token)` → vault verifies validity, marks spent, pays exit node
- Token cannot be linked back to the minter (simplified: hash-based commitment scheme)

#### AuditLog.sol
- Each relay hop calls `logHop(payloadHash, timestamp)`
- Creates a verifiable breadcrumb trail without revealing content
- Owner can query: "show me all hops for this circuit ID"

### 2. Relay Nodes (Python + FastAPI)

**Location:** `relay/`

#### relay/server.py
- Single generic server, run as multiple instances (port 8001 = Relay A, port 8002 = Relay B)
- `POST /forward` endpoint:
  1. Receives `{encrypted_blob, hop_id}`
  2. Decrypts its layer using its private key (PyNaCl `crypto_box`)
  3. Reads `next_hop` from decrypted JSON
  4. If `next_hop` is a relay: forwards remaining blob
  5. If `next_hop` is `"EXIT"`: makes the actual HTTP request to the destination
  6. Encrypts the response back and returns it
- On startup: generates keypair, registers public key in a shared config
- Logs only: `hop_id`, `timestamp`, `payload_hash` (no content, no origin)

### 3. Agent SDK (Python)

**Location:** `agent/`

#### agent/client.py — `PrivateAgentClient`
- Drop-in replacement for `httpx.AsyncClient`
- `client.get(url)`, `client.post(url, json=...)` work identically
- Under the hood:
  1. Loads relay public keys from config
  2. Picks circuit: always [Relay A, Relay B] for hackathon
  3. Checks spending policy contract: `can_spend(service, estimated_cost)?`
  4. Withdraws a blind token from `BlindTokenVault`
  5. Builds onion:
     - Inner layer (for B): `encrypt(B_pub, {destination, method, headers, body, blind_token})`
     - Outer layer (for A): `encrypt(A_pub, {next_hop: relay_b_url, payload: inner_blob})`
  6. Sends to Relay A
  7. Unwraps layered response
  8. Logs full details to local SQLite for dashboard
  9. Returns plain response to the agent

#### agent/router.py — Circuit logic
- For hackathon: fixed 2-hop circuit
- Holds relay registry (URLs + public keys)
- Handles onion construction and response unwrapping

### 4. Mock Destination Service (Python + FastAPI)

**Location:** `demo_service/`

#### demo_service/server.py
- Simple API with 2-3 endpoints:
  - `GET /weather?city=NYC` → returns mock weather
  - `GET /flights?from=NYC&to=LAX` → returns mock flights
  - `POST /book` → returns mock booking confirmation
- Logs EVERYTHING it can see about each request to a JSON file:
  - Source IP, all headers, auth tokens, timestamps, payload
- Exposes `GET /logs` → returns all logged requests (feeds dashboard right panel)

### 5. Dashboard (HTML + JS)

**Location:** `dashboard/`

#### dashboard/index.html — Single-page split view
- **Left panel: "Your View"**
  - Reads from agent's local SQLite via a small API
  - Shows: every request, destination, timing, cost, response status
  - Full audit trail with totals
- **Right panel: "Service's View"**
  - Reads from `demo_service/logs` endpoint
  - Shows: what the destination service logged
  - Random IPs, anonymous tokens, no user identity
- **Toggle button: "Disable Privacy"**
  - Re-runs the same requests without the relay network
  - Right panel now shows your real IP, real auth, linkable pattern
  - The contrast is the demo moment

### 6. Demo Agent (Python)

**Location:** `demo/`

#### demo/run_demo.py
- A simple scripted agent (or Claude-powered if time permits) that:
  1. Checks weather in NYC
  2. Searches flights to LAX
  3. Books a flight
  4. Makes payment
- Runs through the PAR SDK
- Drives the dashboard in real-time

---

## Tech Stack

| Component | Technology | Reason |
|---|---|---|
| Smart contracts | Solidity + Foundry | Fast compile/test/deploy cycle |
| Local blockchain | Anvil (Foundry) | Zero config local testnet |
| Contract interaction | Python + web3.py | Same language as rest of stack |
| Relay nodes | Python + FastAPI + uvicorn | Async, minimal boilerplate |
| Crypto | PyNaCl (libsodium) | Battle-tested, simple API |
| Agent SDK | Python + httpx | Async HTTP, drop-in compatible |
| Local storage | SQLite | Zero config, single file |
| Dashboard | Vanilla HTML/CSS/JS | No build step, fast iteration |
| Orchestration | Docker Compose | One command to run everything |
| Demo agent | Python | Simple script |

---

## File Structure

```
private-agent-router/
├── docker-compose.yml
├── .env.example
│
├── contracts/
│   ├── foundry.toml
│   ├── src/
│   │   ├── SpendingPolicy.sol
│   │   ├── BlindTokenVault.sol
│   │   └── AuditLog.sol
│   ├── test/
│   │   ├── SpendingPolicy.t.sol
│   │   ├── BlindTokenVault.t.sol
│   │   └── AuditLog.t.sol
│   └── script/
│       └── Deploy.s.sol
│
├── relay/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py
│   └── config.py
│
├── agent/
│   ├── requirements.txt
│   ├── client.py
│   ├── router.py
│   ├── crypto.py
│   └── db.py
│
├── demo_service/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── server.py
│
├── dashboard/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── demo/
    └── run_demo.py
```

---

## Data Flow — Step by Step

### Sending a request

```
1.  Agent calls:        client.get("https://weather.api/nyc")
2.  SDK checks:         SpendingPolicy.canSpend("weather.api", $0.01) → true
3.  SDK gets token:     BlindTokenVault.withdrawToken() → blind_token_xyz
4.  SDK builds onion:
      inner = encrypt(B_pub, {dest: "weather.api/nyc", method: GET, token: blind_token_xyz})
      outer = encrypt(A_pub, {next_hop: "relay-b:8002", payload: inner})
5.  SDK → Relay A:      POST relay-a:8001/forward {blob: outer}
6.  Relay A:            decrypt(A_priv, blob) → {next_hop: relay-b, payload: inner}
7.  Relay A logs:       AuditLog.logHop(hash(outer), timestamp)
8.  Relay A → Relay B:  POST relay-b:8002/forward {blob: inner}
9.  Relay B:            decrypt(B_priv, blob) → {dest, method, token}
10. Relay B:            BlindTokenVault.redeemToken(token) → paid
11. Relay B logs:       AuditLog.logHop(hash(inner), timestamp)
12. Relay B → Service:  GET weather.api/nyc (from Relay B's IP)
13. Service responds:   {temp: 72, conditions: "sunny"}
14. Relay B encrypts:   response_b = encrypt(agent_ephemeral, response)
15. Relay B → Relay A:  return response_b
16. Relay A encrypts:   response_a = encrypt(agent_ephemeral, response_b)
17. Relay A → SDK:      return response_a
18. SDK unwraps:        decrypt(decrypt(response_a)) → {temp: 72, conditions: "sunny"}
19. SDK logs to SQLite: {url, status, cost, timestamp, circuit_id}
20. SDK → Agent:        returns normal Response object
```

### What each party learned

```
YOU:          full request, full response, cost, timing, circuit path
RELAY A:      your IP, relay B's address, encrypted blob hash, timestamp
RELAY B:      relay A's address, destination URL, request content, timestamp
SERVICE:      relay B's IP, request content, blind token (anonymous)
ADVERSARY:    nothing linkable across requests
```

---

## Smart Contract Specs

### SpendingPolicy.sol

```
State:
  owner:            address
  agent:            address
  maxPerTx:         uint256
  maxPerDay:        uint256
  dailySpent:       uint256
  lastResetDay:     uint256
  allowedServices:  mapping(bytes32 => bool)

Functions:
  constructor(agent, maxPerTx, maxPerDay)
  addService(serviceHash)
  removeService(serviceHash)
  canSpend(serviceHash, amount) → bool          [view]
  recordSpend(serviceHash, amount)              [only agent]
  updatePolicy(maxPerTx, maxPerDay)             [only owner]
```

### BlindTokenVault.sol

```
State:
  owner:            address
  tokenPrice:       uint256
  commitments:      mapping(bytes32 => bool)    [minted but unspent]
  spent:            mapping(bytes32 => bool)    [redeemed]

Functions:
  constructor(tokenPrice)
  mintTokens(commitments[]) payable             [only owner]
    — owner submits hash commitments, pays ETH
  redeemToken(secret, commitment) → bool        [anyone]
    — verifies hash(secret) == commitment
    — marks spent, transfers tokenPrice to caller
  isValid(commitment) → bool                    [view]
```

### AuditLog.sol

```
State:
  hops: mapping(uint256 => Hop[])               [circuitId => hops]

Struct Hop:
  payloadHash:  bytes32
  relay:        address
  timestamp:    uint256

Functions:
  logHop(circuitId, payloadHash)                [any registered relay]
  getHops(circuitId) → Hop[]                    [view]
```

---

## Demo Script

The live demo runs in ~90 seconds:

1. **"Here's an agent that needs to check weather and book a flight."**
   - Show the agent code — 5 lines, uses `PrivateAgentClient` like normal `httpx`

2. **"Watch what happens when it runs WITHOUT privacy."**
   - Toggle off → agent makes direct calls
   - Dashboard right panel: service sees real IP, real auth, full behavioral pattern
   - "The weather service now knows you're planning a trip to LA."

3. **"Now with Private Agent Router enabled."**
   - Toggle on → same requests through relay network
   - Dashboard right panel: random IPs, blind tokens, no linkable identity
   - Left panel still shows full audit trail

4. **"The agent has a spending policy on-chain."**
   - Show the policy: max $50/tx, $200/day
   - Agent tries to book a $500 flight → transaction reverts
   - "The agent physically cannot overspend. Not a software check — a blockchain constraint."

5. **"Payments are anonymous."**
   - Show BlindTokenVault: tokens pre-purchased, spent anonymously
   - Service got paid, has no idea who paid

---

## Build Order

For a hackathon, build in this order (each step is demo-able):

| Phase | What | Time | Milestone |
|---|---|---|---|
| 1 | Relay nodes + onion crypto | 3-4 hrs | Requests route through 2 hops |
| 2 | Agent SDK wrapper | 2-3 hrs | `client.get()` works transparently |
| 3 | Mock service + logging | 1 hr | Service logs show anonymous requests |
| 4 | Dashboard (split view) | 2-3 hrs | Visual demo works end-to-end |
| 5 | SpendingPolicy contract | 2 hrs | Agent cannot exceed policy |
| 6 | BlindTokenVault contract | 2-3 hrs | Anonymous payments work |
| 7 | AuditLog contract | 1 hr | On-chain hop verification |
| 8 | Demo script + polish | 2 hrs | Smooth 90-second demo |
| | **Total** | **~16-20 hrs** | |

---

## Success Criteria

The project is done when:

- [ ] An agent makes API calls through 2 relay hops with onion encryption
- [ ] The destination service cannot identify or link the requesting user
- [ ] Spending policies on-chain prevent the agent from exceeding limits
- [ ] Payments use blind tokens that cannot be traced to the buyer
- [ ] Dashboard shows the privacy gap: with vs without routing
- [ ] The full stack runs with `docker compose up`
