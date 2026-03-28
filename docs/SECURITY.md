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

## Container User Security

The container runs as user `clawdbot`.

For development convenience, the Docker image sets a password for `clawdbot`
via the `CLAWDBOT_PASSWORD` build argument.

### For Production

Set `CLAWDBOT_PASSWORD` in your `.env` and rebuild the container:

```bash
CLAWDBOT_PASSWORD=your-secure-random-password

docker compose down
docker compose up -d --build
```

### Recommendation

If you only access the container via `docker exec` (no SSH), the password
is rarely needed. Still, set a strong value to avoid accidental credential reuse.

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

## Mission Control Security

### API Protection

- **Authentication** — Per-process crypto session token on all destructive endpoints
- **Rate limiting** — In-memory limiter with concurrent + per-minute caps (dispatch: 3/10, chat: 5/20)
- **CORS** — Middleware blocks unknown origins on `/api/*` routes
- **CSP** — Content-Security-Policy header on all responses (`unsafe-eval` only in dev)

### Input Sanitization

- **XSS prevention** — HTML escaping + URL sanitization in markdown renderer
- **Terminal** — Regex-based command blocklist (rm -rf, sudo, mkfs, etc.) + cwd restricted to home/tmp
- **API limits** — All paginated endpoints capped (100-500 max), crypto.randomUUID() for all IDs

### Data

- **Vault** — AES-256-GCM encryption with scrypt key derivation
- **DB** — SQLite with parameterized queries via Drizzle ORM (no SQL injection)

## Reporting security issues

If you discover a vulnerability:

1. Do not open a public issue
2. Send a private report
3. Include steps to reproduce and relevant logs
