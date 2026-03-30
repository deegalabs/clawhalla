# Skill: ClawHalla System Knowledge

## Architecture

```
setup.sh → Docker containers (gateway + MC)
    ├── OpenClaw Gateway (ws://127.0.0.1:18789)
    │   └── Routes messages between agents, channels, LLMs
    └── Mission Control (http://localhost:3000)
        ├── Dashboard UI (React/Next.js)
        ├── SQLite database (agents, boards, cards, vault, activities)
        ├── Vault (AES-256-GCM encrypted secrets)
        ├── Boards Engine (generic project management)
        ├── SSE (real-time events)
        └── API (REST + WebSocket)
```

## Key APIs

### For agents (authenticated via Bearer token + X-Agent-Id):
- `POST /api/agent/status` — report status
- `GET/POST/PATCH /api/agent/cards` — manage assigned cards
- `POST /api/agent/report` — log activity
- `POST /api/vault/reveal` — get masked secret value (agents always receive masked)

### For gateway (authenticated via Bearer token):
- `GET /api/vault/credentials?provider=anthropic` — get LLM keys

### For UI (no auth — same-origin):
- `GET/POST /api/boards` — board CRUD
- `GET/POST /api/boards/:id/cards` — card CRUD
- `GET /api/sse` — real-time event stream
- Full board, task, agent, vault APIs

## Security model
- ALL secrets live in MC vault (encrypted SQLite)
- Gateway gets credentials via API, never from files
- Agents never see raw secrets — use $VARIABLE_NAME injection
- Human approval required for external actions

## Squad system
- Free: 1 squad (Personal, Hackathon, or Social)
- Pro: up to 3 squads
- Each squad has specialized agents + shared skills
- Board auto-created per squad

## Content Pipeline (Social squad)
```
Ideas → Researching → Writing → Review → Published
  │         │            │         │          │
  Saga    Saga/Bragi    Bragi    Claw→      Published
                                 Approval
```
- Saga: strategy, research, community monitoring
- Bragi: writing, platform adaptation
- Claw: reviews, requests human approval before publishing
- API: POST /api/content/publish, POST /api/approvals
- Approval via MC Dashboard or Telegram inline buttons

## Memory/RAG
- Per-agent SQLite with FTS5 + vector embeddings
- Config: Settings > Memory tab in MC
- Modes: RAG (semantic search), .md (file-based), Default (inherit)
- API: GET /api/memory/rag?q=query&agent=main

## Onboarding flow
1. Welcome → 2. LLM Provider → 3. Test → 4. Gateway Token → 5. Channel
→ 6. Squad → 7. Customize agents → 8. Create agents → 9. Done

## Important files
- `~/.openclaw/openclaw.json` — gateway config
- MC database: `./data/mission-control.db`
- Agent persona files: IDENTITY.md, SOUL.md, AGENTS.md
- Global skills: skills/*.md (copied to all agents)
- Squad skills: squads/templates/<squad>/skills/*.md
