#!/bin/bash
# ClawHalla — Automated Setup Script
# Usage: curl -fsSL https://clawhalla.xyz/setup.sh | bash
# Or:    git clone ... && cd clawhalla && bash setup.sh

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${AMBER}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}${AMBER}"
echo "  🦞 ClawHalla Setup"
echo "  ==================="
echo -e "${NC}"
echo "  Enterprise Autonomous AI Operating System"
echo "  Powered by OpenClaw + Claude"
echo ""

# ─── Pre-flight checks ───────────────────────────────────────────────

info "Checking prerequisites..."

# Docker
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
fi
ok "Docker found: $(docker --version | head -1)"

# Docker Compose
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
  ok "Docker Compose (plugin) found"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
  ok "Docker Compose (standalone) found"
else
  fail "Docker Compose is not installed. Install it from https://docs.docker.com/compose/install/"
fi

# Check Docker is running
if ! docker info &>/dev/null; then
  fail "Docker daemon is not running. Start Docker and try again."
fi
ok "Docker daemon is running"

# ─── Repository check ────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  info "ClawHalla repo not found. Cloning..."
  if ! command -v git &>/dev/null; then
    fail "Git is not installed. Install it first."
  fi
  git clone https://github.com/deegalabs/clawhalla.git
  cd clawhalla
  SCRIPT_DIR="$(pwd)"
  ok "Repository cloned"
else
  cd "$SCRIPT_DIR"
  ok "Using existing repo at $SCRIPT_DIR"
fi

# ─── Environment file ────────────────────────────────────────────────

if [[ ! -f .env ]]; then
  info "Creating .env from template..."
  cp .env.example .env

  echo ""
  echo -e "${BOLD}${AMBER}API Key Setup${NC}"
  echo ""
  echo "  ClawHalla needs an Anthropic API key to power its agents."
  echo "  Get one from: https://console.anthropic.com"
  echo ""
  read -rp "  Anthropic API Key (or press Enter to skip): " API_KEY

  if [[ -n "$API_KEY" ]]; then
    # Use sed to set the key in .env
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=${API_KEY}/" .env
    else
      sed -i "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=${API_KEY}/" .env
    fi
    ok "API key saved to .env"
  else
    warn "Skipped — you can configure it later in Mission Control onboarding"
  fi

  # Generate gateway token
  GATEWAY_TOKEN=$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | xxd -p | tr -d '\n' | head -c 48)
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^# OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN}/" .env
  else
    sed -i "s/^# OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN}/" .env
  fi
  ok "Gateway token generated"
else
  ok ".env already exists"
fi

# ─── Create volumes directory ─────────────────────────────────────────

mkdir -p volumes/openclaw
ok "Volume directories created"

# ─── Build & Start ────────────────────────────────────────────────────

echo ""
info "Building ClawHalla container (this may take a few minutes on first run)..."
$COMPOSE build --quiet 2>/dev/null || $COMPOSE build

echo ""
info "Starting ClawHalla..."
$COMPOSE up -d

# Wait for services to be ready
info "Waiting for services to start..."
RETRIES=30
while [[ $RETRIES -gt 0 ]]; do
  if curl -s http://localhost:3333 &>/dev/null 2>&1 || curl -s http://localhost:3333/dashboard &>/dev/null 2>&1; then
    break
  fi
  sleep 2
  RETRIES=$((RETRIES - 1))
done

# ─── Done ─────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}"
echo "  ✅ ClawHalla is running!"
echo -e "${NC}"
echo "  ┌──────────────────────────────────────────────┐"
echo "  │                                              │"
echo "  │  🖥  Mission Control: http://localhost:3333   │"
echo "  │  🌐 Gateway:         ws://localhost:18789    │"
echo "  │                                              │"
echo "  │  Open Mission Control to complete onboarding │"
echo "  │                                              │"
echo "  └──────────────────────────────────────────────┘"
echo ""
echo "  Useful commands:"
echo "    $COMPOSE logs -f        # View logs"
echo "    $COMPOSE restart        # Restart services"
echo "    $COMPOSE down           # Stop ClawHalla"
echo "    $COMPOSE down -v        # Stop & remove data"
echo ""
