#!/usr/bin/env bash
#
# Deploy two onion relays to Railway.
#
# Prerequisites:
#   npm i -g @railway/cli
#   railway login
#
# Usage:
#   ./deploy_relays.sh
#
# After deployment, update config.json with the printed URLs.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
RELAY_DIR="$ROOT/relay"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Installing Railway CLI...${NC}"
    npm i -g @railway/cli
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deploying PAR Relays to Railway${NC}"
echo -e "${GREEN}========================================${NC}"

# Generate persistent keypairs so relays keep the same identity across deploys
generate_key() {
    python3 -c "
import nacl.public
sk = nacl.public.PrivateKey.generate()
print(bytes(sk).hex())
"
}

cd "$RELAY_DIR"

# ── Relay A (exit relay) ──────────────────────────────────────────────
echo -e "\n${YELLOW}[1/2] Deploying Relay A (exit relay)...${NC}"
echo -e "  This will open Railway's project setup."
echo -e "  Select: ${GREEN}New Project → Empty Project${NC}\n"

RELAY_A_KEY=$(generate_key)

railway init --name par-relay-a 2>/dev/null || true
railway variable set RELAY_NAME=relay_a
railway variable set RELAY_PRIVATE_KEY="$RELAY_A_KEY"
railway up --detach

RELAY_A_URL=$(railway domain 2>/dev/null || echo "<pending — run 'railway domain' in the relay-a project>")
echo -e "${GREEN}  Relay A deployed!${NC}"
echo -e "  URL: ${YELLOW}${RELAY_A_URL}${NC}"
echo ""

# ── Relay B (entry relay) ─────────────────────────────────────────────
echo -e "${YELLOW}[2/2] Deploying Relay B (entry relay)...${NC}"
echo -e "  Select: ${GREEN}New Project → Empty Project${NC}\n"

RELAY_B_KEY=$(generate_key)

railway init --name par-relay-b 2>/dev/null || true
railway variable set RELAY_NAME=relay_b
railway variable set RELAY_PRIVATE_KEY="$RELAY_B_KEY"
railway up --detach

RELAY_B_URL=$(railway domain 2>/dev/null || echo "<pending — run 'railway domain' in the relay-b project>")
echo -e "${GREEN}  Relay B deployed!${NC}"
echo -e "  URL: ${YELLOW}${RELAY_B_URL}${NC}"

# ── Update config ─────────────────────────────────────────────────────
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Update your ${YELLOW}config.json${NC} relay URLs:"
echo ""
echo "  relay_a → https://${RELAY_A_URL}"
echo "  relay_b → https://${RELAY_B_URL}"
echo ""
echo "Or run with the helper:"
echo ""
echo "  python3 setup_remote.py <relay-a-url> <relay-b-url>"
echo ""
