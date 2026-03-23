#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PIDS=()

cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
}

trap cleanup EXIT INT TERM

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Private Agent Router — Starting Up${NC}"
echo -e "${GREEN}========================================${NC}"

# --- Phase 1: Install dependencies ---
echo -e "\n${YELLOW}[1/6] Installing Python dependencies...${NC}"
python3 -m pip install --user --break-system-packages -q -r requirements.txt

echo -e "${YELLOW}[2/6] Installing contract dependencies...${NC}"
cd contracts
npm install --silent 2>/dev/null
cd "$ROOT"

# --- Phase 2: Start Hardhat node ---
echo -e "\n${YELLOW}[3/6] Starting Hardhat node on :8545...${NC}"
cd contracts
npx hardhat node > /dev/null 2>&1 &
PIDS+=($!)
cd "$ROOT"
sleep 3
echo -e "${GREEN}  Hardhat node running (PID ${PIDS[-1]})${NC}"

# --- Phase 3: Deploy contracts ---
echo -e "\n${YELLOW}[4/6] Deploying smart contracts...${NC}"
cd contracts
npx hardhat run scripts/deploy.js --network localhost
cd "$ROOT"

# --- Phase 4: Start relay servers ---
echo -e "\n${YELLOW}[5/6] Starting relay and service servers...${NC}"

# Detect if relays are remote (URL doesn't point to 127.0.0.1)
RELAY_A_URL=$(python3 -c "import json; print(json.load(open('config.json'))['relays'][0]['url'])")
RELAY_B_URL=$(python3 -c "import json; print(json.load(open('config.json'))['relays'][1]['url'])")

if echo "$RELAY_A_URL" | grep -q "127.0.0.1"; then
    RELAY_NAME=relay_a uvicorn relay.server:app --host 127.0.0.1 --port 8001 --log-level warning &
    PIDS+=($!)
    echo -e "${GREEN}  Relay A running locally on :8001 (PID ${PIDS[-1]})${NC}"
else
    echo -e "${GREEN}  Relay A is remote: ${RELAY_A_URL}${NC}"
fi

if echo "$RELAY_B_URL" | grep -q "127.0.0.1"; then
    RELAY_NAME=relay_b uvicorn relay.server:app --host 127.0.0.1 --port 8002 --log-level warning &
    PIDS+=($!)
    echo -e "${GREEN}  Relay B running locally on :8002 (PID ${PIDS[-1]})${NC}"
else
    echo -e "${GREEN}  Relay B is remote: ${RELAY_B_URL}${NC}"
fi

# Mock service
uvicorn demo_service.server:app --host 127.0.0.1 --port 9000 --log-level warning &
PIDS+=($!)
echo -e "${GREEN}  Mock service running on :9000 (PID ${PIDS[-1]})${NC}"

# Agent audit API
uvicorn agent.client:audit_app --host 127.0.0.1 --port 8003 --log-level warning &
PIDS+=($!)
echo -e "${GREEN}  Agent audit API running on :8003 (PID ${PIDS[-1]})${NC}"

# Wait for relays to register keys (local) or fetch them (remote)
sleep 2

# --- Phase 5: Start Scaffold-ETH frontend ---
echo -e "\n${YELLOW}[6/6] Starting Next.js dashboard on :3000...${NC}"
echo -e "  Run separately: ${YELLOW}cd ../onion-sym && yarn start${NC}"
echo -e "  (or use the old dashboard: cd dashboard && python3 -m http.server 3000)"

# --- Ready ---
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "  Hardhat node:   http://127.0.0.1:8545"
echo -e "  Relay A:        http://127.0.0.1:8001"
echo -e "  Relay B:        http://127.0.0.1:8002"
echo -e "  Mock service:   http://127.0.0.1:9000"
echo -e "  Agent audit:    http://127.0.0.1:8003"
echo -e "  Dashboard:      http://127.0.0.1:3000"
echo -e ""
echo -e "  Run demo:  ${YELLOW}python3 demo/run_demo.py${NC}"
echo -e "  (or:       python3 demo/run_demo.py private|direct|both)"
echo -e ""
echo -e "  Press Ctrl+C to stop all services."
echo -e ""

# Keep alive
wait
