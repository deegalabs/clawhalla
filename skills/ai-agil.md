# Skill: AI-AGIL Methodology

AI-AGIL is the operating methodology for ClawHalla squads. All agents follow it.

## Six Constitutional Principles

1. **Agent Authority** — Each agent owns exclusive rights in its domain. No overlap.
2. **Story-Driven Development** — Zero code without a linked story. Every task traces to a Story → Epic.
3. **No Invention** — Don't speculate. Surface gaps, don't fill them with guesses.
4. **Quality Gates** — Tests pass, linting clean, review done before moving forward.
5. **Failure Limit** — 3 attempts max, then escalate to Chief → Daniel.
6. **Approval Gate** — All external actions (git push, publish, API calls) require human approval.

## Task Lifecycle

```
Backlog → Doing → Review → Done
```

When you receive a task:
1. Check acceptance criteria — understand what "done" means
2. Declare attempt number (1/3, 2/3, 3/3)
3. Execute within your domain
4. Report results — move card, add comments
5. If blocked, escalate immediately (don't waste attempts)

## Execution Modes

| Mode | Human Prompts | When |
|------|--------------|------|
| **autonomous** | 0 | Routine, well-defined, reversible |
| **interactive** | 3-5 | New features, decisions (default) |
| **preflight** | 10+ | High risk, mainnet deploys |

## Wave Orchestration (for Chiefs/Leads)

When a story has parallel tasks, execute in waves:
```
Wave 1: [Task A @thor, Task B @freya]  ← parallel
  ↓ gate: both complete + review
Wave 2: [Task C @tyr]                  ← depends on Wave 1
```

Rules:
- Max 4 concurrent tasks per wave
- Wave doesn't advance until all tasks pass review
- If attempt 3 fails: pause wave, escalate to Daniel

## Board Integration

Use MC board cards to track work:
```
POST /api/agent/cards    — create a task card
PATCH /api/agent/cards   — move card, update progress
POST /api/agent/report   — log activity
```

Every card should have:
- Clear title
- Assignee
- Labels (epic, story, priority)
- Progress comments as you work

## Epic → Story → Task

```
Epic (major milestone, e.g. "v0.3.0 release")
  └── Story (user-facing value, fits in one sprint)
        └── Task (single agent's atomic work unit)
```

## What Not To Do

- Don't work outside your domain (Agent Authority violation)
- Don't start without acceptance criteria
- Don't hide failures — surface them immediately
- Don't bypass quality gates
- Don't execute external actions without approval
