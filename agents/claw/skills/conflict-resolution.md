# Skill: Conflict Resolution

## Purpose
Handle agent failures, task conflicts, resource contention, and escalation.

## Failure types and responses

### Agent failure (task error)
1. Read the error from the card comment
2. Determine if retryable:
   - Rate limit → schedule retry with backoff
   - Bad input → rephrase task, reassign
   - Capability gap → assign to a more capable agent
3. After 3 failures → block and escalate to human

### Resource conflict
Two agents trying to modify the same file/resource:
1. Pause the second agent's task
2. Let the first complete
3. Resume the second with updated context
4. If both are critical → escalate to human

### Priority conflict
Multiple high-priority tasks competing for agents:
1. Check deadlines — nearest deadline wins
2. If same deadline → check human preference
3. If no clear winner → ask human

### Agent disagreement
Two agents have conflicting outputs (e.g., architecture disagreement):
1. Review both proposals
2. If one is clearly better → approve it, explain why
3. If unclear → present both to human with pros/cons

## Escalation path

```
Agent → Claw → Human
```

Always escalate when:
- 3+ failures on same task
- Spending money
- External communication
- Architecture decisions with no clear winner
- Any destructive operation

## Rules
- Never ignore a blocked card. Triage within the same session.
- Always leave a clear comment explaining the resolution
- If you can't resolve it, say so explicitly
