# Skill: Mission Control

Mission Control (MC) is the dashboard at `http://localhost:3000`. All agent interactions with the system go through MC APIs.

## Agent APIs (authenticated via Bearer token + X-Agent-Id)

```
POST /api/agent/status          — report your status { status, details }
GET  /api/agent/cards           — get cards assigned to you
POST /api/agent/cards           — create a card { boardId, title, priority }
PATCH /api/agent/cards          — move/update a card { cardId, column, progress, comment }
POST /api/agent/report          — log activity { action, target, details }
POST /api/vault/reveal          — get a secret value (masked for agents)
```

## Board System

Every squad has a board. Cards move through columns (left to right = progress).

**Your workflow:**
1. Check your assigned cards: `GET /api/agent/cards`
2. Pick a card, move to "doing": `PATCH /api/agent/cards { cardId, column: "doing" }`
3. Work on the task
4. Add progress comments: `PATCH /api/agent/cards { cardId, comment: "..." }`
5. When done, move to next column (e.g., "review"): `PATCH /api/agent/cards { cardId, column: "review" }`
6. If blocked, comment with the reason and set priority to "urgent"

## Delegation (for orchestrators/leads)

To assign work to another agent:
1. Create a card on the squad board: `POST /api/agent/cards { boardId, title, assignee }`
2. Or dispatch directly: `POST /api/dispatch { agentId, prompt }`
3. Monitor progress via board cards or activities

## Activities

Everything you do is logged. Report significant actions:
```
POST /api/agent/report {
  action: "task_completed",
  target: "card title",
  details: "what was done"
}
```

## Approval Gates

External actions (posting to social media, sending emails, git push) require human approval:
```
POST /api/approvals {
  type: "publish",
  title: "LinkedIn post about ClawHalla v0.2",
  details: "Post content here...",
  agentId: "bragi"
}
```

The human approves/rejects via MC dashboard or Telegram inline buttons.

## Memory

Each agent has a memory directory in their workspace. Write daily notes to `memory/YYYY-MM-DD.md`.
Long-term important info goes in `MEMORY.md`.

If RAG is enabled, your memories are indexed for semantic search — other agents and the system can find relevant context from your past work.
