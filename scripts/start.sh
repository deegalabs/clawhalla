#!/bin/bash
# ClawHalla -- start.sh
# Builds and starts the ClawHalla container.
#
# Usage: ./scripts/start.sh

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

# Navigate to project root
cd "$(dirname "$0")/.."

# Check for .env file
if [ ! -f ".env" ]; then
  error "ERROR: .env file not found. Copy .env.example to .env and configure it."
fi

info "Building and starting ClawHalla..."
docker compose up -d --build

info "Waiting for container to be ready..."
sleep 5

if docker compose ps --format '{{.Name}} {{.Status}}' | grep -q "clawhalla"; then
  ok "ClawHalla is running!"
  echo ""
  info "Next steps:"
  info "  1) Enter the container:  docker compose exec clawhalla bash"
  info "  2) Run onboard wizard:   openclaw onboard"
  echo ""
  info "Useful commands:"
  info "  - Stop:    ./scripts/stop.sh"
  info "  - Reset:   ./scripts/reset.sh"
  info "  - Logs:    docker compose logs -f clawhalla"
else
  error "ERROR: Container failed to start. Check: docker compose logs clawhalla"
fi
