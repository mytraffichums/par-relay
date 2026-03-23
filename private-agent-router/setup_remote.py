#!/usr/bin/env python3
"""Configure config.json to use remote Railway relays.

Usage:
    python3 setup_remote.py <relay-a-url> <relay-b-url>

Example:
    python3 setup_remote.py https://par-relay-a.up.railway.app https://par-relay-b.up.railway.app

This updates config.json and fetches each relay's public key.
"""

import json
import sys
from pathlib import Path

import httpx

CONFIG = Path(__file__).resolve().parent / "config.json"


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    relay_a_url = sys.argv[1].rstrip("/")
    relay_b_url = sys.argv[2].rstrip("/")

    cfg = json.loads(CONFIG.read_text())

    for relay, url in [("relay_a", relay_a_url), ("relay_b", relay_b_url)]:
        print(f"Fetching pubkey from {url}/pubkey ...")
        resp = httpx.get(f"{url}/pubkey", timeout=10)
        resp.raise_for_status()
        pubkey = resp.json()["public_key"]
        name = resp.json()["name"]

        for r in cfg["relays"]:
            if r["name"] == relay:
                r["url"] = url
                r["public_key"] = pubkey
                print(f"  {relay}: url={url}  pubkey={pubkey[:16]}...")

    CONFIG.write_text(json.dumps(cfg, indent=2))
    print(f"\nconfig.json updated. Relays are remote.")
    print(f"Run './run_all.sh' — it will skip starting local relays if they're remote.")


if __name__ == "__main__":
    main()
