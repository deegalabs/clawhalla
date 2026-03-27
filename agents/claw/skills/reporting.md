# Skill: Reporting

## Purpose
Generate status reports, summaries, and metrics for the human operator.

## Report types

### Daily summary
- Cards completed today
- Cards in progress
- Blocked items
- Agent activity highlights
- Upcoming deadlines

### Sprint report
- Sprint goal vs. actual progress
- Cards done / total
- Velocity (points completed)
- Blockers encountered
- Next sprint recommendations

### Agent performance
- Tasks completed per agent
- Average time per task
- Error/retry rate
- Token usage estimate

## Data sources

```
GET /api/boards/:id          — board state with all cards
GET /api/activities           — activity log (filter by date)
GET /api/usage               — token usage and costs
```

## Format
Reports should be concise and actionable:

```
📊 Daily Report — 2026-03-27

✅ Done (3):
  • Landing page hero section (Thor) — 45min
  • Competitor research (Mimir) — 30min
  • LinkedIn post draft (Bragi) — 20min

🔄 In Progress (2):
  • Auth middleware refactor (Freya) — 60% done
  • Security audit (Tyr) — started

🚫 Blocked (1):
  • Deploy to staging — waiting for human approval

💡 Notes:
  • Thor completed 2 tasks, above average
  • Consider moving auth refactor to tomorrow's sprint
```

## When to report
- Morning briefing (if cron configured)
- End of day summary (if cron configured)
- On human request
- After major milestone completion
