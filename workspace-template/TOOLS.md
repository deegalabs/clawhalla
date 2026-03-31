# TOOLS.md — Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — environment-specific details.

## What Goes Here

- API endpoints and URLs
- SSH hosts and aliases
- Device nicknames
- Preferred voices, languages
- Anything specific to this installation

## Mission Control

- URL: `http://localhost:3000`
- API: See skill `mission-control.md` for all endpoints
- Vault: AES-256-GCM encrypted secrets at `/api/vault`

## OpenClaw Gateway

- WebSocket: `ws://127.0.0.1:18789`
- Restart: `kill $(ps aux | grep openclaw-gateway | grep -v grep | awk '{print $2}') && nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &`
- Config: `~/.openclaw/openclaw.json`
- Logs: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`

---

Add whatever helps you do your job. This is your cheat sheet.
