# ClawHalla Architecture

## System Overview

```
Host Machine
  └── Docker Container (clawhalla)
        ├── OpenClaw Gateway (:18789)     — Agent runtime, sessions, crons
        ├── Mission Control (:3000→:3333) — Dashboard, APIs, real-time
        ├── Workspace (/home/clawdbot/.openclaw/workspace/)
        │     ├── company/          — Org structure, policies, governance
        │     ├── projects/         — Board (YAML), memory, ADRs
        │     ├── personas/         — 15 agent persona templates
        │     ├── skills/           — Domain-specific knowledge (28 files)
        │     ├── squads/           — Squad workspaces (dev, blockchain, clop, product)
        │     ├── methodology/      — AI-AGIL, operational cycle
        │     └── memory/           — Daily notes, MEMORY.md
        ├── Agents (/home/clawdbot/.openclaw/agents/)
        │     └── {agent}/agent/    — AGENTS.md, auth-profiles, models
        └── Contracts (/home/clawdbot/clawhalla-repo/contracts/)
              ├── src/              — AgentRegistry, LicenseNFT, Marketplace
              └── test/             — Foundry test suite (70+ tests)
```

## Data Architecture

### Dual Data Model (ADR-003)
```
SQLite (MC-created)          YAML (Agent-created)
├── tasks                    ├── projects/*/board/tasks.yaml
├── activities               ├── projects/*/board/stories.yaml
├── approvals                ├── projects/*/board/sprints.yaml
├── secrets (AES-256)        └── projects/*/board/epics.yaml
└── search_index (FTS5)

Merged via /api/board/sync → Tasks Kanban page
```

### Real-time Pipeline
```
File change (YAML, MD)
  → chokidar watcher detects
    → SQLite: activity logged
    → FTS5: search index updated
    → SSE: event pushed to browsers
      → Dashboard: activity feed refreshes
      → Tasks: kanban board refreshes
      → Memory/Docs: search results update
```

## Agent Hierarchy (4 Tiers)

```
Tier 0 — Platform (1 agent)
  Claw 🦞 (sonnet-4-5) — System controller, never codes

Tier 1 — Executive (3 agents)
  Odin 👁️ (sonnet-4-6) — CTO, dev squad chief
  Vidar ⚔️ (sonnet-4-6) — Blockchain architect, blockchain squad chief
  Saga 🔮 (sonnet-4-6) — CPO, product squad chief

Tier 2 — Management (3 agents)
  Thor ⚡ (sonnet-4-5) — Tech lead, coordinates dev team
  Frigg 👑 (haiku-4-5) — Coordinator/PA, manages clop cabinet
  Tyr ⚖️ (opus-4-6) — Security auditor (ONLY opus user)

Tier 3 — Execution (8 agents)
  Freya ✨, Heimdall 👁️‍🗨️, Völund 🔧 — Dev squad
  Sindri 🔥, Skadi ❄️ — Blockchain squad
  Mimir 🧠, Bragi 🎭, Loki 🦊 — Clop cabinet (social media)
```

## Mission Control Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + Inter font |
| Database | SQLite + Drizzle ORM |
| Search | SQLite FTS5 (porter stemming, 200+ docs) |
| Real-time | SSE + chokidar file watcher |
| Wallet | wagmi + viem (Base L2) |
| Encryption | AES-256-GCM (scrypt key derivation) |

## Smart Contract Architecture (Base L2)

```
AgentRegistry ←── Marketplace ──→ LicenseNFT
    │                  │                │
    │ Templates        │ Purchases      │ ERC-721
    │ (metadata,       │ (royalty       │ (license
    │  price,          │  splits,       │  tokens,
    │  royalty)        │  platform      │  transferable)
    │                  │  fee 2.5%)     │
    └──────────────────┴────────────────┘
                       │
                  Base L2 (low gas)
```

## API Architecture (ADR-002)

Browser NEVER calls gateway directly. All via MC API routes (server-side proxy).

```
Browser ──→ MC API Routes ──→ OpenClaw Gateway
                │
                ├── /api/gateway/*     — Proxy to gateway
                ├── /api/board/*       — YAML board operations
                ├── /api/search        — FTS5 search
                ├── /api/vault         — Encrypted secrets
                ├── /api/agents/*      — Agent factory + coverage
                ├── /api/packs         — Pack installer
                ├── /api/git           — Git operations
                ├── /api/linkedin      — LinkedIn API
                ├── /api/feedback      — Learning system
                └── /api/sse           — Real-time events
```

## Security

- No ports exposed by default
- Gateway bound to 127.0.0.1 only
- Secrets encrypted with AES-256-GCM in SQLite
- Smart contracts audited (12 findings resolved)
- Two-step ownership transfer on all contracts
- Pause mechanism for emergency stops
- Zero address checks on all critical setters
- Daniel approves ALL external actions (Lei de Aprovação)
