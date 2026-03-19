#!/bin/bash
# ClawHalla -- stop.sh
# Stops the ClawHalla container gracefully.
#
# Usage: ./scripts/stop.sh

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

info "Stopping ClawHalla..."
docker compose down

ok "ClawHalla stopped. Your data is preserved in ./volumes/openclaw/"
