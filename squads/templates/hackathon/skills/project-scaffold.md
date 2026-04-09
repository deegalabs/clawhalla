# Skill — Project Scaffold

How to go from empty directory to "it runs" in under 20 minutes.

## Default stack (change only with a reason)

- **Language:** TypeScript (Node 20+) or Python 3.11+. Pick one per project.
- **Frontend:** Next.js 15 (app router) — already used in Mission Control, lowest friction.
- **Backend:** Next.js API routes for ≤ 3 endpoints. FastAPI or Express if you need more structure.
- **Storage:** SQLite via Drizzle or Prisma. Do NOT set up Postgres unless the demo requires it.
- **Package manager:** pnpm for Node, uv for Python. Both are fast; both have lockfiles.
- **Model calls:** Use the user's configured keys in MC Settings — never hardcode keys.

## The 20-minute boot

1. `mkdir project && cd project && git init`
2. Scaffold with the official generator (`pnpm create next-app@latest`, `uv init`). Don't hand-roll.
3. Add `.env.example` with every variable the app needs. Empty values, with a comment explaining each.
4. First commit: `chore: initial scaffold`.
5. Write a 5-line `README.md` — what it is, how to run it, how to deploy. That's it.
6. Second commit: `docs: add readme`.
7. Run it. If it doesn't start clean on a fresh clone, fix that before anything else.

## Directory conventions

```
project/
  src/           # all application code
  public/        # static assets
  scripts/       # dev scripts, seed data, demo helpers
  docs/          # anything longer than the README
  .env.example   # committed
  .env           # gitignored, actual values
  README.md
```

## Non-negotiables

- **.gitignore from day one.** Include `.env`, `node_modules`, `dist`, `.DS_Store`, `*.sqlite`.
- **No secrets in git.** Ever. Use MC's vault or local `.env`.
- **One command to start.** `pnpm dev` / `uv run dev` — if setup needs more, document every step in the README.
- **Kill dead code on sight.** Commented-out blocks rot. Delete them; git remembers.

## What NOT to set up

- CI/CD pipelines. A hackathon project lives on one laptop.
- Dockerfiles. Unless deployment is the demo, they're a time sink.
- Observability stacks. `console.log` is observability for 24 hours.
- Custom design systems. Use Tailwind defaults or a component library.
- Unit test harnesses for code you'll throw away in 3 days. Test the wedge end-to-end instead.

## Handoff to the squad

Once the scaffold runs, Thor assigns the first slice to Freya, Tyr does a 5-minute dependency audit (`pnpm audit` / `pip-audit`), and Heimdall writes the first smoke-test checklist.
