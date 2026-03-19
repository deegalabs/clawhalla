#!/bin/bash
# ClawHalla -- reset.sh
# Completely resets ClawHalla: stops container, wipes data, rebuilds.
#
# Usage: ./scripts/reset.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "WARNING: This will DELETE all ClawHalla data including:"
echo "  - Agent configurations"
echo "  - Session history"
echo "  - Identity files"
echo ""
read -r -p "Are you sure you want to continue? (y/N): " REPLY

echo ""
if [[ "${REPLY}" != "y" && "${REPLY}" != "Y" ]]; then
  echo "Reset cancelled."
  exit 0
fi

echo "Stopping containers..."
docker compose down -v 2>/dev/null || true

echo "Wiping volume data..."
rm -rf ./volumes/openclaw/*
touch ./volumes/openclaw/.gitkeep

echo "Rebuilding and starting..."
docker compose up -d --build

sleep 5

if docker compose ps --format '{{.Name}} {{.Status}}' | grep -q "clawhalla"; then
  echo "ClawHalla has been reset and is running!"
  echo ""
  echo "Run: docker compose exec clawhalla bash"
  echo "Then: openclaw onboard"
else
  echo "ERROR: Container failed to start after reset. Check logs." >&2
  exit 1
fi
