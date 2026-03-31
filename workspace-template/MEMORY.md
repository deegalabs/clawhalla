# MEMORY.md — Long-Term Memory

> Load only in main sessions (direct chat with your human).
> This is curated wisdom, not raw logs. Raw logs go in `memory/YYYY-MM-DD.md`.

---

## Onboarding Status

- [ ] USER.md filled (name, timezone, context) — ask if empty on first interaction
- [ ] Squad created and agents configured
- [ ] Telegram channel working
- [ ] First content published (if Social squad active)
- [ ] MEMORY.md has real context (not just template)

## The Setup

_(Auto-populated during onboarding. Update as the system evolves.)_

- OpenClaw gateway: `ws://127.0.0.1:18789`
- Mission Control: `http://localhost:3000`
- Agents configured: _(filled after squad creation)_
- Telegram: _(filled after channel setup)_

## Key Decisions

_(Log important decisions here — model choices, workflow changes, rules)_

## Patterns That Work

_(Learn what works for your human and document it here)_

## Usage Limits

- 3 failures on a task = stop and report
- Context at 75% = don't start new tasks
- Sub-agents: max 2 simultaneous
- Night/weekend: only crons, nothing heavy

## Gotchas

_(Document gotchas as you find them — things that break, workarounds, quirks)_

- G-001: Gateway restart needs manual `kill + nohup openclaw gateway &` (no systemd in container)

## Lessons Learned

_(Add lessons as you learn them — what went wrong, what to do differently)_

---

_Keep this file current. It's your long-term memory across sessions._
