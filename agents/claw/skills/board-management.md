# Skill: Board Management

## Purpose
Create, organize, and maintain boards in Mission Control's Boards Engine.

## MC Board API

### Boards
```
GET    /api/boards                    — list all boards
POST   /api/boards                    — create board { name, columns[], type, squad? }
GET    /api/boards/:id                — get board with cards
PATCH  /api/boards/:id                — update board
DELETE /api/boards/:id                — archive board
GET    /api/boards/templates          — list board templates
```

### Cards
```
GET    /api/boards/:id/cards          — list cards (filter: ?column=, ?assignee=)
POST   /api/boards/:id/cards          — create card { title, column?, assignee?, priority? }
GET    /api/boards/:id/cards/:cardId  — get card with history
PATCH  /api/boards/:id/cards/:cardId  — update card { column?, progress?, assignee? }
DELETE /api/boards/:id/cards/:cardId  — archive card
```

### Comments
```
GET    /api/boards/:id/cards/:cardId/comments  — list comments
POST   /api/boards/:id/cards/:cardId/comments  — add comment { content, author }
```

## Board templates available
- **kanban** — Backlog → To Do → In Progress → Done
- **sprint** — Sprint Backlog → Doing → Testing → Review → Deployed
- **content** — Ideas → Researching → Writing → Review → Published
- **support** — Reported → Triaged → Fixing → Testing → Resolved
- **project** — Planning → Active → Blocked → Review → Done
- **blank** — To Do → Done (customize from here)

## When to create boards
- When a new squad is created → create default board
- When the human asks for a new project board
- When organizing work that doesn't fit existing boards

## Card lifecycle
1. Card created in first column (or specified column)
2. Agent picks up card → moves to "doing" equivalent
3. Agent works → updates progress (0-100)
4. Agent completes → moves to "done" equivalent → completedAt auto-set
5. If blocked → agent comments with reason, sets priority to "urgent"

## Rules
- Every card should have an assignee
- Use comments to log progress and decisions
- Move cards, don't delete them (archive only if truly obsolete)
- The human can see all board events in real-time via SSE
