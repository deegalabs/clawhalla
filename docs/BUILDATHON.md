# ClawHalla Buildathon Workshop

> Walkthrough for running a ClawHalla demo on top of a pre-provisioned
> OpenClaw VPS during the ipe.city buildathon.

## Context — what each participant already has

Before the workshop starts, every participant has been given a VPS. The VPS image ships with:

- Docker running a bare `ghcr.io/openclaw/openclaw:2026.2.12` container (service name `moltbot-clawdbot-1`)
- The OpenClaw gateway listening on port **47716**, bound to `0.0.0.0` (publicly exposed)
- A pre-generated bearer token in the container env (`CLAWDBOT_GATEWAY_TOKEN`)
- OpenAI (`openai/gpt-5.1-codex`) configured as the primary model provider
- A workspace at `/home/node/clawd` inside the container
- Telegram plugin enabled on the gateway

Important: **the VPS does not have ClawHalla itself.** It has bare OpenClaw. ClawHalla is what we install on the participant's laptop and use to drive the remote gateway.

## What ClawHalla adds on top

| | Bare OpenClaw VPS | With ClawHalla |
|---|---|---|
| Gateway exposure | `0.0.0.0:47716` — public, token-only | Tunneled through SSH — gateway stays loopback-only in practice |
| Client UI | Static Control UI served by the gateway | Full Mission Control (19 screens) on the laptop |
| Squad management | Manual via CLI / workspace files | Installable squad packs, boards, chat, approvals |
| Credentials transport | Bearer token traveling over HTTP | SSH channel — token never leaves the laptop↔VPS pipe |

The demo value-add is: **fix the exposure, add the ergonomics, give them a real team of agents.**

## Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────┐
│  Participant laptop          │        │  Participant VPS           │
│                              │        │                            │
│  ┌────────────────────────┐  │        │  ┌──────────────────────┐  │
│  │ Mission Control        │  │        │  │ Docker:              │  │
│  │ http://localhost:3333  │  │        │  │  moltbot-clawdbot-1  │  │
│  └───────────┬────────────┘  │        │  │  OpenClaw gateway    │  │
│              │ HTTP          │        │  │  0.0.0.0:47716       │  │
│              ▼               │        │  └──────────▲───────────┘  │
│  127.0.0.1:18789             │        │             │              │
│              ▲               │   SSH  │  127.0.0.1:47716           │
│              │               │ tunnel │             ▲              │
│  ┌────────────────────────┐  │        │             │              │
│  │ clawhalla CLI          │──┴────────┴─────────────┘              │
│  │ manages the tunnel     │  │                                      │
│  └────────────────────────┘  │                                      │
└──────────────────────────────┘        └────────────────────────────┘
```

Traffic path: MC on laptop → `http://127.0.0.1:18789` → SSH tunnel → VPS `127.0.0.1:47716` → Docker proxy → container → gateway.

The VPS's public `0.0.0.0:47716` binding stays there (we can't change it without the organizer's cooperation), but participants won't use it directly. The teaching point is: **treat the tunnel as the only path in**.

## Prerequisites on the laptop

- Git
- Node 20 or newer (required for the ClawHalla CLI)
- One of:
  - Docker + Docker Compose (Path A — recommended)
  - pnpm (Path B — MC runs natively)
- An SSH key. Passwordless auth to the VPS (event org gives participants either a key or a throwaway password — in the latter case, use `ssh-copy-id` once before the workshop)

## Workshop timeline (90 minutes)

| Block | Duration | Topic |
|---|---|---|
| 0 | 5 min | Why ClawHalla (dual-layer pitch, the "squad for the buildathon" framing) |
| 1 | 10 min | Install ClawHalla on the laptop (CLI + MC) |
| 2 | 5 min | Open the SSH tunnel (`clawhalla connect`) — show `status` |
| 3 | 10 min | Start Mission Control, confirm it sees the gateway |
| 4 | 10 min | Tour: boards, chat, memory, squads |
| 5 | 10 min | Install the hackathon squad |
| 6 | 15 min | Create a project + board, capture a real event idea |
| 7 | 20 min | Dispatch the first task — watch the squad vibecode |
| 8 | 5 min | Q&A, cleanup |

## Block 1 — Install ClawHalla on the laptop

Clone the repo and build the CLI.

```bash
git clone https://github.com/deegalabs/clawhalla.git ~/clawhalla
cd ~/clawhalla/apps/cli
pnpm install
pnpm build
pnpm link --global
clawhalla --version   # should print 0.1.0
```

**Path A — MC via Docker:**

```bash
cd ~/clawhalla
cp .env.example .env
# Edit .env and set GATEWAY_TOKEN — see Block 3 for where to get it.
docker compose -f docker-compose.mc.yml up -d
```

**Path B — MC natively (no Docker):**

```bash
cd ~/clawhalla/apps/mission-control
pnpm install
# GATEWAY_URL and GATEWAY_TOKEN are set at launch — see Block 3.
```

## Block 2 — Open the SSH tunnel

Use an ssh_config alias for cleanness. Edit `~/.ssh/config`:

```
Host ipe-vps
    HostName <your-vps-ip>
    Port <ssh-port>          # e.g. 22022
    User <your-vps-user>     # e.g. root
    IdentityFile ~/.ssh/<your-key>
    IdentitiesOnly yes
```

Then:

```bash
clawhalla connect ipe-vps \
  --alias ipe \
  --remote-gateway-port 47716 \
  --remote-bridge-port 47717
```

**Expected output:**

```
Connecting to ipe-vps as "ipe"

·  Probing SSH connectivity...
✓  SSH reachable.
·  Allocated local ports  18789 (gateway) → 18790 (bridge)
·  Spawning SSH tunnel (detached)...
✓  Tunnel up (pid <pid>)

  Alias              ipe
  Local gateway      http://127.0.0.1:18789
  Local bridge       http://127.0.0.1:18790
  Remote target      ipe-vps:22

  Mission Control should point OPENCLAW_GATEWAY to http://127.0.0.1:18789
  Disconnect later:  clawhalla disconnect ipe
```

Verify the tunnel:

```bash
clawhalla status
curl -sS http://127.0.0.1:18789/        # should return an HTML page titled "OpenClaw Control"
```

Note the display cosmetic: `ipe-vps:22` reflects the default SSH port from the parser, not the real port from ssh_config. The underlying ssh(1) call uses the right port. A polish pass will make the display honest.

Note on the bridge port: bare OpenClaw on the workshop image runs **single-port**. Port 47717 does not exist on the VPS, so forwarding it is a no-op — the local bind succeeds but any traffic sent to `127.0.0.1:18790` will fail. MC only hits the gateway on 18789, so this does not break the demo. A future `--no-bridge` flag will clean this up.

## Block 3 — Start Mission Control

First, grab the gateway token from the VPS. You'll need SSH access:

```bash
ssh ipe-vps 'docker inspect moltbot-clawdbot-1 \
  --format "{{range .Config.Env}}{{println .}}{{end}}" | grep CLAWDBOT_GATEWAY_TOKEN'
```

The output line is `CLAWDBOT_GATEWAY_TOKEN=<64-hex-chars>`. Copy the value.

**Path A — Docker MC:**

```bash
cd ~/clawhalla
echo "GATEWAY_TOKEN=<paste-token-here>" >> .env
docker compose -f docker-compose.mc.yml up -d
```

MC is now at http://localhost:3333.

**Path B — native MC:**

```bash
cd ~/clawhalla/apps/mission-control
GATEWAY_URL=http://127.0.0.1:18789 \
GATEWAY_TOKEN=<paste-token-here> \
pnpm dev
```

MC is at http://localhost:3000.

**Sanity check:** MC's top-bar health indicator should turn green within a few seconds. If it stays red, see Troubleshooting.

## Block 4 — Quick tour

Show the audience five things, fast:

1. **Dashboard** — live agent stats (empty at first, will fill up).
2. **Boards** — drag-and-drop kanban. Create a throwaway card to demonstrate.
3. **Chat** — multi-agent chat with streaming. Talk to Claw (the Chief Orchestrator).
4. **Memory** — every agent has its own. RAG + FTS5 search over the workspace.
5. **Settings → Vault** — AES-256-GCM-encrypted secrets. Show where the gateway token lives.

Keep it a tour, not a click-through of every feature. You're selling the fact that one tool centralizes everything.

## Block 5 — Install the hackathon squad

MC → **Marketplace** (or **Squad Packs**) → pick **Hackathon** → install.

This copies the squad template from `squads/templates/hackathon/` into the container's workspace (`/home/node/clawd/squads/hackathon/`) and registers the agents with the gateway.

The template currently contains Thor (tech lead) and Tyr (security auditor). **Before the workshop, enrich it with:**

- **Odin** — product lead / scope / user stories
- **Freya** — senior developer / implementation
- **Loki** — frontend / UX prototypes
- **Bragi** — pitch / README / demo video script

This enrichment is tracked as a separate task (P1 in the pre-workshop checklist).

## Block 6 — Create a project + board, capture a real idea

1. MC → **Projects** → **New project**. Name: pick something concrete the event just discussed. Example: `ipe-builder-match`.
2. MC → **Boards** → **New board**. Link it to the project. Columns: `Backlog` / `Doing` / `Review` / `Done`.
3. Add 3 to 5 cards. Keep them small enough to produce visible movement in ~20 minutes.

Suggested seed cards for `ipe-builder-match`:

- "Define tech stack (Freya + Thor — ADR document)"
- "Build static landing page with skill-tag form (Loki)"
- "Wire form to local JSON store (Freya)"
- "Security review of user-input handling (Tyr)"
- "Write demo README + pitch script (Bragi)"
- "Define scope + user stories (Odin)"

## Block 7 — Dispatch the first task

MC → **Chat** → pick **Claw** (Chief Orchestrator) → paste the project intent:

> Claw, we have a new project `ipe-builder-match`. The goal is a minimal web page where buildathon participants can tag themselves with skills and find teammates. Delegate this to the hackathon squad. Break it into tasks, assign them to the board, and start executing. Report progress as cards move.

Watch the board. Cards should flow from Backlog → Doing → Review → Done as agents pick them up.

### Talking points while agents work

- **Agents commit code themselves.** They use git credentials pre-provisioned in the container vault.
- **MC is the window, not the engine.** The laptop can close — as long as the SSH tunnel is alive, agents keep running on the VPS. Reconnect later with `clawhalla connect` to resume the view.
- **Approval gates are live.** Any action that leaves the VPS (push to a public repo, send a message, call an external API) pauses for approval via Telegram. Show the Telegram prompt in the projector.
- **Each agent has a personality file.** Open `squads/hackathon/thor.prompt.md` in an editor on the laptop — show that the "team culture" is just markdown.

## Block 8 — Cleanup

```bash
clawhalla disconnect ipe
# Path A
docker compose -f docker-compose.mc.yml down
# Path B
# Ctrl-C the pnpm dev process
```

The VPS keeps running — the organizers own that. Participants can reconnect tomorrow from any machine with the same `clawhalla connect ipe-vps` command and pick up where they left off.

## Troubleshooting

### `clawhalla connect` exits with "SSH probe failed"

- The probe runs `ssh -o BatchMode=yes -o ConnectTimeout=5 ipe-vps true`. If this fails:
  - SSH key not in ssh-agent or not added to the VPS (`ssh-copy-id` didn't run).
  - Wrong host in ssh_config.
  - VPS firewall blocked the source IP (rare — workshop VPSs are open).
- Run `ssh -v ipe-vps true` manually to see the full handshake.
- Password-only VPS: re-run with `--skip-probe`. The tunnel will prompt interactively.

### Tunnel exits immediately after "Spawning SSH tunnel"

- `ExitOnForwardFailure=yes` means ssh died because the local port couldn't bind. Run `clawhalla status` — likely a stale entry on 18789. Disconnect it:
  ```bash
  clawhalla disconnect --all
  clawhalla connect ipe-vps ...
  ```
- Alternatively, another process owns 18789 on the laptop. `ss -tlnp | grep 18789` to see who.

### MC shows gateway offline

- From the laptop (not the container): `curl http://127.0.0.1:18789/` should return the OpenClaw Control HTML. If it doesn't, the tunnel is not up — fix that first.
- If running MC in Docker: confirm `host.docker.internal` resolves from inside the container:
  ```bash
  docker exec clawhalla-mc getent hosts host.docker.internal
  ```
- Confirm `GATEWAY_TOKEN` in `.env` matches the VPS container env.
- Test the authenticated path directly:
  ```bash
  curl -sS -X POST \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"tool":"system.health","args":{},"requestId":"test"}' \
    http://127.0.0.1:18789/tools/invoke
  ```
  A `404 Tool not available` means auth passed and the gateway is reachable (the tool name is just wrong). A `401 Unauthorized` means the token is wrong.

### Agents refuse to push to git

- They need credentials in the VPS container vault. The workshop VPS image does not pre-provision them — participants add a personal access token via MC → **Settings → Vault** → `git_token`.
- Never paste tokens in the chat window.

## Security note — the public gateway

The workshop VPSs bind OpenClaw on `0.0.0.0:47716`. This is not how ClawHalla recommends deploying — it exposes the gateway (and its bearer token) to the internet. The SSH tunnel pattern this workshop teaches is the mitigation: participants use the tunnel as the only path in, and after the event they should ask the organizer to rebind the gateway to `127.0.0.1`.

Post-workshop action items for organizers:

- Rebind OpenClaw gateway to loopback (`CLAWDBOT_GATEWAY_BIND=127.0.0.1`)
- Rotate the bearer token (it has been shared with every participant and typed into every shell history)
- Close port 47716 at the firewall

## Validated against a real VPS

This walkthrough was tested end-to-end against a workshop VPS on 2026-04-08. The CLI's `connect`, `status`, and `disconnect` commands and the HTTP forwarding path (including bearer auth) all work.

What has **not** been validated yet:

- MC in Docker (`docker-compose.mc.yml`) reaching the tunnel via `host.docker.internal` on Linux — the path is wired but not yet exercised end-to-end.
- MC native (`pnpm dev`) reaching the tunnel.
- Hackathon squad installation against this specific OpenAI-backed gateway (the model configured is `openai/gpt-5.1-codex`, not Anthropic — some squad prompts may need adjustment).
- Real agent dispatch producing code commits.

These are the next things to close. See `TASKS.md`.
