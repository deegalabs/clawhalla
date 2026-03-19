#!/bin/bash
# ClawHalla -- stop.sh
# Stops the ClawHalla container gracefully.
#
# Usage: ./scripts/stop.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Stopping ClawHalla..."
docker compose down

echo "ClawHalla stopped. Your data is preserved in ./volumes/openclaw/"
