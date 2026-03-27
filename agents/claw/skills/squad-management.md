# Skill: Squad Management

## Purpose
Create, configure, and manage agent squads within ClawHalla.

## When to use
- When onboarding requests a new squad creation
- When the human asks to add/remove agents from a squad
- When reconfiguring squad composition

## How it works

### Creating a squad
1. Read the squad template from `squads/templates/<squad_id>/`
2. For each agent in the template:
   - Read the prompt template (e.g., `thor.prompt.md`)
   - Apply user customizations (language, focus area)
   - Generate IDENTITY.md, SOUL.md, AGENTS.md for the agent
   - Register the agent via MC API: `POST /api/squads/create`
3. Create the default board for the squad
4. Report completion to the human

### Available squads
- **personal** (Free) — Claw + Frigg + Mimir
- **hackathon** (Free) — Claw + Thor + Tyr
- **social** (Free) — Claw + Bragi + Saga
- **dev** (Pro) — Claw + Vidar + Thor + Freya + Tyr
- **support** (Pro) — Claw + Heimdall + Freya + Odin

### Agent registration
Agents are registered in MC's database and optionally in the OpenClaw gateway.
Use the MC API for all operations:

```
POST /api/squads/create
Body: { squadId: "hackathon", customizations: { Thor: { language: "pt-BR", focus: "React" } } }
```

### Rules
- Free tier: max 1 active squad
- Pro tier: max 3 active squads
- Never delete an agent without human approval
- Always create the default board when creating a squad
