#!/bin/bash
# ClawHalla Entrypoint
# Creates required directories and fixes permissions before starting.

set -e

OPENCLAW_DIR="/home/clawdbot/.openclaw"

# Create OpenClaw directory structure if not exists
mkdir -p "${OPENCLAW_DIR}/identity"
mkdir -p "${OPENCLAW_DIR}/agents/main/agent"
mkdir -p "${OPENCLAW_DIR}/agents/main/sessions"

# Fix ownership (in case volume was created by root)
# Run as non-root, so use sudo only when needed.
if [ "$(stat -c '%U' "${OPENCLAW_DIR}")" != "clawdbot" ]; then
  sudo chown -R clawdbot:clawdbot "${OPENCLAW_DIR}"
fi

# Execute the main command
exec "$@"
