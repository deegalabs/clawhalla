# ClawHalla

Enterprise AI agent orchestration platform built on [OpenClaw](https://openclaw.ai).

Docker launcher + Mission Control dashboard + 9-agent hierarchy + smart contracts on Base L2.

## What's Included

- **Docker setup** — One-command OpenClaw installation with pre-configured workspace
- **Mission Control** — 19-screen dashboard for agent orchestration and monitoring
- **Boards Engine** — Multi-board Kanban with card detail, comments, history, drag-and-drop
- **Chat Engine** — Multi-agent chat with party mode, voice input, streaming, session persistence
- **Content Pipelines** — Multi-platform content publishing with Telegram approval flow
- **Telegram Integration** — Inline approval buttons, media upload, webhook notifications
- **Memory/RAG System** — Per-agent semantic search with local or cloud embeddings
- **Autopilot** — Goal-driven autonomous execution with human feedback loop
- **9 AI agents** — Norse mythology-themed hierarchy across 4 squads
- **Agent Factory** — Create and configure agents with per-agent memory modes
- **Squad Pack system** — Install pre-configured agent teams with one click
- **Secret Vault** — AES-256-GCM encrypted credential storage
- **Notification system** — SSE with auto-reconnect, exponential backoff, sound alerts
- **Terminal** — Sandboxed shell with command blocklist and cwd restriction
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
cd ~/repos/clawhalla/apps/mission-control
pnpm install
pnpm dev --hostname 0.0.0.0 --port 3000
```

Access at `http://localhost:3333`

### Screens

| Screen | Description |
|--------|-------------|
| Dashboard | System health, agent stats, real-time activity feed (SSE) |
| Boards | Multi-board Kanban engine with card detail, comments, history |
| Calendar | Cron jobs and scheduled tasks |
| Projects | Project cards + Git push/pull panel |
| Pipeline | Content publishing — multi-platform drafts with approval flow |
| Chat | Multi-agent chat with party mode, voice input, streaming |
| Approvals | CEO approval gates and decision history |
| Memory | Agent memory with RAG semantic search, daily journal, FTS5 |
| Docs | Searchable document browser with category filters |
| Content | Post editor with LinkedIn integration + checklist |
| Council | R&D council sessions — automated research memos |
| Office | Live agent status and session monitoring |
| Terminal | Sandboxed terminal with command blocklist |
| Autopilot | Goal-driven autonomous execution with feedback loop |
| Marketplace | Squad packs + wallet connect (Base L2) |
| Settings | Secret vault, memory/RAG config, per-agent memory modes |
| Onboarding | Setup wizard for first-time users |
| Pipeline | Build status and CI/CD monitoring |
| Feedback | Continuous learning and agent feedback system |

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
  POST /api/content/publish      — Multi-platform content publishing
  GET  /api/content/platforms    — Available platform adapters
  POST /api/telegram/webhook     — Telegram bot webhook (approvals, media)
  GET  /api/memory/config        — Memory/RAG provider configuration
  GET  /api/memory/rag?q=query   — Semantic search across agent memory
  POST /api/memory/rag           — Trigger memory reindex
  GET  /api/notifications       — Notification system

Agents & System
  GET  /api/agents/health       — Agent health status
  CRUD /api/agents/factory      — Agent Factory
  GET  /api/org-structure       — Agent hierarchy (YAML)
  CRUD /api/packs               — Squad Pack installer
  GET  /api/gateway/sessions    — Live agent sessions
  GET  /api/gateway/crons       — Cron job list
  CRUD /api/crons               — Cron management
  POST /api/squads/create        — Squad creation with templates

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
  └── Claw 🦞 — Chief Orchestrator (Opus 4.6)
        ├── Dev Squad
        │     ├── Thor ⚡ — Tech Lead (Sonnet 4.6)
        │     ├── Freya ✨ — Senior Developer (Sonnet 4.6)
        │     └── Tyr ⚖️ — Security Auditor (Sonnet 4.6)
        ├── Personal Squad
        │     ├── Frigg 👑 — Coordinator/PA (Sonnet 4.6)
        │     └── Mimir 🧠 — Knowledge Curator (Sonnet 4.6)
        ├── Social Squad
        │     ├── Saga 🔮 — Content Strategist (Sonnet 4.6)
        │     └── Bragi 🎭 — Content Creator (Sonnet 4.6)
        └── Vidar ⚔️ — Blockchain Architect (Sonnet 4.6)
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
- **Database:** SQLite + Drizzle ORM (23 tables, 11 indexes) + FTS5
- **Real-time:** SSE + chokidar file watching
- **Security:** CSP, CORS middleware, rate limiting, XSS prevention, AES-256-GCM vault
- **Wallet:** wagmi + viem (Base L2, Base Sepolia, Ethereum mainnet)
- **Contracts:** Solidity 0.8.24, Foundry, Base L2
- **Search:** SQLite FTS5 with porter stemming

## Project Structure

```
clawhalla/
├── apps/mission-control/   — Next.js dashboard (19 screens, 40+ API routes)
├── agents/                 — Agent persona files (SOUL.md, AGENTS.md, skills/)
├── contracts/              — Solidity smart contracts (Foundry)
├── docker/                 — Docker configuration
├── docs/                   — Architecture, roadmap, security docs
├── scripts/                — Setup and utility scripts
├── squads/                 — Squad templates (dev, blockchain, clop-cabinet)
├── workspace-template/     — Enterprise workspace structure + AI-AGIL methodology
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Business Model

| Tier | What | Price |
|------|------|-------|
| Free (open source) | Docker + MC (19 screens) + 3 agents | $0 |
| Pro packs | Squad packs, unlimited agents/projects | $49/mo |
| Premium skills | Blockchain auditor, DeFi monitor, etc. | $20-100/skill |
| Marketplace | Agent templates as NFT licenses (Base L2) | Creator-set pricing |

## License

MIT

## Links

- Website: [clawhalla.xyz](https://clawhalla.xyz)
- GitHub: [deegalabs/clawhalla](https://github.com/deegalabs/clawhalla)
- Organization: [Deega Labs](https://github.com/deegalabs)
