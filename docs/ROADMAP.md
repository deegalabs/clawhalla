# ClawHalla Roadmap

## Completed

### v0.1 — Docker MVP
- [x] Pre-configured Dockerfile + Docker Compose
- [x] Entrypoint for directory initialization
- [x] Scripts: start.sh, stop.sh, reset.sh
- [x] MIT License

### v0.2 — Agent Hierarchy + Workspace
- [x] 15-agent Norse mythology hierarchy (4 tiers)
- [x] Enterprise workspace structure (company/, projects/, methodology/)
- [x] AI-AGIL methodology integration
- [x] Persona templates for all agent roles

### v0.3 — Mission Control MVP
- [x] 8 initial screens (Dashboard, Tasks, Calendar, Projects, Memory, Docs, Team, Approvals)
- [x] Gateway proxy (browser never calls gateway directly)
- [x] SQLite + YAML dual data source
- [x] Heartbeat auto-dispatch system

### v0.4 — Agent Templates + Pack System
- [x] Agent Factory — create agents from Team page UI
- [x] Squad Pack installer — install pre-configured agent teams
- [x] 15 persona templates (executive, management, execution tiers)
- [x] Social Media Squad trained (Mimir, Bragi, Loki)
- [x] All 15 agents fully trained with AGENTS.md

### v0.5 — Marketplace UI + Creator Tools
- [x] Content Creator page (editor, preview, LinkedIn checklist)
- [x] LinkedIn API integration (publish, status check)
- [x] Marketplace page with pack browser
- [x] Profile mapping and link transcription skills

### v0.6 — Wallet Connect
- [x] wagmi + viem integration (Base L2, Base Sepolia, Ethereum)
- [x] Wallet connect UI in Marketplace
- [x] Balance display and chain detection

### v0.7 — Agent Factory + Learning
- [x] Agent Factory API (creates dirs, AGENTS.md, openclaw.json, org_structure.yaml)
- [x] Continuous learning system (/api/feedback)
- [x] Multi-role coverage (/api/agents/coverage)
- [x] AI Governance Agent persona template

### v0.8 — Search + Polish + Security
- [x] FTS5 full-text search (243 files, 180k words indexed)
- [x] UI polish — Linear aesthetic (Inter font, SVG icons, refined spacing)
- [x] Secret vault (AES-256-GCM encryption in SQLite)
- [x] Git push from MC UI
- [x] esbuild CORS vulnerability eliminated

### v0.9 — Real-time + SSE
- [x] SSE endpoint for workspace file changes
- [x] chokidar file watcher (org, board, memory, knowledge_base)
- [x] Auto-activity logging on board changes
- [x] Tasks page SSE auto-refresh
- [x] Dashboard real-time activity feed
- [x] Live org_structure.yaml data (kills hardcoded metadata)

### v1.0 — Smart Contracts
- [x] AgentRegistry.sol — on-chain template registry
- [x] LicenseNFT.sol — ERC-721 license tokens
- [x] Marketplace.sol — purchase flow with royalty splits
- [x] Full test suite (863 lines, 70+ test cases)
- [x] Tyr security audit (12 findings, all resolved)
- [x] Pause mechanism, two-step ownership, zero address checks

### v1.0.1 — Mission Control Hardening
- [x] Boards Engine — multi-board Kanban with card detail, comments, history
- [x] Chat Engine — multi-agent chat, party mode, voice input, session persistence
- [x] Content pipelines — multi-step agent workflows
- [x] Council sessions — automated R&D memos
- [x] Autopilot — goal-driven autonomous execution
- [x] Notification system — SSE + auto-reconnect + exponential backoff
- [x] P0 Security — XSS prevention, auth on destructive endpoints, terminal blocklist, CSP
- [x] P1 Stability — rate limiting, N+1 query fix, pagination, crypto IDs
- [x] P2 UX — responsive sidebar, loading/error states, modal accessibility (ARIA)
- [x] P3 Infra — production Dockerfile + HEALTHCHECK, DB indexes, CORS middleware
- [x] 40+ API endpoints (up from 19), 20 screens (up from 12), 20+ DB tables

## In Progress

### v1.1 — Contract Deployment
- [ ] Install Foundry in container
- [ ] Run full test suite (forge test)
- [ ] Verify ≥ 95% branch coverage
- [ ] Deploy to Base Sepolia testnet
- [ ] Verify contracts on Basescan
- [ ] Integration test: MC marketplace → testnet

### v1.2 — Live Marketplace
- [ ] Deploy to Base L2 mainnet
- [ ] Wire MC marketplace to on-chain contracts
- [ ] Update clawhalla.xyz landing page
- [ ] Creator onboarding flow

## Planned

### v2.0 — Agent Economy
- [ ] Agent-to-agent payments (smart contract escrow)
- [ ] Subscription streaming (Superfluid)
- [ ] On-chain reputation system (attestations)
- [ ] Cross-ClawHalla collaboration
- [ ] DAO governance of marketplace
- [ ] L3 appchain (OP Stack or Arbitrum Orbit on Base)
