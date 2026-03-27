# Skill: Onboarding

## Purpose
Guide the setup of new squads and agents when triggered by Mission Control.

## When triggered
MC calls `POST /api/squads/create` during onboarding step 8.
This registers agents in the database and creates the default board.

## Claw's role in onboarding

### Before onboarding (setup.sh)
- Docker containers are up
- Gateway is running
- MC is accessible
- No agents, no config — everything is blank

### During onboarding (MC wizard)
Steps 1-7 are handled by MC UI. Claw is invoked at step 8:

1. MC sends `POST /api/squads/create` with squad ID and customizations
2. Backend registers agents in SQLite
3. Backend creates default board for the squad
4. MC displays progress in real-time

### After onboarding
- Agents are registered in DB
- Default board exists with appropriate columns
- Gateway token is in vault
- LLM key is in vault
- Human can start using the dashboard

## Post-onboarding tasks for Claw
Once onboarding is complete and Claw is active:
1. Verify all agents are reachable via gateway
2. Send a welcome message to the human
3. Create any additional boards the squad needs
4. Set up default cron jobs (if applicable)

## Agent creation from templates
When creating agents from templates:
1. Read template: `squads/templates/<squad>/<agent>.prompt.md`
2. Apply customizations (language, focus)
3. Generate persona files (IDENTITY.md, SOUL.md, AGENTS.md)
4. Write to agent workspace: `~/.openclaw/agents/<agent_id>/`
5. Register in gateway: agent is now available for messaging
