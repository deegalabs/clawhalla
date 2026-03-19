#!/bin/bash
# ClawHalla -- start.sh
# Builds and starts the ClawHalla container.
#
# Usage: ./scripts/start.sh

set -euo pipefail

# Navigate to project root
cd "$(dirname "$0")/.."

# Check for .env file
if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and configure it." >&2
  exit 1
fi

echo "Building and starting ClawHalla..."
docker compose up -d --build

echo "Waiting for container to be ready..."
sleep 5

if docker compose ps --format '{{.Name}} {{.Status}}' | grep -q "clawhalla"; then
  echo "ClawHalla is running!"
  echo ""
  echo "Next steps:"
  echo "  1) Enter the container:  docker compose exec clawhalla bash"
  echo "  2) Run onboard wizard:   openclaw onboard"
  echo ""
  echo "Useful commands:"
  echo "  - Stop:    ./scripts/stop.sh"
  echo "  - Reset:   ./scripts/reset.sh"
  echo "  - Logs:    docker compose logs -f clawhalla"
else
  echo "ERROR: Container failed to start. Check: docker compose logs clawhalla" >&2
  exit 1
fi
