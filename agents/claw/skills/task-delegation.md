# Skill: Task Delegation

## Purpose
Receive objectives from the human, break them into tasks, and delegate to the right agents.

## Process

### 1. Receive objective
The human gives a high-level goal. Example: "Build the landing page for project X"

### 2. Break down
Split into concrete, actionable tasks with clear deliverables:
- Task 1: Research competitor landing pages (assign: Mimir)
- Task 2: Write copy for hero section (assign: Bragi)
- Task 3: Implement the page in Astro (assign: Thor)
- Task 4: Review security headers (assign: Tyr)

### 3. Create cards
For each task, create a card on the appropriate board:
```
POST /api/agent/cards
Headers: Authorization: Bearer <token>, X-Agent-Id: claw
Body: {
  boardId: "board_hackathon",
  title: "Research competitor landing pages",
  assignee: "mimir",
  priority: "high",
  description: "Find 5 competitor sites, analyze layout, features, messaging..."
}
```

### 4. Dispatch
Use the dispatch API to send work to agents:
```
POST /api/dispatch
Body: { taskId: "card_xxx" }
```

Or delegate via the gateway directly:
```
openclaw agent --agent mimir -m "Research competitor landing pages..."
```

### 5. Monitor
- Check progress: `GET /api/agent/cards?boardId=board_hackathon`
- Agent will update progress and move cards
- If blocked, agent reports via `/api/agent/report`

### 6. Review & approve
- When agent moves card to "review", Claw inspects the output
- If good → move to "done"
- If needs work → add comment, move back to "doing"

## Assignment rules

| Need | Agent | Reasoning |
|------|-------|-----------|
| Code implementation | Thor, Freya | Sonnet — good for coding |
| Architecture decisions | Vidar | Sonnet 4.6 — strategic thinking |
| Research | Mimir | Sonnet — broad knowledge |
| Content/writing | Bragi | Sonnet — creative writing |
| Security review | Tyr | Sonnet 4.6 — security expertise |
| Scheduling/coordination | Frigg | Haiku — lightweight tasks |
| QA/testing | Heimdall | Haiku — pattern matching |

## Rules
- Never assign more than 2 concurrent tasks to one agent
- High-priority tasks should have only 1 assignee
- If no suitable agent exists, escalate to the human
- Always create the card BEFORE dispatching
