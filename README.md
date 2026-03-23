# Private Agent Router (PAR)

Privacy-as-a-Service for AI agents on Base Sepolia.

PAR is an onion-encrypted relay network that lets any AI agent route API calls through a 2-hop circuit so no single party sees both who the agent is and what it is requesting. Each relay hop is paid with USDC via the x402 protocol on Base Sepolia.

**Live:** [par-front.vercel.app](https://par-front.vercel.app)

---

## How it works

```
Agent --> Relay B (entry) --> Relay A (exit) --> Destination
```

1. Agent encrypts request in two NaCl layers (one per relay)
2. Entry relay decrypts its layer, sees only the next hop
3. Exit relay decrypts its layer, makes the actual HTTP call
4. Response is encrypted back through the circuit
5. Each hop is paid in USDC via x402 (EIP-3009 transferWithAuthorization)

No single relay sees both the sender and the destination.

## What each party sees

| Party | Knows | Doesn't know |
|---|---|---|
| You (agent) | Everything | - |
| Entry relay | Your IP, encrypted blob | Destination, request content |
| Exit relay | Entry relay IP, destination | Your IP |
| Service | Exit relay IP, request | Your identity |

## Architecture

- **Relay servers** - Python/FastAPI, deployed on Railway. NaCl decryption, x402 payment gate, request forwarding.
- **Smart contracts** - Solidity on Base Sepolia. RelayRegistry (discovery), SpendingPolicy (limits), BlindTokenVault (anonymous tokens), AuditLog (hop verification).
- **Frontend** - Next.js/Scaffold-ETH 2 on Vercel. Live "Try It" page where you can send a real private request through the network.
- **SKILL.md** - Agent-readable interface. Any AI agent can use PAR without an SDK.

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| RelayRegistry | `0xa49a8a7e5727b0402e4590cb498b51da03a4d309` |
| SpendingPolicy | `0x65133639e5d57b2de6703fa701e8cb7565754e6d` |
| BlindTokenVault | `0x1a78ef103b529c2a6fe8f3db97e1f7692a875092` |
| AuditLog | `0x78f42b581f590a22ab42d26d35827586597b3dcc` |

- **RelayRegistry** - Permissionless relay discovery. Operators register their relay URL, NaCl public key, and price per hop. Agents query this to build circuits without trusting a central directory.
- **SpendingPolicy** - On-chain spending limits for agents. Owners set max-per-transaction, max-per-day, and allowed service lists. The agent's wallet cannot exceed these limits, giving principals control over autonomous spending.
- **BlindTokenVault** - Anonymous payment tokens via hash commitments. An owner mints tokens by depositing USDC against a hash. Anyone with the preimage can redeem. The service gets paid but cannot link the payment to a specific agent.
- **AuditLog** - On-chain hop verification. Relays log payload hashes per circuit, creating a verifiable trail that proves routing happened without revealing the request content.

## Stack

- Python 3.12, FastAPI, PyNaCl, httpx
- Solidity, Foundry, Base Sepolia
- Next.js, Scaffold-ETH 2, wagmi, viem, tweetnacl
- x402 protocol (EIP-3009 USDC payments)
- Railway (relays), Vercel (frontend)

## For agents

See [SKILL.md](private-agent-router/SKILL.md) for the full agent-readable interface. No SDK needed - just an HTTP client, NaCl encryption, and an EIP-3009 signer.

Built for [The Synthesis](https://synthesis.md/).
