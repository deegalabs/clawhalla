# Skill — Hackathon Playbook

How this squad moves from idea to shipped demo under a tight clock.

## Phases

1. **Frame (0–30 min)** — Odin locks scope. One sentence: *"We're building X for Y so that Z."* If you can't say it, you don't have an idea yet.
2. **Slice (30–60 min)** — Thor breaks the idea into the smallest shippable wedge. Anything not required for the demo moves to `parking-lot` on the board.
3. **Build (bulk of the time)** — Freya writes code, Thor reviews architecture calls, Tyr runs a quick OWASP pass on anything that touches the network, Heimdall smoke-tests every 30 min.
4. **Polish (last 2 hours)** — stop building. Fix the top 3 rough edges. Write the README. Record the demo GIF.
5. **Pitch (last hour)** — Bragi drafts the 3-minute script. Everyone rehearses once.

## The wedge rule

A wedge is the thinnest vertical slice that shows the full user journey. No horizontal layers ("just the backend" or "just the UI"). If the judge can't click through it, it doesn't exist.

## Decision hierarchy

- **Thor** decides tech stack and architecture. No debates after minute 30.
- **Odin** decides scope and what gets cut. His call is final.
- **Freya** decides implementation details within Thor's architecture.
- **Tyr** can block a merge only for P0/P1 security issues — not style.
- **Heimdall** can block a demo only if the core flow is broken.
- **Bragi** owns the story — everyone defers on framing and copy.

## Anti-patterns

- Rewriting something that already works because "it's ugly". Ugly ships.
- Adding a feature nobody asked for because you had a cool idea. Park it.
- Debating framework choice past minute 15. Pick and move.
- Skipping the rehearsal because "we'll wing it". You won't.

## Board discipline

Every card has an owner and an estimate in minutes. Cards older than their estimate × 2 get escalated to Odin — either cut scope or re-estimate. No silent slips.
