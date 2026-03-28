# ClawHalla

Enterprise AI agent orchestration platform built on [OpenClaw](https://openclaw.ai).

Docker launcher + Mission Control dashboard + 15-agent hierarchy + smart contracts on Base L2.

## What's Included

- **Docker setup** — One-command OpenClaw installation with pre-configured workspace
- **Mission Control** — 20-screen dashboard for agent orchestration and monitoring
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
| Boards | Multi-board Kanban engine with drag-and-drop, card detail modals |
| Calendar | Cron jobs and scheduled tasks |
| Projects | Project cards + Git push/pull panel |
| Factory | Content pipelines — multi-step agent workflows |
| Chat | Multi-agent chat with party mode, voice input, session persistence |
| Approvals | CEO approval gates and decision history |
| Memory | Daily journal, long-term memory, FTS5 search |
| Docs | Searchable document browser with category filters |
| Content | Post editor with LinkedIn integration + checklist |
| Council | R&D council sessions — automated research memos |
| Team | Org chart by tier + Agent Factory (create agents from UI) |
| Office | Live agent status and session monitoring |
| Terminal | Sandboxed terminal with command blocklist |
| Autopilot | Goal-driven autonomous execution with feedback loop |
| Marketplace | Squad packs + wallet connect (Base L2) |
| Settings | Secret vault (AES-256-GCM) + system configuration |

### API Routes (40+)

```
Core
  GET  /api/health              — Gateway health check (debounced)
  GET  /api/sse                 — Server-Sent Events stream
  GET  /api/search?q=query      — FTS5 full-text search

Boards Engine
  CRUD /api/boards              — Board management
  CRUD /api/boards/:id/cards    — Card CRUD with SQL-level filtering
  GET  /api/boards/:id/cards/:id/comments — Card comments
  GET  /api/boards/:id/cards/:id/history  — Card history

Tasks & Projects
  CRUD /api/tasks               — Legacy task management
  CRUD /api/projects            — Project management
  CRUD /api/epics               — Epic tracking
  GET  /api/sprints             — Sprint management

Chat & AI
  POST /api/chat                — Streaming chat (rate-limited)
  CRUD /api/chat/sessions       — Chat session persistence
  POST /api/dispatch            — Agent task dispatch (rate-limited)
  POST /api/council/session     — R&D council sessions

Content & Knowledge
  GET  /api/activities          — Activity log (paginated)
  GET  /api/memory              — Memory entries
  GET  /api/docs                — Document scanner (capped)
  CRUD /api/content/drafts      — Content drafts
  CRUD /api/content/pipelines   — Content pipelines
  GET  /api/notifications       — Notification system

Agents & System
  GET  /api/agents/health       — Agent health status
  CRUD /api/agents/factory      — Agent Factory
  GET  /api/org-structure       — Agent hierarchy (YAML)
  CRUD /api/packs               — Squad Pack installer
  GET  /api/gateway/sessions    — Live agent sessions
  GET  /api/gateway/crons       — Cron job list
  CRUD /api/crons               — Cron management

Security & Config
  CRUD /api/vault               — Secret vault (AES-256-GCM)
  POST /api/vault/reveal        — Decrypt secret
  POST /api/terminal            — Sandboxed terminal
  CRUD /api/settings            — System settings
  POST /api/reset               — System reset (auth required)
  GET  /api/auth/session        — Session token

External
  GET  /api/git                 — Git repo status
  POST /api/git                 — Git push/pull
  CRUD /api/linkedin            — LinkedIn integration
  POST /api/feedback            — Continuous learning
  CRUD /api/approvals           — Approval workflow
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
- **Dashboard:** Next.js 16, TypeScript strict, Tailwind CSS v4
- **Database:** SQLite + Drizzle ORM + FTS5
- **Real-time:** SSE + chokidar file watching
- **Wallet:** wagmi + viem (Base L2, Base Sepolia, Ethereum mainnet)
- **Encryption:** AES-256-GCM (secret vault)
- **Contracts:** Solidity 0.8.24, Foundry, Base L2
- **Search:** SQLite FTS5 with porter stemming

## Project Structure

```
clawhalla/
├── apps/mission-control/   — Next.js dashboard (20 screens, 40+ API routes)
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
