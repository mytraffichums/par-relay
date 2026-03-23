#!/usr/bin/env python3
"""Demo scenario: agent makes API calls through onion relays, then directly."""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.client import PrivateAgentClient

SERVICE = "http://127.0.0.1:9000"


async def run_scenario(private: bool):
    mode = "PRIVATE (onion-routed)" if private else "DIRECT (no privacy)"
    print(f"\n{'='*60}")
    print(f"  Running demo — {mode}")
    print(f"{'='*60}\n")

    client = PrivateAgentClient(private=private)

    # Step 1: Check weather
    print("[1/4] Checking weather in Tokyo...")
    resp = await client.get(f"{SERVICE}/weather?city=Tokyo")
    print(f"  -> {resp}\n")

    # Step 2: Search flights
    print("[2/4] Searching flights LHR -> NRT...")
    resp = await client.get(f"{SERVICE}/flights?origin=LHR&destination=NRT")
    print(f"  -> Found {len(resp.get('flights', []))} flights\n")

    # Step 3: Book a flight
    print("[3/4] Booking flight PA303...")
    resp = await client.post(f"{SERVICE}/book", body={"flight": "PA303", "passenger": "AgentSmith"})
    print(f"  -> Confirmation: {resp.get('confirmation', 'N/A')}\n")

    # Step 4: Check weather again (different city)
    print("[4/4] Checking weather in Berlin...")
    resp = await client.get(f"{SERVICE}/weather?city=Berlin")
    print(f"  -> {resp}\n")

    print(f"[done] All 4 calls completed in {mode} mode.")


async def main():
    # Parse args
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"

    if mode in ("private", "both"):
        await run_scenario(private=True)

    if mode in ("direct", "both"):
        await run_scenario(private=False)

    if mode == "both":
        print("\n" + "=" * 60)
        print("  COMPARE: Check localhost:9000/logs")
        print("  - Private calls show relay IP as client")
        print("  - Direct calls show agent's actual IP")
        print("  Open localhost:3000 for the dashboard view")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
