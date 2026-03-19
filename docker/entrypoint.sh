#!/bin/bash
# ClawHalla Entrypoint
# Creates required directories and fixes permissions before starting.

set -euo pipefail

OPENCLAW_DIR="/home/clawdbot/.openclaw"

# The mounted volume may be created as root (or with wrong ownership).
# Ensure base directory exists and is owned by the runtime user before
# attempting to create subfolders.
sudo mkdir -p "${OPENCLAW_DIR}"
sudo chown -R clawdbot:clawdbot "${OPENCLAW_DIR}"

# Create OpenClaw directory structure if not exists
mkdir -p "${OPENCLAW_DIR}/identity"
mkdir -p "${OPENCLAW_DIR}/agents/main/agent"
mkdir -p "${OPENCLAW_DIR}/agents/main/sessions"

exec "$@"
