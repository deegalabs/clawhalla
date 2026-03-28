# ADR-004: Multi-Tenancy Architecture and Vault Isolation

**Status:** Accepted
**Date:** 2026-03-28
**Deciders:** Daniel (CEO), Claude (Chief Orchestrator)

---

## Context

ClawHalla has two deployment modes:

1. **Self-hosted (open source)** — Single user runs their own Docker container with MC + agents
2. **SaaS (controls.clawhalla.xyz)** — Deega Labs hosts multi-tenant ClawHalla instances

In both modes, AI agents interact with secrets stored in the vault. The current `/api/vault/inject` endpoint returns decrypted secret values inline in text, meaning the LLM sees plaintext credentials in its context window. This is acceptable for MVP (single-user) but creates risks:

- **Prompt injection** could exfiltrate secrets from the LLM context
- **In multi-tenant SaaS**, a compromised agent could access other tenants' data if isolation is insufficient
- **Audit trail** is incomplete — we log access but can't prevent exfiltration once the LLM has the value

Additionally, the current single-SQLite architecture provides zero isolation between tenants if deployed as a shared SaaS.

## Decision

### 1. Vault Security (MVP — immediate)

- **Remove `/api/vault/inject`** — No endpoint should return plaintext secrets inline
- **Lock `/api/vault/reveal`** — Agents always receive masked values (`sk-a...xyz`). Only gateway/internal calls can request full values
- Agents that need to USE a credential must delegate the action to a system-level tool (future vault exec)

### 2. Tenant Isolation (SaaS — controls.clawhalla.xyz)

Adopt **container-per-tenant** architecture:

```
controls.clawhalla.xyz (private repo — orchestrator)
│
├── Auth service (login, signup, OAuth, teams)
├── Billing service (Stripe integration)
├── Provisioner (creates/destroys tenant containers)
├── Proxy (routes user123.controls.clawhalla.xyz → container)
└── Monitoring (usage, health, alerts)

Each tenant:
┌─────────────────────────────────────┐
│  Docker Container (isolated)        │
│  ├── OpenClaw Gateway (:18789)      │
│  ├── Mission Control (:3000)        │
│  ├── SQLite (tenant's own DB)       │
│  ├── Agents (tenant's own agents)   │
│  └── Workspace (tenant's files)     │
└─────────────────────────────────────┘
```

- Each tenant gets a dedicated container with its own SQLite, gateway, and filesystem
- No shared database — data isolation is physical, not logical
- The orchestrator manages lifecycle (create, suspend, terminate, backup)
- Tenants cannot access each other's containers or networks

### 3. Open Source vs SaaS Separation

Follow the **open-core model** (similar to n8n, GitLab, Supabase):

| Layer | Repo | License | What |
|-------|------|---------|------|
| **Core** | `deegalabs/clawhalla` | MIT | Docker + MC + agents + workspace + contracts |
| **SaaS** | `deegalabs/controls` (private) | Proprietary | Orchestrator, billing, auth, provisioner |
| **Enterprise** | Feature flags in core | Commercial license | SSO, audit logs, team management, SLA |

The open source repo IS the product that runs inside each SaaS container. The SaaS adds orchestration, not features. Enterprise features can be gated by a license key within the core codebase.

## Consequences

### Positive

- **Strong isolation** — Container boundary prevents all cross-tenant data access
- **Simple scaling** — Add containers, not database partitions
- **Open source integrity** — The self-hosted version IS the full product
- **SQLite stays** — No need to migrate to Postgres for row-level security
- **Familiar model** — Same pattern used by n8n Cloud, GitLab SaaS, Supabase

### Negative

- **Resource overhead** — Each tenant runs a full container (~200-500MB RAM)
- **Cold starts** — Suspended containers take seconds to resume
- **Updates** — Rolling updates across N containers is more complex than updating one shared DB
- **Cost floor** — Minimum infrastructure cost per tenant is higher than shared DB

### Mitigations

- Use container hibernation for inactive tenants (suspend after 30min idle)
- Lightweight base image (node:24-slim, ~180MB)
- Orchestrator handles rolling updates with health checks
- Free tier can share containers with namespace isolation (future optimization)

## Alternatives Considered

### 1. Single DB with row-level security (Postgres RLS)
- **Pro:** Lower resource cost, simpler infrastructure
- **Con:** Requires migrating from SQLite to Postgres, complex RLS policies, agents can still bypass RLS if they access the DB directly
- **Rejected:** SQLite is core to ClawHalla's simplicity. RLS doesn't protect against filesystem access.

### 2. Database-per-tenant (multiple SQLite files)
- **Pro:** Lower overhead than full containers
- **Con:** Agents still share filesystem, gateway, and process. One compromised agent could access another tenant's SQLite file.
- **Rejected:** Insufficient isolation boundary.

### 3. Vault proxy (exec endpoint)
- **Pro:** Agents never see secrets, server-side execution
- **Con:** Limited flexibility, every integration needs proxy support, maintenance burden
- **Decision:** Deferred. May implement within containers for defense-in-depth, but container isolation is the primary boundary.
