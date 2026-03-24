# ClawHalla

ClawHalla is a Docker-based launcher for [OpenClaw](https://openclaw.ai) with an integrated Mission Control dashboard.

## What's included

- **Docker setup** — One-command OpenClaw installation
- **Mission Control** — Visual dashboard for agent orchestration (8 screens)
- **Workspace Template** — Enterprise-grade workspace structure for AI teams
- **Agent methodology** — AI-AGIL framework for multi-agent development

## Quick Start

```bash
git clone https://github.com/deegalabs/clawhalla.git
cd clawhalla
cp .env.example .env
# Edit .env with your Anthropic API key
docker compose up -d --build
docker compose exec clawhalla bash
openclaw onboard
```

## Mission Control

After OpenClaw is running, start Mission Control:

```bash
# Inside the container:
cd ~/mission-control
pnpm install
pnpm dev --hostname 0.0.0.0 --port 3000
```

Access at `http://localhost:3333`

### Screens

| Screen | Description |
|--------|-------------|
| Dashboard | Agent overview, stats, activity feed |
| Tasks | Kanban board with auto-dispatch |
| Calendar | Cron jobs and scheduled tasks |
| Projects | Project cards with progress tracking |
| Memory | Daily journal and long-term memory viewer |
| Docs | Searchable document browser |
| Team | Org chart with agent hierarchy |
| Approvals | CEO gates and decision history |

## Workspace Template

Copy the workspace template to get started with an enterprise structure:

```bash
cp -r workspace-template/* ~/.openclaw/workspace/
cp workspace-template/company/org_structure.yaml.example ~/.openclaw/workspace/company/org_structure.yaml
# Edit org_structure.yaml with your agents
```

## Project Structure

```
clawhalla/
├── docker/                  # Docker entrypoint
├── scripts/                 # Install/setup scripts
├── apps/
│   └── mission-control/     # Next.js dashboard
├── workspace-template/      # Enterprise workspace structure
├── volumes/                 # User data (gitignored)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Tech Stack

- **Runtime**: OpenClaw (AI agent framework)
- **Dashboard**: Next.js 15, TypeScript, Tailwind CSS, SQLite/Drizzle
- **Container**: Docker + Docker Compose
- **Methodology**: AI-AGIL (adapted from AIOX)

## Roadmap

- [x] v0.1.0: Docker MVP
- [x] v0.2.0: Agent hierarchy + workspace structure
- [x] v0.3.0: Mission Control MVP (8 screens)
- [ ] v0.4.0: Live gateway data + real-time SSE
- [ ] v0.5.0: QMD semantic search + heartbeat activation
- [ ] v1.0.0: Cloud connector + Pro features

## Related

- [clawhalla.xyz](https://clawhalla.xyz) — Documentation and landing page
- [OpenClaw](https://openclaw.ai) — The AI agent framework

## License

MIT
