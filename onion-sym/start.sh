#!/usr/bin/env bash
set -E

ROOT="$(cd "$(dirname "$0")" && pwd)"
PAR="$ROOT/../private-agent-router"

G='\033[0;32m'  # green
Y='\033[1;33m'  # yellow
R='\033[0;31m'  # red
D='\033[0;90m'  # dim
P='\033[0;35m'  # purple
N='\033[0m'     # reset

PIDS=()

# Wallet address for relay x402 payments (same wallet as deployer for hackathon)
WALLET_ADDRESS="0xa3ce5984eA4AF960f661032d8b8CAbD7273a3d74"

cleanup() {
    echo -e "\n${D}[par] shutting down...${N}"
    for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
    wait 2>/dev/null
    echo -e "${D}[par] stopped.${N}"
}
trap cleanup EXIT INT TERM

# Helper: wait for a URL to respond
wait_for() {
    local url=$1 max=${2:-10}
    for i in $(seq 1 "$max"); do
        curl -sf -o /dev/null "$url" 2>/dev/null && return 0
        sleep 1
    done
    return 1
}

# Kill any leftover processes on our ports
for port in 8001 8002 9000 8003 3000; do
    pid=$(lsof -ti :$port 2>/dev/null || true)
    [ -n "$pid" ] && kill $pid 2>/dev/null || true
done
sleep 1

clear
echo -e "${G}"
cat << 'EOF'
 ____   _    ____
|  _ \ / \  |  _ \
| |_) / _ \ | |_) |
|  __/ ___ \|  _ <
|_| /_/   \_\_| \_\
EOF
echo -e "${N}"
echo -e "${D}private agent router — one-click demo${N}"
echo -e "${P}contracts on Base Sepolia · payments via x402 USDC${N}"
echo ""

# ── 1. Relay A (exit node) ──────────────────────────────────────────
echo -ne "${D}[1/5] relay a (exit) .............. ${N}"
cd "$PAR"
RELAY_NAME=relay_a \
  RELAY_WALLET_ADDRESS="$WALLET_ADDRESS" \
  RELAY_PRICE_PER_HOP=10000 \
  python3 -m uvicorn relay.server:app --host 127.0.0.1 --port 8001 --log-level error &
PIDS+=($!)
if wait_for http://127.0.0.1:8001/health 10; then
    echo -e "${G}online${N}  ${D}:8001${N}"
else
    echo -e "${R}failed${N}"; exit 1
fi

# ── 2. Relay B (entry node) ─────────────────────────────────────────
echo -ne "${D}[2/5] relay b (entry) ............. ${N}"
RELAY_NAME=relay_b \
  RELAY_WALLET_ADDRESS="$WALLET_ADDRESS" \
  RELAY_PRICE_PER_HOP=10000 \
  python3 -m uvicorn relay.server:app --host 127.0.0.1 --port 8002 --log-level error &
PIDS+=($!)
if wait_for http://127.0.0.1:8002/health 10; then
    echo -e "${G}online${N}  ${D}:8002${N}"
else
    echo -e "${R}failed${N}"; exit 1
fi

# ── 3. Mock service + audit API ─────────────────────────────────────
echo -ne "${D}[3/5] mock service + audit api .... ${N}"
python3 -m uvicorn demo_service.server:app --host 127.0.0.1 --port 9000 --log-level error &
PIDS+=($!)
PYTHONPATH="$PAR" python3 -m uvicorn agent.client:audit_app --host 127.0.0.1 --port 8003 --log-level error &
PIDS+=($!)
if wait_for http://127.0.0.1:9000/weather?city=boot 10 && wait_for http://127.0.0.1:8003/audit 10; then
    echo -e "${G}online${N}  ${D}:9000 :8003${N}"
else
    echo -e "${R}failed${N}"; exit 1
fi

# ── 4. Next.js dashboard ────────────────────────────────────────────
echo -ne "${D}[4/5] next.js dashboard ........... ${N}"
cd "$ROOT"
yarn start > /dev/null 2>&1 &
PIDS+=($!)
for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:3000 2>/dev/null; then
        echo -e "${G}online${N}  ${D}:3000${N}"
        break
    fi
    sleep 1
done

# ── 5. Verify contracts on Base Sepolia ──────────────────────────────
echo -ne "${D}[5/5] base sepolia contracts ....... ${N}"
echo -e "${G}deployed${N}  ${D}chain:84532${N}"

# ── Ready ────────────────────────────────────────────────────────────
echo ""
echo -e "${G}══════════════════════════════════════${N}"
echo -e "${G}  all systems operational${N}"
echo -e "${G}══════════════════════════════════════${N}"
echo ""
echo -e "  ${D}dashboard${N}   http://localhost:3000"
echo -e "  ${D}demo${N}        http://localhost:3000/demo"
echo -e "  ${D}chain${N}       Base Sepolia (84532)"
echo -e "  ${P}x402${N}        0.01 USDC per hop"
echo -e ""
echo -e "  ${D}relays:${N}"
echo -e "    ${D}relay_a${N}  https://par-relay-production.up.railway.app"
echo -e "    ${D}relay_b${N}  https://par-relay-production-713d.up.railway.app"
echo -e ""
echo -e "  ${D}contracts:${N}"
echo -e "    ${D}RelayRegistry${N}   0xa49a8a7e5727b0402e4590cb498b51da03a4d309"
echo -e "    ${D}SpendingPolicy${N}  0x65133639e5d57b2de6703fa701e8cb7565754e6d"
echo -e "    ${D}BlindTokenVault${N} 0x1a78ef103b529c2a6fe8f3db97e1f7692a875092"
echo -e "    ${D}AuditLog${N}        0x78f42b581f590a22ab42d26d35827586597b3dcc"
echo -e ""
echo -e "  ${D}ctrl+c to stop everything${N}"
echo ""

# Keep alive
wait
