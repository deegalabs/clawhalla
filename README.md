# ClawHalla

Enterprise AI agent orchestration platform built on [OpenClaw](https://openclaw.ai).

Docker launcher + Mission Control dashboard + 15-agent hierarchy + smart contracts on Base L2.

## What's Included

- **Docker setup** — One-command OpenClaw installation with pre-configured workspace
- **Mission Control** — 12-screen dashboard for agent orchestration and monitoring
- **15 AI agents** — Norse mythology-themed hierarchy across 4 squads
- **Agent Factory** — Create new agents from the UI with persona templates
- **Squad Pack system** — Install pre-configured agent teams with one click
- **Secret Vault** — AES-256-GCM encrypted credential storage
- **Content Creator** — Draft, preview, and publish to LinkedIn with real-time checklist
- **Marketplace** — Browse and install agent packs (wallet connect for future NFT licenses)
- **Smart Contracts** — AgentRegistry, LicenseNFT, Marketplace on Base L2
- **Full-text search** — SQLite FTS5 across 200+ workspace documents
- **Real-time updates** — SSE + chokidar file watching for live dashboard
- **AI-AGIL methodology** — Structured multi-agent development framework

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
| Dashboard | Agent overview, stats, real-time activity feed (SSE) |
| Tasks | Kanban board with auto-dispatch + SSE live updates |
| Calendar | Cron jobs and scheduled tasks |
| Projects | Project cards + Git push panel |
| Memory | Daily journal, long-term memory, FTS5 search |
| Docs | Searchable document browser with 11 category filters |
| Team | Org chart by tier + Agent Factory (create agents from UI) |
| Content | Post editor with LinkedIn integration + checklist |
| Marketplace | Squad packs + wallet connect (Base L2) |
| Approvals | CEO approval gates and decision history |
| Settings | Secret vault (AES-256-GCM encrypted storage) |

### API Routes (19)

```
GET  /api/health            — Health check
GET  /api/gateway/sessions  — Live agent sessions
GET  /api/gateway/crons     — Cron job list
GET  /api/org-structure     — Agent hierarchy from YAML
GET  /api/sse               — Server-Sent Events stream
GET  /api/search?q=query    — FTS5 full-text search
POST /api/search            — Trigger re-index
CRUD /api/tasks             — Task management
GET  /api/board/sync        — YAML board reader
PATCH/api/board/update      — YAML board writer
GET  /api/activities        — Activity log
GET  /api/memory            — Memory entries
GET  /api/docs              — Document scanner
CRUD /api/vault             — Secret vault (encrypted)
POST /api/vault/reveal      — Decrypt secret (masked/full)
GET  /api/git               — Git repo status
POST /api/git               — Git push/pull
CRUD /api/agents/factory    — Agent Factory
CRUD /api/packs             — Squad Pack installer
GET  /api/agents/coverage   — Multi-role skill matching
POST /api/feedback          — Continuous learning system
GET  /api/linkedin           — LinkedIn connection status
POST /api/linkedin           — Publish LinkedIn post
```

## Agent Hierarchy

```
Daniel (CEO, human)
  └── Claw 🦞 — System Controller
        ├── Odin 👁️ — CTO
        │     ├── Thor ⚡ — Tech Lead
        │     │     ├── Freya ✨ — Senior Developer
        │     │     ├── Heimdall 👁️‍🗨️ — QA/Observability
        │     │     └── Völund 🔧 — DevOps/GitHub
        │     └── Frigg 👑 — Coordinator/PA
        │           ├── Mimir 🧠 — Knowledge Curator
        │           ├── Bragi 🎭 — Content Creator
        │           └── Loki 🦊 — Analytics/Strategy
        ├── Vidar ⚔️ — Blockchain Architect
        │     ├── Sindri 🔥 — Solidity Developer
        │     ├── Skadi ❄️ — Cairo Developer
        │     └── Tyr ⚖️ — Security Auditor
        └── Saga 🔮 — CPO (Research Lead)
```

## Smart Contracts (Base L2)

| Contract | Purpose |
|----------|---------|
| AgentRegistry | On-chain template registry with creator attribution |
| LicenseNFT | ERC-721 license tokens (transferable, revocable) |
| Marketplace | Purchase flow with royalty splits (2.5% platform fee) |

Audited by Tyr (AI security auditor). All findings resolved.

## Tech Stack

- **Runtime:** Docker + OpenClaw Gateway
- **Dashboard:** Next.js 15, TypeScript strict, Tailwind CSS v4
- **Database:** SQLite + Drizzle ORM + FTS5
- **Real-time:** SSE + chokidar file watching
- **Wallet:** wagmi + viem (Base L2, Base Sepolia, Ethereum mainnet)
- **Encryption:** AES-256-GCM (secret vault)
- **Contracts:** Solidity 0.8.24, Foundry, Base L2
- **Search:** SQLite FTS5 with porter stemming

## Project Structure

```
clawhalla/
├── apps/mission-control/   — Next.js dashboard (12 screens, 19 API routes)
├── contracts/              — Solidity smart contracts (Foundry)
├── docker/                 — Docker configuration
├── docs/                   — Architecture, roadmap, security docs
├── scripts/                — Setup and utility scripts
├── volumes/                — Docker volume mounts
├── workspace-template/     — Enterprise workspace structure
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Business Model

| Tier | What | Price |
|------|------|-------|
| Free (open source) | Docker + MC (12 screens) + 3 agents + workspace template | $0 |
| Pro packs | Squad packs, unlimited agents/projects | $49/mo |
| Premium skills | Blockchain auditor, DeFi monitor, etc. | $20-100/skill |
| Marketplace | Agent templates as NFT licenses (Base L2) | Creator-set pricing |

## License

MIT

## Links

- Website: [clawhalla.xyz](https://clawhalla.xyz)
- GitHub: [deegalabs/clawhalla](https://github.com/deegalabs/clawhalla)
- Organization: [Deega Labs](https://github.com/deegalabs)
