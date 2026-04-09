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
- The VPS root password OR a pre-existing SSH key trusted by the VPS. **You do not need to run `ssh-copy-id` yourself** — on the first `clawhalla connect`, the CLI generates a dedicated key at `~/.clawhalla/keys/id_ed25519` and installs it on the VPS with a single password prompt. Every run after that is passwordless.

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

Clone the repo and install the CLI with one script.

```bash
git clone https://github.com/deegalabs/clawhalla.git ~/clawhalla
cd ~/clawhalla
./scripts/install-cli.sh
clawhalla --version   # should print 0.1.0
```

The script uses whatever `pnpm` is already on PATH, otherwise enables
corepack (ships with Node 20+) and pins `pnpm@10.28.1`. It then builds
`apps/cli` and drops a symlink at `~/.local/bin/clawhalla`. If that
directory isn't on your PATH yet, the script prints the one-liner to fix it.

**Path A — MC via Docker (recommended):**

```bash
cd ~/clawhalla
cp .env.example .env
# Edit .env and set GATEWAY_TOKEN — see Block 3 for where to get it.
# docker compose up is run in Block 3 AFTER the tunnel is open.
```

**Path B — MC natively (no Docker):**

```bash
cd ~/clawhalla/apps/mission-control
pnpm install
# GATEWAY_URL and GATEWAY_TOKEN are set at launch — see Block 3.
```

## Block 2 — Open the SSH tunnel

One command, directly against the VPS IP and SSH port the organizer handed you:

```bash
clawhalla connect root@<vps-ip>:<ssh-port> \
  --alias ipe \
  --remote-gateway-port 47716 \
  --remote-bridge-port 47717 \
  --bind 0.0.0.0
```

- `--bind 0.0.0.0` is required for **Path A** (MC in Docker) on Linux so
  the container can reach the forward through `host.docker.internal`.
  On **Path B** (MC native), drop that flag — the default `127.0.0.1`
  bind is safer. See the security note at the bottom of this doc.
- `--remote-bridge-port 47717` is still passed so the flags match what
  a "real" deployment would use. Bare OpenClaw on the workshop image
  runs single-port (47717 does not exist on the VPS), so the local
  bind on 18790 is a no-op — MC only hits 18789 for the demo. A future
  `--no-bridge` flag will clean this up.

**First run on a fresh laptop** prompts for the VPS password exactly
once. Behind the scenes the CLI generates a managed ed25519 key,
installs it into the VPS `authorized_keys`, and re-probes:

```
Connecting to root@<vps-ip> as "ipe"

·  Probing SSH connectivity...
⚠  Remote doesn't trust our key yet — installing it on root@<vps-ip>.
   You will be prompted for the remote password ONCE. After this, all
   future `clawhalla connect` calls are passwordless.

root@<vps-ip>'s password: ••••••••
✓  Key installed. Re-probing...
✓  SSH reachable.
·  Allocated local ports  18789 (gateway) → 18790 (bridge) on 0.0.0.0
·  Spawning SSH tunnel (detached)...
✓  Tunnel up (pid <pid>)

  Alias              ipe
  Local gateway      http://0.0.0.0:18789
  Local bridge       http://0.0.0.0:18790
  Remote target      root@<vps-ip>:<ssh-port>

  Mission Control should point OPENCLAW_GATEWAY to http://host.docker.internal:18789
  Disconnect later:  clawhalla disconnect ipe
```

Second run and beyond: same command, no password prompt — the probe
just succeeds and the tunnel comes up in under a second.

Verify the tunnel:

```bash
clawhalla status
curl -sS http://127.0.0.1:18789/        # should return an HTML page titled "OpenClaw Control"
```

## Block 3 — Start Mission Control

First, grab the gateway token from the VPS. The CLI already set up
passwordless access, so `ssh root@<vps-ip> -p <ssh-port>` works
directly with the managed key:

```bash
ssh -i ~/.clawhalla/keys/id_ed25519 -o IdentitiesOnly=yes \
  -p <ssh-port> root@<vps-ip> \
  'docker inspect moltbot-clawdbot-1 \
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

### `clawhalla connect` exits with "Failed to install ClawHalla key on remote"

- The CLI tried to install its managed key but the interactive
  password prompt failed. Common causes:
  - Wrong password typed three times → run it again, slowly.
  - Running under a non-interactive shell (CI, tmux detached, piped
    stdin) → ssh falls back to `ssh_askpass` which isn't installed.
    Fix: run `clawhalla connect` directly in a real terminal.
  - The VPS disables password auth entirely (`PasswordAuthentication no`
    in sshd_config). Workshop VPSs don't, but if yours does: drop a
    pre-existing public key into `~/.ssh/authorized_keys` by hand,
    then re-run `clawhalla connect` — the probe will pass and the
    install branch won't fire.

### `clawhalla connect` exits with "SSH probe failed" (non-permission error)

- The probe runs `ssh -i ~/.clawhalla/keys/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=5 ...`. If this fails for a reason other than permission:
  - Host unreachable / wrong IP / wrong port.
  - VPS firewall blocked the source IP (rare — workshop VPSs are open).
- Run `ssh -v -i ~/.clawhalla/keys/id_ed25519 -p <port> root@<vps-ip> true` manually to see the full handshake.
- Password-only hosts that refuse BatchMode: re-run with `--skip-probe`. The tunnel will prompt interactively.

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

## Security notes

### The public gateway (VPS side)

The workshop VPSs bind OpenClaw on `0.0.0.0:47716`. This is not how ClawHalla recommends deploying — it exposes the gateway (and its bearer token) to the internet. The SSH tunnel pattern this workshop teaches is the mitigation: participants use the tunnel as the only path in, and after the event they should ask the organizer to rebind the gateway to `127.0.0.1`.

Post-workshop action items for organizers:

- Rebind OpenClaw gateway to loopback (`CLAWDBOT_GATEWAY_BIND=127.0.0.1`)
- Rotate the bearer token (it has been shared with every participant and typed into every shell history)
- Close port 47716 at the firewall

### `--bind 0.0.0.0` (laptop side)

`--bind 0.0.0.0` is necessary for Path A on Linux (so the MC container
can reach the forward via `host.docker.internal`), but it has a cost:
the forwarded ports become reachable from **every machine on the same
LAN as your laptop**. At an event with a shared wifi that is not
nothing — anyone who sniffs or guesses the gateway token reaches the
VPS through you.

Mitigations, in order of preference:

1. **Use Path B (native MC)** and drop `--bind`. The default
   `127.0.0.1` bind is only reachable from localhost.
2. **Use a personal hotspot** for the workshop so your LAN is just you.
3. **Rotate the VPS gateway token** immediately after the workshop
   (the organizers should do this anyway — see above).

The CLI prints a warning whenever `--bind 0.0.0.0` is set. Don't
ignore it on an event wifi.

## Validated against a real VPS

Tested end-to-end against a workshop VPS on 2026-04-08 (Linux host).
Full Path A flow green:

- `./scripts/install-cli.sh` — installs the CLI into `~/.local/bin`.
- `clawhalla connect root@<vps>:<port> --bind 0.0.0.0` — probes, auto-provisions the managed SSH key, installs it on the remote, opens the tunnel.
- `docker compose -f docker-compose.mc.yml up -d` — MC container boots from a root-owned bind mount, the entrypoint self-heals the volume ownership, migrations run, health shows `gateway: true`.
- Authenticated `POST /tools/invoke` from inside the MC container round-trips through the tunnel to the real VPS gateway (bearer auth accepted, structured JSON error returned for an unknown tool name — proof the gateway actually handled the request).
- `clawhalla disconnect --all` — tears down and removes the state entry.

What has **not** been validated yet:

- MC native (`pnpm dev`) reaching the tunnel (Path B).
- Hackathon squad installation against this specific OpenAI-backed gateway (the model configured is `openai/gpt-5.1-codex`, not Anthropic — some squad prompts may need adjustment).
- Real agent dispatch producing code commits.
- The `installKeyOnRemote` password branch against a fresh VPS with a human at the keyboard (unit-tested in isolation, but not rehearsed with a real password — needs one live dry-run before the workshop).

These are the next things to close.
