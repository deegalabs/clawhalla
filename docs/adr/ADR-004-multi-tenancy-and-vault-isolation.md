# ADR-004: Multi-Tenancy Architecture and Vault Isolation

**Status:** Accepted (updated)
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
controls.clawhalla.xyz
│
│  Mission Control IS the SaaS product.
│  Enterprise features (.ee.ts) + infra scripts handle multi-tenancy.
│  No separate orchestrator app — MC + infra tooling (Terraform/K8s).
│
├── Reverse proxy (routes user123.controls.clawhalla.xyz → container)
├── Billing (Stripe, gated via .ee.ts in MC)
├── Auth (SSO/SAML/OIDC, gated via .ee.ts in MC)
├── Provisioner (infra scripts — create/destroy tenant containers)
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

### 3. Monorepo with Dual License (n8n model)

After evaluating both approaches (2 repos vs monorepo), we chose **single monorepo** with dual licensing. The team is a solo developer + AI agents — maintaining two repos in sync is unnecessary overhead at this stage.

**Repository structure:**

```
deegalabs/clawhalla                    # single monorepo
├── apps/
│   └── mission-control/               # MIT — the product (self-hosted AND SaaS)
│       ├── src/
│       │   ├── app/                   #   UI + API routes
│       │   ├── lib/
│       │   │   ├── billing.ee.ts      #   Stripe (enterprise)
│       │   │   ├── auth-sso.ee.ts     #   SAML/OIDC (enterprise)
│       │   │   ├── audit.ee.ts        #   Advanced audit (enterprise)
│       │   │   └── ...                #   Core libs (MIT)
│       │   └── ...
├── packages/
│   ├── agents/                        # MIT — agent personas + skills
│   ├── squads/                        # MIT — squad configurations
│   └── shared/                        # MIT — shared utilities
├── docker/                            # MIT — Dockerfiles
├── infra/                             # Provisioning scripts (Terraform/K8s)
├── docs/                              # MIT — documentation + ADRs
├── LICENSE.md                         # MIT (everything except .ee.ts files)
└── LICENSE_EE.md                      # Enterprise (.ee.ts files)
```

Mission Control IS the product in both modes. There is no separate SaaS app.
- **Self-hosted:** `docker compose up` — MC runs standalone
- **SaaS:** Same MC image, deployed as one container per tenant via infra scripts

**What's MIT (free, self-hosted):**
- Mission Control (full UI + all APIs)
- Gateway integration
- All agents and squads
- Vault, boards, campaigns, chat, content, autopilot
- Docker setup and deployment

**What's Enterprise (LICENSE_EE — `.ee.ts` files inside MC):**
- Billing (Stripe integration)
- SSO/SAML/OIDC authentication
- Advanced audit logs and compliance
- Team management and RBAC
- SLA guarantees
- All gated by license key at runtime — same binary, features unlock with key

**What monetizes:**
- ClawHalla Cloud (controls.clawhalla.xyz) — hosted SaaS, subscription per tenant
- Enterprise license — self-hosted with SSO, audit, teams
- Premium squad packs — advanced personas and skills on marketplace

**Why monorepo over 2 repos:**
- Solo dev + agents — no overhead of cross-repo sync
- Atomic PRs that touch core + enterprise
- Single CI pipeline
- Enterprise code visible but licensed — value is in execution, brand, and ecosystem (proven by n8n, GitLab, Supabase)

**Enterprise file convention (same as n8n):**
- Enterprise features use `.ee.ts` suffix: `auth-saml.ee.ts`, `audit-stream.ee.ts`
- Enterprise directories use `.ee` suffix: `modules/sso.ee/`
- Runtime gating via license key check — no feature flags needed

## Consequences

### Positive

- **Strong isolation** — Container boundary prevents all cross-tenant data access
- **Simple scaling** — Add containers, not database partitions
- **Open source integrity** — The self-hosted version IS the full product
- **SQLite stays** — No need to migrate to Postgres for row-level security
- **Familiar model** — Same pattern used by n8n Cloud, GitLab SaaS, Supabase
- **Dev velocity** — One repo, one CI, atomic changes across core + enterprise
- **No sync overhead** — Solo dev doesn't waste time keeping repos aligned

### Negative

- **Resource overhead** — Each tenant runs a full container (~200-500MB RAM)
- **Cold starts** — Suspended containers take seconds to resume
- **Updates** — Rolling updates across N containers is more complex than updating one shared DB
- **Cost floor** — Minimum infrastructure cost per tenant is higher than shared DB
- **Code visibility** — Enterprise code is visible in the public repo (but licensed)

### Mitigations

- Use container hibernation for inactive tenants (suspend after 30min idle)
- Lightweight base image (node:24-slim, ~180MB)
- Orchestrator handles rolling updates with health checks
- Free tier can share containers with namespace isolation (future optimization)
- LICENSE_EE.md clearly restricts commercial use of enterprise code

## Alternatives Considered

### 1. Two separate repos (core public + SaaS private)
- **Pro:** Enterprise code fully hidden from competitors
- **Con:** Cross-repo sync overhead, duplicate CI, harder to make atomic changes
- **Deferred:** May reconsider if team grows to 10+ devs where access control matters more.

### 2. Single DB with row-level security (Postgres RLS)
- **Pro:** Lower resource cost, simpler infrastructure, enables cross-tenant analytics
- **Con:** Requires migrating from SQLite to Postgres, complex RLS policies, agents can still bypass RLS if they access the DB directly
- **Deferred:** Not chosen as primary isolation, but may complement container isolation when cross-tenant queries are needed (admin dashboard, global analytics).

### 3. Database-per-tenant (multiple SQLite files)
- **Pro:** Lower overhead than full containers
- **Con:** Agents still share filesystem, gateway, and process. One compromised agent could access another tenant's SQLite file.
- **Deferred:** Not sufficient as sole isolation boundary, but could be used within a container if one container serves multiple workspaces (Team plan).

### 4. Vault proxy (exec endpoint)
- **Pro:** Agents never see secrets, server-side execution
- **Con:** Limited flexibility, every integration needs proxy support, maintenance burden
- **Deferred:** Likely needed in v2+ when agents call external APIs autonomously (DeFi, social). Defense-in-depth within the container, not a replacement for container isolation.
