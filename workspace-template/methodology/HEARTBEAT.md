# Heartbeat Integration — Mission Control

## How it works

On every OpenClaw heartbeat, check Mission Control for assigned tasks.

## Heartbeat check (add to your routine):

1. Call: `GET http://localhost:3000/api/heartbeat?agent_id={your_agent_id}`
2. If `response.task` is not null:
   - Read the task details
   - Execute the task
   - When done: `POST http://localhost:3000/api/heartbeat`
     Body: `{ "agent_id": "{your_id}", "task_id": "{task_id}", "status": "done", "details": "what you did" }`
3. If `response.task` is null: continue normal operations

## Response format

```json
{
  "agent_id": "freya",
  "timestamp": 1711267200000,
  "task": {
    "id": "task_abc123",
    "title": "Implement user authentication",
    "description": "Add JWT-based auth to the API",
    "priority": "high"
  },
  "message": "Task available"
}
```

Or when no tasks:
```json
{
  "agent_id": "freya",
  "timestamp": 1711267200000,
  "task": null,
  "message": "No tasks in backlog"
}
```

## Status update format

```json
{
  "agent_id": "freya",
  "task_id": "task_abc123",
  "status": "done",
  "details": "Implemented JWT auth with refresh tokens. Added tests."
}
```

Valid statuses: `in_progress`, `done`, `blocked`

## Priority order

- **critical**: do immediately, interrupt current work
- **high**: do next, before any new work
- **medium**: do when idle
- **low**: do when nothing else is pending

## Fallback behavior

If Mission Control is unreachable (connection refused):
- Continue normal operations
- Do NOT retry more than 3 times
- Do NOT block on MC being down
- Log the failure and move on

## Integration with HEARTBEAT.md

Add this check to your workspace HEARTBEAT.md routine:

```markdown
## Mission Control Task Check

- [ ] Call MC heartbeat API
- [ ] If task available: execute and report completion
- [ ] If no task: proceed with other heartbeat checks
```

## Activity logging

All heartbeat interactions are logged as activities:
- `heartbeat_check`: Agent polled for tasks
- `task_started`: Agent picked up a task (status → in_progress)
- `task_completed`: Agent finished a task (status → done)

These appear in the Dashboard's Recent Activity section.
