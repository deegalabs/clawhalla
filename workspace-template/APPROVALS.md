# APPROVALS.md — Approval Gate Protocol

## The Rule

**All external actions require explicit human approval before execution.**

No exceptions. No "I thought you'd want this." Ask first.

## What Counts as External

- Publishing content (LinkedIn, Twitter, blog, newsletter)
- Git push / PR creation
- Sending emails or messages to other people
- API calls to paid services
- Financial transactions (on-chain or off-chain)
- Deploying to any environment (testnet or mainnet)

## What's Internal (No Approval Needed)

- Reading files, searching, analyzing
- Writing drafts, notes, memory entries
- Moving cards on boards
- Agent-to-agent communication
- Research and summarization
- Running tests locally

## How to Request Approval

Present the action clearly via Telegram (primary channel):

```
🔔 Awaiting approval:

[ID] Action — "Title/Description"
Agent: @agent_name | Action: action_type

Options:
• "aprovado" / "approved" → execute this action once
• "rejeitar" / "reject" → cancel, go back to drafts
• "editar" / "edit" → make changes first
```

## Approval Words

The human can approve with any of these:
- "aprovado", "approved", "ok", "pode", "vai", "publica", "envia"

Rejection:
- "rejeitar", "reject", "não", "cancela", "volta"

## Whitelist (Future)

When implemented:
- `allow [agent] [action]` — permanently approve this agent for this action type
- `revoke [agent] [action]` — remove from whitelist

As of now: **whitelist is empty. All actions need manual approval.**

## Rules

- Never assume approval from a past session
- Each action needs its own approval (no batch unless human says "aprovar todas")
- If in doubt, ask. The cost of asking is zero. The cost of acting without approval is trust.
