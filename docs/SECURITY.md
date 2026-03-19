# ClawHalla Security Guidelines

## Secrets management

### Never commit

- `.env` files (use `.env.example` as a template)
- API keys or tokens
- Private keys inside `volumes/openclaw/identity/`

### Environment variables

Sensitive configuration should come from environment variables.

Good:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Bad:

- Hardcoding API keys in the Dockerfile or scripts

## Secret input modes

When running onboarding in automation, prefer storing keys as references (where supported).

## Network security

### Default configuration

By default, ClawHalla exposes no ports. The gateway should not be reachable from the public internet unless explicitly intended.

### Exposing the gateway

If you need to expose the OpenClaw gateway (for webhooks or remote access):

- Bind to `127.0.0.1` only, and put a reverse proxy with TLS in front if you need external access.

Avoid binding to `0.0.0.0` without proper authentication and TLS.

## Gateway authentication

Always set a strong gateway token.

## Container permissions

- The container runs as a non-root user (`clawdbot`).
- The entrypoint fixes ownership on the mounted volume.

## Reporting security issues

If you discover a vulnerability:

1. Do not open a public issue
2. Send a private report
3. Include steps to reproduce and relevant logs
