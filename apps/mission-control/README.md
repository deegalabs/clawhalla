# Mission Control

ClawHalla's agent orchestration dashboard — 20 screens, 40+ API routes, real-time updates.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** (strict mode)
- **Tailwind CSS v4**
- **SQLite** + Drizzle ORM (20+ tables, indexed)
- **SSE** for real-time updates

## Quick Start

```bash
pnpm install
pnpm dev --hostname 0.0.0.0 --port 3000
```

Access at `http://localhost:3333` (proxied via Docker Compose).

## Docker

```bash
# Development
docker build -f Dockerfile.dev -t mc-dev .
docker run -p 3000:3000 -v ./data:/app/data mc-dev

# Production (multi-stage, standalone)
docker build -t mc .
docker run -p 3000:3000 -v ./data:/app/data mc
```

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/     — 20 page routes (dashboard, boards, chat, etc.)
│   └── api/             — 40+ API routes
├── components/ui/       — Shared UI (markdown, loading, notifications)
├── hooks/               — Custom hooks (notifications, agents)
└── lib/                 — Core (schema, auth, db, rate-limit, vault, events)
```

## Key Features

- **Boards Engine** — Multi-board Kanban with card detail, comments, drag-and-drop
- **Chat** — Multi-agent chat with party mode, voice input, streaming, session persistence
- **Content Pipelines** — Multi-step agent workflows for content creation
- **Autopilot** — Goal-driven autonomous execution with human feedback loop
- **Notifications** — SSE with auto-reconnect, exponential backoff, sound alerts
- **Terminal** — Sandboxed shell with command blocklist and cwd restriction
- **Vault** — AES-256-GCM encrypted secret storage
- **CORS + Rate Limiting** — Middleware-level protection on all API routes
