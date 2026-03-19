# ClawHalla

ClawHalla is a Docker-based launcher for [OpenClaw](https://openclaw.ai) that reduces setup friction.

## Features

- One-command setup
- Docker-isolated environment
- OpenClaw CLI included
- Persistent data on the host

## Prerequisites

- Docker (v20.10+)
- Docker Compose (v2.0+)
- An Anthropic API key (or other provider keys, depending on how you configure OpenClaw)

## Quick Start

From this directory (`clawhalla`):

```bash
docker compose up -d --build
docker compose exec clawhalla bash
```

Then, inside the container (as `clawdbot`):

```bash
openclaw onboard
```

Alternatively, using the scripts:

```bash
cp .env.example .env
bash scripts/start.sh
```

## Non-interactive onboarding (optional)

For automation, you can run onboarding in non-interactive mode. This example uses the baseline automation flow from OpenClaw docs.

```bash
docker compose exec clawhalla bash -lc 'openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --secret-input-mode plaintext \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --skip-health \
  --skip-skills \
  --accept-risk'
```

For full flags and examples, see OpenClaw docs:
- [CLI Automation](https://docs.openclaw.ai/start/wizard-cli-automation)
- [`openclaw onboard`](https://docs.openclaw.ai/cli/onboard)

## Data Persistence

OpenClaw data is stored on the host here:

- Host: `./volumes/openclaw`
- Container: `/home/clawdbot/.openclaw`

## Scripts

- `scripts/start.sh`: build and start
- `scripts/stop.sh`: stop containers (data preserved)
- `scripts/reset.sh`: stop, wipe data, and restart

## Project Structure

```text
clawhalla/
├── docker/
│   └── entrypoint.sh
├── docs/  (architecture + docs)
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   └── reset.sh
├── volumes/
│   └── openclaw/
│       └── .gitkeep
├── .env.example
├── .gitignore
├── CONTRIBUTING.md
├── docker-compose.yml
├── Dockerfile
├── LICENSE
└── README.md
```

## Roadmap

- v0.1.0: local Docker MVP (current)
- v0.2.0: non-interactive onboarding automation
- v0.3.0: remote deploy scripts
- v0.4.0: distribution/polish
- v1.0.0: cloud connector / web panel

## Contributing

See `CONTRIBUTING.md`.

## License

MIT. See `LICENSE`.
