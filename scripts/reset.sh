#!/bin/bash
# ClawHalla -- reset.sh
# Completely resets ClawHalla: stops container, wipes data, rebuilds.
#
# Usage: ./scripts/reset.sh

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
warn() { echo -e "${RED}[WARNING]${NC} $1"; }

cd "$(dirname "$0")/.."

warn "WARNING: This will DELETE all ClawHalla data including:"
warn "  - Agent configurations"
warn "  - Session history"
warn "  - Identity files"
echo ""
read -r -p "Are you sure you want to continue? (y/N): " REPLY

echo ""
if [[ "${REPLY}" != "y" && "${REPLY}" != "Y" ]]; then
  info "Reset cancelled."
  exit 0
fi

info "Stopping containers..."
docker compose down -v 2>/dev/null || true

warn "Wiping volume data..."
rm -rf ./volumes/openclaw/*
touch ./volumes/openclaw/.gitkeep

info "Rebuilding and starting..."
docker compose up -d --build

sleep 5

if docker compose ps --format '{{.Name}} {{.Status}}' | grep -q "clawhalla"; then
  ok "ClawHalla has been reset and is running!"
  echo ""
  info "Run: docker compose exec clawhalla bash"
  info "Then: openclaw onboard"
else
  error "ERROR: Container failed to start after reset. Check logs."
fi
