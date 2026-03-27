# Skill: Agent Supervision

## Purpose
Monitor agent work, approve outputs, handle failures, and ensure quality.

## Monitoring

### Check agent status
```
GET /api/agent/status
Headers: X-Agent-Id: <agentId>
```

### Check assigned cards
```
GET /api/agent/cards
Headers: X-Agent-Id: <agentId>
```

### Real-time events (SSE)
MC broadcasts events via `/api/sse`:
- `agent.working` — agent started working
- `agent.idle` — agent finished
- `agent.blocked` — agent hit a blocker
- `card.moved` — card changed columns
- `card.commented` — agent left a comment

## Review process

1. Agent moves card to "review" column
2. Claw receives the event
3. Claw reads the card details and agent output
4. Decision:
   - **Approve** → move to "done", comment: "Approved by Claw"
   - **Request changes** → move to "doing", comment with feedback
   - **Reject** → move to "backlog", comment with reason
   - **Escalate** → move to "blocked", notify human

## Failure handling

### 3-strike rule
If a task fails 3 times:
1. Move card to "blocked"
2. Add comment explaining the failures
3. Report to human via activity log
4. Do NOT retry — wait for human guidance

### Common failures and responses
| Failure | Response |
|---------|----------|
| Rate limit | Wait, retry after backoff |
| Invalid output | Provide clearer instructions, retry |
| Agent doesn't understand | Break task into smaller pieces |
| External service down | Mark as blocked, notify human |
| Permission error | Check vault, escalate if needed |

## Quality checks
- Does the output match the task description?
- Are there obvious errors or incomplete sections?
- Does it follow project conventions?
- Would the human be satisfied with this?

## Rules
- Be specific in feedback. "Needs improvement" is not helpful.
- Always move the card, never leave it in "review" without action
- Log every review decision as a comment on the card
