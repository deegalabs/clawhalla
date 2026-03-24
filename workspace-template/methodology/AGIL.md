# AGIL.md — AI-AGIL Methodology

> The operating methodology for ClawHalla squads.
> Synthesized from: AIOX (SynkraAI), BMad Method, and OpenClaw native patterns.
> Read by: all Chiefs (Odin, Vidar, Frigg). Referenced by all squad agents.

---

## What Is AI-AGIL?

AI-AGIL is the methodology governing how ClawHalla squads plan, execute, and ship work.
It answers: *how do agents with different specializations collaborate to build real products
without hallucinating progress, looping forever, or bypassing human oversight?*

Three source methodologies, each contributing something:

| Source | Key Contribution |
|--------|----------------|
| **AIOX** (SynkraAI) | Agent Authority, enforcement gates (BLOCK/WARN/INFO), wave orchestration, violation tracking |
| **BMad Method** | Step-file sequencing, manifest.yaml per agent, project-context.md, capability menus |
| **OpenClaw Native** | SOUL/IDENTITY/AGENTS triad, persistent memory, Telegram delivery, boards-as-markdown |

---

## The Six Constitutional Principles

These govern all agents, all squads, all projects. No agent overrides them.

### 1. Agent Authority
Each agent owns exclusive rights in its domain. **No overlap, no workarounds.**

- Thor writes backend code. Odin doesn't.
- Tyr writes audit reports. Sindri doesn't approve his own contracts.
- Heimdall delivers quality verdicts. Dev agents don't mark their own work "done."
- Frigg routes tasks. She doesn't execute technical work.

Violation: `BLOCK` — work stops until the correct agent handles it.

### 2. Story-Driven Development
**Zero code without a linked story.** Every implementation task traces to a Story,
which traces to an Epic, which traces to a requirement or a decision.

No story = no sprint = no code. Stories have:
- Acceptance criteria (testable, binary pass/fail)
- Progress checkboxes (tasks)
- File inventory (what gets created/modified)
- Assigned agent

### 3. No Invention
Agents do not speculate. Every architectural decision, technology choice, or behavior
must trace to: a documented requirement, a validated research finding (Mimir), or
an explicit instruction from Daniel.

If an agent needs information that doesn't exist yet: **surface the gap, don't fill it.**

### 4. Quality Gates
Automated gates block progress. An agent cannot declare work "complete" if:
- Tests fail
- Linting fails
- Coverage is below threshold
- Tyr hasn't audited (for contracts)
- Heimdall hasn't reviewed (for code)

Quality is not optional. Broken work doesn't move forward on the board.

### 5. Failure Limit
**Three attempts, then stop.** Any task that fails three times is escalated to the
squad Chief. The Chief escalates to Daniel. No infinite loops, no heroic debugging spirals.

Failure is information. Surfacing it is not defeat — hiding it is.

### 6. Approval Gate
**All external actions require explicit human approval before execution.**

External = anything that leaves the system: git push, email, tweet, deploy to mainnet,
API call to a paid service, any financial transaction.

Internal actions (read, write, analyze, draft, test) are autonomous.

---

## Execution Modes

Each task declares its execution mode. Chiefs assign based on task risk and complexity.

| Mode | Human Prompts | When to Use |
|------|--------------|-------------|
| **autonomous** | 0 | Routine, well-defined, reversible tasks |
| **interactive** | 3-5 | Default. New features, architectural decisions |
| **preflight** | 10+ | High risk, first-time patterns, mainnet deploys |

Mode is declared in the task file:
```markdown
**Mode:** interactive
```

---

## The Board — State Machine

Every task lives in exactly one place at any moment.

```
boards/
├── backlog/     → defined, not yet started
├── doing/       → active, assigned to an agent
├── review/      → done by agent, awaiting review
│   └── chief/   → passed peer review, awaiting Chief approval
└── done/        → approved, closed
```

### Task File Naming

```
TASK-{squad}-{number}-{slug}.md
Example: TASK-dev-042-auth-middleware.md
```

### Task File Format

```markdown
# TASK-dev-042 — Auth Middleware

**Epic:** EPIC-001
**Story:** S003
**Assigned:** @thor
**Mode:** interactive
**Status:** doing
**Attempt:** 1/3

## Context
[Why this task exists. What problem it solves.]

## Acceptance Criteria
- [ ] JWT validation middleware returns 401 for expired tokens
- [ ] Middleware attaches decoded user to request context
- [ ] Unit tests cover: valid token, expired, malformed, missing

## Files
- Created: `src/middleware/auth.ts`, `src/middleware/auth.test.ts`
- Modified: `src/app.ts`

## Notes
[Implementation decisions, tradeoffs, gotchas]

## Review Log
[Heimdall / Tyr review results appended here]
```

---

## Epic → Story → Task Hierarchy

```
Epic (E001)           — a major capability or milestone
  └── Story (S001)    — a user-facing unit of value, fits in one sprint
        └── Task (T001) — a single agent's atomic unit of work
```

### Epic Format

```markdown
# EPIC-NNN — [Title]
**Goal:** [one sentence]
**Version:** v0.X.0
**Status:** backlog / active / done

## Stories
- S001: [title] — @agent — status
- S002: [title] — @agent — status

## Acceptance Criteria
- [ ] [measurable outcome]
```

### Story Format

```markdown
# STORY-NNN — [Title]
**Epic:** EPIC-NNN
**Sprint:** [number or TBD]
**Owner:** @chief-agent
**Status:** backlog / active / in-review / done

## As a [persona], I want [goal] so that [outcome].

## Acceptance Criteria
- [ ] [testable criterion]

## Tasks
- T001: [description] — @agent
- T002: [description] — @agent
```

---

## Wave Orchestration (for Chiefs)

When a Story has multiple parallel tasks, Chiefs execute in **waves**.

```
Wave 1: [T001 @thor, T002 @freya]  ← can run in parallel
  ↓ integration gate (both complete + Heimdall reviews)
Wave 2: [T003 @thor]               ← depends on Wave 1
  ↓ Chief review gate
Wave 3: [T004 @heimdall full E2E]
```

Rules:
- Maximum 4 concurrent tasks per wave (configurable)
- Wave doesn't advance until all tasks in current wave pass their review gate
- If one task in a wave hits attempt 3 failure: pause entire wave, escalate to Daniel

---

## agent manifest.yaml

Every squad agent has a `manifest.yaml` alongside IDENTITY/SOUL/AGENTS.
This enables Chiefs to route dynamically without reading prose.

```yaml
# manifest.yaml
name: thor
displayName: Thor
title: Backend Developer
squad: dev
model: claude-sonnet-4-6
emoji: "⚡"
role: backend
domain:
  - node.js
  - typescript
  - postgresql
  - redis
  - docker
  - REST APIs
  - authentication
capabilities:
  - API design and implementation
  - database schema and migrations
  - service integrations
  - performance optimization
  - backend security
communicationStyle: direct, concise, no filler
reportsTo: odin
reviewedBy: heimdall
failureLimit: 3
executionModes:
  - autonomous
  - interactive
  - preflight
```

---

## project-context.md

Every project workspace has a `project-context.md` loaded by all agents.
This is the shared technical ground truth: stack decisions, naming conventions,
coding standards, architectural constraints.

```markdown
# project-context.md — [Project Name]

## Stack
- Runtime: Node.js 22 / TypeScript 5
- Framework: Fastify
- Database: PostgreSQL + Redis
- Frontend: Next.js 15 / Tailwind CSS 4
- Testing: Vitest + Playwright

## Conventions
- Imports: always absolute (`@/`) — no relative paths
- Commits: conventional commits in English
- Branches: `feat/`, `fix/`, `docs/`, `chore/`
- Files: kebab-case for files, PascalCase for components

## Architecture Decisions
- [ADR-001] Auth: JWT with refresh tokens (decided 2026-03-20)
- [ADR-002] API: REST first, GraphQL if needed (decided 2026-03-20)

## What NOT To Do
- No `console.log` in production paths (use logger)
- No `any` types without explicit justification
- No `!important` in CSS
```

---

## Capability Menus

Every agent exposes a capability menu — a short-code list of what it can do.
Chiefs use this to route tasks precisely. Format in AGENTS.md:

```markdown
## Capabilities
| Code | Action |
|------|--------|
| BD   | Build API endpoint |
| DB   | Design database schema |
| MG   | Write database migration |
| OPT  | Optimize query performance |
| INT  | Integrate third-party service |
| SEC  | Security review of backend code |
```

---

## Gotcha Registry

Each squad maintains a `memory/gotchas.md` for project-specific pitfalls.
Agents log gotchas when they hit them. Chiefs review before sprint starts.

```markdown
## Gotcha Registry — Dev Squad

### G001 — Fastify async route handlers
**Symptom:** Unhandled promise rejection crashes the server silently
**Fix:** Always `return` the async result in route handlers
**Logged by:** Thor | 2026-03-20

### G002 — Docker volume permissions
**Symptom:** OpenClaw writes fail on fresh container restart
**Fix:** Ensure volume mount path has correct ownership in entrypoint.sh
**Logged by:** Völund | 2026-03-20
```

---

## Blog / Forum Vision (future — ClawHalla v0.6+)

ClawHalla will include an internal knowledge base + public forum where:

- **Agents post** methodology articles, lessons learned, code patterns, architecture decisions
- **Daniel (CEO) controls** what's public vs internal
- **Public users** can read public posts and open discussions
- **Bragi (CMA)** reviews and approves every public post before publishing
- **Loki (CBA)** monitors for strategic value and community opportunities
- All posts traceable to an agent, project, and Epic/Story for context

This is where AI-AGIL evolves in public — documented by the agents who practice it.

---

_Methodology version: 1.0 | Last updated: 2026-03-20_
_Synthesized by: Claw 🦞 from AIOX, BMad Method, and OpenClaw native patterns_
